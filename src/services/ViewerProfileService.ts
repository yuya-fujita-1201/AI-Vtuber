import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { ILLMService, LLMRequest } from '../interfaces';
import { OpenAIService } from './OpenAIService';

export type ViewerProfileSnapshot = {
  viewerId: string;
  estimatedPersonality: string[];
  communicationStyle: string[];
  favoriteTopics: string[];
  dislikedTopics: string[];
  mentionedFacts: string[];
  engagementScore: number;
  lastPositiveAt?: Date | null;
  lastNegativeAt?: Date | null;
};

type ProfileExtraction = {
  estimatedPersonality: string[];
  communicationStyle: string[];
  favoriteTopics: string[];
  dislikedTopics: string[];
  mentionedFacts: string[];
  sentiment?: 'positive' | 'negative' | 'neutral';
};

const extractionSchema = z.object({
  estimatedPersonality: z.array(z.string()).optional().default([]),
  communicationStyle: z.array(z.string()).optional().default([]),
  favoriteTopics: z.array(z.string()).optional().default([]),
  dislikedTopics: z.array(z.string()).optional().default([]),
  mentionedFacts: z.array(z.string()).optional().default([]),
  sentiment: z.enum(['positive', 'negative', 'neutral']).optional()
});

const normalizeList = (items: string[], limit: number): string[] => {
  const normalized = items
    .map(item => item.trim())
    .filter(Boolean)
    .map(item => item.length > 60 ? `${item.slice(0, 57)}...` : item);
  const unique = Array.from(new Set(normalized));
  return unique.slice(0, limit);
};

const decodeList = (value?: string | null): string[] => {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return parsed.map(item => String(item));
    }
  } catch {
    // fall through to split parsing
  }
  return value.split(/[\n,]/g).map(item => item.trim()).filter(Boolean);
};

const encodeList = (items: string[]): string | null => {
  if (items.length === 0) return null;
  return JSON.stringify(items);
};

const mergeLists = (existing: string[], incoming: string[], limit: number): string[] => {
  const merged = Array.from(new Set([...existing, ...incoming]));
  return merged.slice(0, limit);
};

export class ViewerProfileService {
  private llm: ILLMService;

  constructor(options: { llmService?: ILLMService } = {}) {
    this.llm = options.llmService ?? new OpenAIService();
  }

  public async getProfile(viewerId: string): Promise<ViewerProfileSnapshot | null> {
    if (!viewerId) return null;
    const profile = await prisma.viewerProfile.findUnique({ where: { viewerId } });
    if (!profile) return null;

    return {
      viewerId: profile.viewerId,
      estimatedPersonality: decodeList(profile.estimatedPersonality),
      communicationStyle: decodeList(profile.communicationStyle),
      favoriteTopics: decodeList(profile.favoriteTopics),
      dislikedTopics: decodeList(profile.dislikedTopics),
      mentionedFacts: decodeList(profile.mentionedFacts),
      engagementScore: profile.engagementScore ?? 0,
      lastPositiveAt: profile.lastPositiveAt ?? null,
      lastNegativeAt: profile.lastNegativeAt ?? null
    };
  }

  public async updateProfile(viewerId: string, message: string): Promise<void> {
    const trimmed = message.trim();
    if (!viewerId || !trimmed) {
      return;
    }

    const extraction = await this.extractProfile(trimmed);
    if (!extraction) {
      return;
    }

    const hasSignal = [
      extraction.estimatedPersonality.length,
      extraction.communicationStyle.length,
      extraction.favoriteTopics.length,
      extraction.dislikedTopics.length,
      extraction.mentionedFacts.length
    ].some(count => count > 0);

    if (!hasSignal && !extraction.sentiment) {
      return;
    }

    const existing = await prisma.viewerProfile.findUnique({ where: { viewerId } });
    const now = new Date();

    const mergedPersonality = mergeLists(
      normalizeList(decodeList(existing?.estimatedPersonality), 12),
      normalizeList(extraction.estimatedPersonality, 12),
      12
    );
    const mergedStyle = mergeLists(
      normalizeList(decodeList(existing?.communicationStyle), 12),
      normalizeList(extraction.communicationStyle, 12),
      12
    );
    const mergedFavorites = mergeLists(
      normalizeList(decodeList(existing?.favoriteTopics), 12),
      normalizeList(extraction.favoriteTopics, 12),
      12
    );
    const mergedDislikes = mergeLists(
      normalizeList(decodeList(existing?.dislikedTopics), 12),
      normalizeList(extraction.dislikedTopics, 12),
      12
    );
    const mergedFacts = mergeLists(
      normalizeList(decodeList(existing?.mentionedFacts), 20),
      normalizeList(extraction.mentionedFacts, 20),
      20
    );

    const data = {
      viewerId,
      estimatedPersonality: encodeList(mergedPersonality),
      communicationStyle: encodeList(mergedStyle),
      favoriteTopics: encodeList(mergedFavorites),
      dislikedTopics: encodeList(mergedDislikes),
      mentionedFacts: encodeList(mergedFacts),
      engagementScore: existing?.engagementScore ?? 0,
      lastPositiveAt: extraction.sentiment === 'positive' ? now : existing?.lastPositiveAt ?? null,
      lastNegativeAt: extraction.sentiment === 'negative' ? now : existing?.lastNegativeAt ?? null
    };

    if (!existing) {
      await prisma.viewerProfile.create({ data });
      return;
    }

    await prisma.viewerProfile.update({
      where: { viewerId },
      data
    });
  }

  private async extractProfile(message: string): Promise<ProfileExtraction | null> {
    const prompt = this.buildExtractionPrompt(message);
    try {
      const response = await this.llm.generateText(prompt);
      const parsed = this.parseExtraction(response);
      if (!parsed) {
        logger.warn('[ViewerProfileService] Failed to parse profile extraction response');
      }
      return parsed;
    } catch (error) {
      logger.warn('[ViewerProfileService] Profile extraction failed', error);
      return null;
    }
  }

  private buildExtractionPrompt(message: string): LLMRequest {
    const systemPrompt = [
      'You extract viewer profile facts from a single chat message.',
      'Return ONLY JSON that matches this schema:',
      '{ "estimatedPersonality": string[], "communicationStyle": string[], "favoriteTopics": string[], "dislikedTopics": string[], "mentionedFacts": string[], "sentiment": "positive"|"negative"|"neutral" }',
      'Rules:',
      '- Only include information explicitly stated by the speaker about themselves.',
      '- Keep each entry short (max 8-12 words).',
      '- If nothing is present, return empty arrays and omit sentiment.',
      '- Do NOT include speculation or sensitive info.'
    ].join('\n');

    return {
      systemPrompt,
      userPrompt: `Message: "${message}"`,
      temperature: 0.2,
      maxTokens: 300
    };
  }

  private parseExtraction(text: string): ProfileExtraction | null {
    const jsonText = this.extractJson(text);
    if (!jsonText) {
      return null;
    }

    try {
      const parsed = JSON.parse(jsonText);
      const result = extractionSchema.safeParse(parsed);
      if (!result.success) {
        return null;
      }
      return {
        estimatedPersonality: result.data.estimatedPersonality ?? [],
        communicationStyle: result.data.communicationStyle ?? [],
        favoriteTopics: result.data.favoriteTopics ?? [],
        dislikedTopics: result.data.dislikedTopics ?? [],
        mentionedFacts: result.data.mentionedFacts ?? [],
        sentiment: result.data.sentiment
      };
    } catch {
      return null;
    }
  }

  private extractJson(text: string): string | null {
    const trimmed = text.trim();
    if (!trimmed) return null;
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      return trimmed;
    }
    const firstBrace = trimmed.indexOf('{');
    const lastBrace = trimmed.lastIndexOf('}');
    if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
      return null;
    }
    return trimmed.slice(firstBrace, lastBrace + 1);
  }
}
