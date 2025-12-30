import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';

export type TopicHistorySummary = {
  topicName: string;
  normalizedName: string;
  totalMentions: number;
  firstDiscussedAt: Date;
  lastDiscussedAt: Date;
  lastViewerId?: string | null;
  lastSentiment?: string | null;
};

const SYNONYM_MAP: Record<string, string> = {
  reactjs: 'react',
  'react.js': 'react',
  vuejs: 'vue',
  'vue.js': 'vue',
  nodejs: 'node',
  'node.js': 'node'
};

const normalizeTopicName = (name: string): string => {
  const trimmed = name.trim();
  if (!trimmed) return '';

  const lowered = trimmed.toLowerCase();
  const stripped = lowered.replace(/[\s\-_]+/g, '');
  return SYNONYM_MAP[stripped] ?? stripped;
};

export class TopicService {
  public normalizeTopicName(name: string): string {
    return normalizeTopicName(name);
  }

  public async getTopicHistory(topicName: string): Promise<TopicHistorySummary | null> {
    const normalizedName = normalizeTopicName(topicName);
    if (!normalizedName) return null;

    const record = await prisma.topicHistory.findUnique({
      where: { normalizedName }
    });

    if (!record) {
      return null;
    }

    return {
      topicName: record.topicName,
      normalizedName: record.normalizedName,
      totalMentions: record.totalMentions,
      firstDiscussedAt: record.firstDiscussedAt,
      lastDiscussedAt: record.lastDiscussedAt,
      lastViewerId: record.lastViewerId ?? undefined,
      lastSentiment: record.lastSentiment ?? undefined
    };
  }

  public async updateTopicMention(
    topicName: string,
    viewerId?: string | null,
    sentiment?: string | null
  ): Promise<TopicHistorySummary> {
    const normalizedName = normalizeTopicName(topicName);
    if (!normalizedName) {
      throw new Error('Topic name is required');
    }

    const now = new Date();
    const updateData: Record<string, unknown> = {
      topicName,
      lastDiscussedAt: now,
      totalMentions: { increment: 1 }
    };

    if (viewerId) {
      updateData.lastViewerId = viewerId;
    }
    if (sentiment) {
      updateData.lastSentiment = sentiment;
    }

    try {
      const record = await prisma.topicHistory.upsert({
        where: { normalizedName },
        create: {
          topicName,
          normalizedName,
          totalMentions: 1,
          firstDiscussedAt: now,
          lastDiscussedAt: now,
          lastViewerId: viewerId ?? null,
          lastSentiment: sentiment ?? null
        },
        update: updateData
      });

      return {
        topicName: record.topicName,
        normalizedName: record.normalizedName,
        totalMentions: record.totalMentions,
        firstDiscussedAt: record.firstDiscussedAt,
        lastDiscussedAt: record.lastDiscussedAt,
        lastViewerId: record.lastViewerId ?? undefined,
        lastSentiment: record.lastSentiment ?? undefined
      };
    } catch (error) {
      logger.error('[TopicService] Failed to update topic history', error);
      throw error;
    }
  }
}
