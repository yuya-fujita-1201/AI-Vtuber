import { prisma } from '../lib/prisma';
import { config } from '../config/AppConfig';
import { logger } from '../lib/logger';
import { CharacterProfile, DEFAULT_CHARACTER_PROFILE } from '../types/CharacterProfile';

type CategoryKey = keyof CharacterProfile;

const CATEGORY_MAP: Record<string, CategoryKey> = {
  name: 'name',
  character_name: 'name',
  base_personality: 'basePersonality',
  personality: 'basePersonality',
  speech_style: 'speechStyle',
  speech: 'speechStyle',
  favorite_topic: 'favoriteTopics',
  favorite_topics: 'favoriteTopics',
  favorite: 'favoriteTopics',
  quirks: 'quirks',
  quirk: 'quirks',
  habit: 'quirks',
  dislike: 'dislikes',
  dislikes: 'dislikes',
  catchphrase: 'catchphrases',
  catchphrases: 'catchphrases',
  notes: 'notes',
  note: 'notes'
};

const JP_CATEGORY_MAP: Record<string, CategoryKey> = {
  名前: 'name',
  性格: 'basePersonality',
  人柄: 'basePersonality',
  口調: 'speechStyle',
  話し方: 'speechStyle',
  好きな話題: 'favoriteTopics',
  好み: 'favoriteTopics',
  口癖: 'catchphrases',
  癖: 'quirks',
  苦手: 'dislikes',
  注意: 'notes',
  備考: 'notes'
};

const normalizeCategory = (value: string): string => {
  return value.trim().toLowerCase().replace(/[\s\-]+/g, '_');
};

const cloneProfile = (profile: CharacterProfile): CharacterProfile => ({
  name: profile.name,
  basePersonality: [...profile.basePersonality],
  speechStyle: [...profile.speechStyle],
  favoriteTopics: [...profile.favoriteTopics],
  quirks: [...profile.quirks],
  dislikes: [...profile.dislikes],
  catchphrases: [...profile.catchphrases],
  notes: [...profile.notes]
});

export class CharacterService {
  private cachedProfile: CharacterProfile | null = null;
  private cacheExpiresAt = 0;
  private readonly cacheTtlMs: number;

  constructor(cacheTtlMs: number = config.character.traitCacheTtlMs) {
    this.cacheTtlMs = cacheTtlMs;
  }

  public async getCharacterProfile(forceRefresh = false): Promise<CharacterProfile> {
    const now = Date.now();
    if (!forceRefresh && this.cachedProfile && now < this.cacheExpiresAt) {
      return this.cachedProfile;
    }

    try {
      const traits = await prisma.characterTrait.findMany({
        where: { isActive: true },
        orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }]
      });

      const profile = this.buildProfileFromTraits(traits);
      this.cachedProfile = profile;
      this.cacheExpiresAt = now + this.cacheTtlMs;
      return profile;
    } catch (error) {
      logger.error('[CharacterService] Failed to load character traits', error);
      const fallback = cloneProfile(DEFAULT_CHARACTER_PROFILE);
      this.cachedProfile = fallback;
      this.cacheExpiresAt = now + this.cacheTtlMs;
      return fallback;
    }
  }

  public clearCache(): void {
    this.cachedProfile = null;
    this.cacheExpiresAt = 0;
  }

  private buildProfileFromTraits(traits: Array<{ category: string; value: string }>): CharacterProfile {
    if (!traits.length) {
      return cloneProfile(DEFAULT_CHARACTER_PROFILE);
    }

    const overrides: Partial<Record<CategoryKey, string[]>> = {};
    const extraNotes: string[] = [];
    let nameOverride: string | undefined;

    for (const trait of traits) {
      const rawValue = trait.value?.trim();
      if (!rawValue) continue;

      const normalized = normalizeCategory(trait.category);
      const jpMatch = JP_CATEGORY_MAP[trait.category.trim()];
      const key = jpMatch ?? CATEGORY_MAP[normalized];

      if (!key) {
        extraNotes.push(rawValue);
        continue;
      }

      if (key === 'name') {
        if (!nameOverride) {
          nameOverride = rawValue;
        }
        continue;
      }

      if (!overrides[key]) {
        overrides[key] = [];
      }
      overrides[key]?.push(rawValue);
    }

    if (extraNotes.length > 0) {
      overrides.notes = [...(overrides.notes ?? []), ...extraNotes];
    }

    const base = cloneProfile(DEFAULT_CHARACTER_PROFILE);

    return {
      name: nameOverride ?? base.name,
      basePersonality: overrides.basePersonality ?? base.basePersonality,
      speechStyle: overrides.speechStyle ?? base.speechStyle,
      favoriteTopics: overrides.favoriteTopics ?? base.favoriteTopics,
      quirks: overrides.quirks ?? base.quirks,
      dislikes: overrides.dislikes ?? base.dislikes,
      catchphrases: overrides.catchphrases ?? base.catchphrases,
      notes: overrides.notes ?? base.notes
    };
  }
}
