import path from 'path';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export type AppConfig = {
  env: {
    nodeEnv: string;
    dryRun: boolean;
  };
  paths: {
    rootDir: string;
    logDir: string;
  };
  logging: {
    level: LogLevel;
    console: boolean;
    file: {
      enabled: boolean;
      path: string;
    };
  };
  server: {
    webPort: number;
    corsOrigin: string;
    reloadSecret: string;
  };
  agent: {
    tickIntervalMs: number;
    recentCommentLimit: number;
    commentQueue: {
      maxSize: number;
      processingIntervalMs: number;
    };
    maxCommentsPerTick: number;
    monologue: {
      intervalMs: number;
      varianceMs: number;
      minIntervalMs: number;
    };
    preSpeechDelayMs: {
      min: number;
      max: number;
    };
    errorCooldownMs: number;
    shortCommentLength: number;
    speechDuration: {
      fallbackMinMs: number;
      perCharMs: number;
    };
    classifier: {
      useLLM: boolean;
      temperature: number;
      maxTokens: number;
    };
    topicHistory: {
      enabled: boolean;
    };
    memory: {
      consolidationMessageLimit: number;
      consolidationTemperature: number;
      consolidationMaxTokens: number;
      changeReqImportance: number;
      onTopicImportance: number;
    };
    moderation: {
      ngWord: {
        defaultDurationMs: number;
        maxLength: number;
      };
      mute: {
        defaultDurationMs: number;
      };
    };
  };
  emotion: {
    decay: number;
    historyWeight: number;
    historyContextWindow: number;
    historyScoreWindow: number;
    moodClamp: {
      min: number;
      max: number;
    };
    excitementBoost: number;
    angerPenalty: number;
    signalClampMax: number;
    thresholds: {
      angryMoodMax: number;
      excitedMoodMin: number;
      happyMoodMin: number;
      sadMoodMax: number;
    };
    lockStateDefaultMs: number;
    voiceMap: Record<string, { pitch: number; speed: number; intonation: number }>;
  };
  expression: {
    debounceMs: number;
  };
  storytelling: {
    theme: {
      default: string;
      lockMs: number;
      tokenPickLimit: number;
    };
    cooldowns: {
      twistMs: number;
      summaryMs: number;
      emotionMs: number;
    };
    twistActiveMs: number;
    golden: {
      scoreThreshold: number;
      forceThreshold: number;
      length: {
        long: number;
        medium: number;
      };
      lengthScore: {
        long: number;
        medium: number;
      };
      questionScore: number;
      exclaimScore: number;
      keywordScore: number;
    };
    depth: {
      max: number;
      deepDiveMin: number;
      heatedMin: number;
      closeOffTopicStreak: number;
      closeDepth: number;
      twistDepth: number;
      summaryDepth: number;
      summaryOffTopicStreak: number;
      summaryPenalty: number;
      goldenDepthBoost: number;
      normalDepthBoost: number;
      offTopicDepthPenalty: number;
    };
    vibe: {
      signalThreshold: number;
    };
    emotionLockDurations: {
      excitedGameMs: number;
      heatedMs: number;
      cozyMs: number;
      defaultMs: number;
    };
    trend: {
      decay: number;
    };
    extract: {
      minTokenLength: number;
      maxTokenLength: number;
    };
    recentNarrativeLimit: number;
  };
  prompts: {
    reply: {
      temperature: number;
      maxTokens: number;
    };
    monologue: {
      temperature: number;
      maxTokens: number;
    };
    narrative: {
      temperature: number;
      maxTokens: number;
      recentCommentLimit: number;
    };
    memory: {
      relevanceThreshold: number;
      maxImportanceStars: number;
    };
  };
  adapters: {
    fileReplay: {
      pollingIntervalMs: number;
    };
    youtube: {
      pollingIntervalMs: number;
      backoffInitialMs: number;
      backoffMaxMs: number;
      seenIdLimit: number;
      liveBroadcastMaxResults: number;
    };
    obs: {
      host: string;
      port: number;
    };
    vts: {
      host: string;
      port: number;
      pluginName: string;
      pluginDeveloper: string;
      maxReconnectAttempts: number;
      requestTimeoutMs: number;
      reconnectBackoffBaseMs: number;
      reconnectBackoffMaxMs: number;
    };
  };
  tts: {
    voicevox: {
      baseUrl: string;
      speakerId: number;
      timeoutMs: number;
    };
    mock: {
      previewLength: number;
    };
  };
  lipSync: {
    parameterId: string;
    frameDurationMs: number;
    volumeScale: number;
    smoothing: number;
    finalDelayMs: number;
  };
  volumeAnalyzer: {
    defaultFrameDurationMs: number;
    rmsScale: number;
  };
  memory: {
    chromaUrl: string;
    collectionName: string;
    embeddingModel: string;
    defaultImportance: number;
    searchLimit: number;
    streamMemoriesLimit: number;
    viewerMemoriesLimit: number;
    shortTermLimit: number;
    pruning: {
      decayDays: number;
      threshold: number;
    };
  };
  character: {
    traitCacheTtlMs: number;
  };
  llm: {
    provider: 'openai' | 'groq' | 'grok';
    requestTimeoutMs: number;
    retry: {
      maxAttempts: number;
      baseDelayMs: number;
      maxDelayMs: number;
    };
  };
  openai: {
    apiKey: string;
    baseUrl?: string;
    defaultModel: string;
    defaultTemperature: number;
    defaultMaxTokens: number;
  };
  xai: {
    apiKey: string;
    baseUrl: string;
    defaultModel: string;
    defaultTemperature: number;
    defaultMaxTokens: number;
  };
  groq: {
    apiKey: string;
    defaultModel: string;
    defaultTemperature: number;
    defaultMaxTokens: number;
  };
  news: {
    apiKey: string;
    baseUrl: string;
    language: string;
    maxResults: number;
    timeoutMs: number;
  };
};

const parseBoolean = (value: string | undefined, fallback = false): boolean => {
  if (value === undefined) {
    return fallback;
  }
  const normalized = value.trim().toLowerCase();
  if (['true', '1', 'yes', 'y'].includes(normalized)) return true;
  if (['false', '0', 'no', 'n'].includes(normalized)) return false;
  return fallback;
};

const parseNumber = (value: string | undefined, fallback: number): number => {
  if (value === undefined || value === '') {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const parseString = (value: string | undefined, fallback: string): string => {
  if (value === undefined) {
    return fallback;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
};

const parseLogLevel = (value: string | undefined, fallback: LogLevel): LogLevel => {
  if (!value) return fallback;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'debug' || normalized === 'info' || normalized === 'warn' || normalized === 'error') {
    return normalized;
  }
  return fallback;
};

const buildConfig = (): AppConfig => {
  const rootDir = process.cwd();
  const logDir = parseString(process.env.LOG_DIR, path.join(rootDir, 'logs'));

  return {
  env: {
    nodeEnv: process.env.NODE_ENV ?? 'development',
    dryRun: parseBoolean(process.env.DRY_RUN)
  },
  paths: {
    rootDir,
    logDir
  },
  logging: {
    level: parseLogLevel(process.env.LOG_LEVEL, 'info'),
    console: parseBoolean(process.env.LOG_CONSOLE, true),
    file: {
      enabled: parseBoolean(process.env.LOG_FILE_ENABLED, true),
      path: parseString(process.env.LOG_FILE, path.join(logDir, 'app.log'))
    }
  },
  server: {
    webPort: parseNumber(process.env.WEB_PORT ?? process.env.PORT, 3000),
    corsOrigin: parseString(process.env.WEB_CORS_ORIGIN, '*'),
    reloadSecret: parseString(process.env.RELOAD_SECRET, '')
  },
  agent: {
    tickIntervalMs: parseNumber(process.env.AGENT_TICK_INTERVAL_MS, 1000),
    recentCommentLimit: parseNumber(process.env.AGENT_RECENT_COMMENT_LIMIT, 20),
    commentQueue: {
      maxSize: parseNumber(process.env.AGENT_COMMENT_QUEUE_MAX_SIZE, 200),
      processingIntervalMs: parseNumber(process.env.AGENT_COMMENT_PROCESSING_INTERVAL_MS, 2500)
    },
    maxCommentsPerTick: parseNumber(process.env.AGENT_MAX_COMMENTS_PER_TICK, 6),
    monologue: {
      intervalMs: parseNumber(process.env.AGENT_MONOLOGUE_INTERVAL_MS, 10_000),
      varianceMs: parseNumber(process.env.AGENT_MONOLOGUE_VARIANCE_MS, 3_000),
      minIntervalMs: parseNumber(process.env.AGENT_MONOLOGUE_MIN_INTERVAL_MS, 1_000)
    },
    preSpeechDelayMs: {
      min: parseNumber(process.env.AGENT_PRESPEECH_DELAY_MIN_MS, 500),
      max: parseNumber(process.env.AGENT_PRESPEECH_DELAY_MAX_MS, 2_000)
    },
    errorCooldownMs: parseNumber(process.env.AGENT_ERROR_COOLDOWN_MS, 10_000),
    shortCommentLength: parseNumber(process.env.AGENT_SHORT_COMMENT_LENGTH, 3),
    speechDuration: {
      fallbackMinMs: parseNumber(process.env.AGENT_SPEECH_FALLBACK_MIN_MS, 1_200),
      perCharMs: parseNumber(process.env.AGENT_SPEECH_PER_CHAR_MS, 90)
    },
    classifier: {
      useLLM: parseBoolean(process.env.AGENT_CLASSIFIER_USE_LLM, false),
      temperature: parseNumber(process.env.AGENT_CLASSIFIER_TEMPERATURE, 0),
      maxTokens: parseNumber(process.env.AGENT_CLASSIFIER_MAX_TOKENS, 16)
    },
    topicHistory: {
      enabled: parseBoolean(process.env.AGENT_TOPIC_HISTORY_ENABLED, true)
    },
    memory: {
      consolidationMessageLimit: parseNumber(process.env.AGENT_MEMORY_CONSOLIDATION_LIMIT, 100),
      consolidationTemperature: parseNumber(process.env.AGENT_MEMORY_CONSOLIDATION_TEMPERATURE, 0.3),
      consolidationMaxTokens: parseNumber(process.env.AGENT_MEMORY_CONSOLIDATION_MAX_TOKENS, 500),
      changeReqImportance: parseNumber(process.env.AGENT_MEMORY_IMPORTANCE_CHANGE_REQ, 8),
      onTopicImportance: parseNumber(process.env.AGENT_MEMORY_IMPORTANCE_ON_TOPIC, 6)
    },
    moderation: {
      ngWord: {
        defaultDurationMs: parseNumber(process.env.AGENT_NG_WORD_DEFAULT_DURATION_MS, 300_000),
        maxLength: parseNumber(process.env.AGENT_NG_WORD_MAX_LENGTH, 40)
      },
      mute: {
        defaultDurationMs: parseNumber(process.env.AGENT_MUTE_DEFAULT_DURATION_MS, 300_000)
      }
    }
  },
  emotion: {
    decay: parseNumber(process.env.EMOTION_DECAY, 0.6),
    historyWeight: parseNumber(process.env.EMOTION_HISTORY_WEIGHT, 0.2),
    historyContextWindow: parseNumber(process.env.EMOTION_HISTORY_CONTEXT_WINDOW, 2),
    historyScoreWindow: parseNumber(process.env.EMOTION_HISTORY_SCORE_WINDOW, 3),
    moodClamp: {
      min: parseNumber(process.env.EMOTION_MOOD_MIN, -2),
      max: parseNumber(process.env.EMOTION_MOOD_MAX, 2)
    },
    excitementBoost: parseNumber(process.env.EMOTION_EXCITEMENT_BOOST, 0.4),
    angerPenalty: parseNumber(process.env.EMOTION_ANGER_PENALTY, 0.4),
    signalClampMax: parseNumber(process.env.EMOTION_SIGNAL_CLAMP_MAX, 2),
    thresholds: {
      angryMoodMax: parseNumber(process.env.EMOTION_ANGRY_MOOD_MAX, -0.6),
      excitedMoodMin: parseNumber(process.env.EMOTION_EXCITED_MOOD_MIN, 1.0),
      happyMoodMin: parseNumber(process.env.EMOTION_HAPPY_MOOD_MIN, 0.4),
      sadMoodMax: parseNumber(process.env.EMOTION_SAD_MOOD_MAX, -0.8)
    },
    lockStateDefaultMs: parseNumber(process.env.EMOTION_LOCK_DEFAULT_MS, 30_000),
    voiceMap: {
      NEUTRAL: { pitch: 0, speed: 1.2, intonation: 1.1 },
      HAPPY: { pitch: 0.05, speed: 1.3, intonation: 1.3 },
      SAD: { pitch: -0.05, speed: 1.0, intonation: 0.9 },
      ANGRY: { pitch: 0.02, speed: 1.4, intonation: 1.4 },
      EXCITED: { pitch: 0.08, speed: 1.45, intonation: 1.5 }
    }
  },
  expression: {
    debounceMs: parseNumber(process.env.EXPRESSION_DEBOUNCE_MS, 500)
  },
  storytelling: {
    theme: {
      default: parseString(process.env.STORY_THEME_DEFAULT, '雑談'),
      lockMs: parseNumber(process.env.STORY_THEME_LOCK_MS, 120_000),
      tokenPickLimit: parseNumber(process.env.STORY_THEME_TOKEN_PICK_LIMIT, 2)
    },
    cooldowns: {
      twistMs: parseNumber(process.env.STORY_TWIST_COOLDOWN_MS, 120_000),
      summaryMs: parseNumber(process.env.STORY_SUMMARY_COOLDOWN_MS, 180_000),
      emotionMs: parseNumber(process.env.STORY_EMOTION_COOLDOWN_MS, 45_000)
    },
    twistActiveMs: parseNumber(process.env.STORY_TWIST_ACTIVE_MS, 120_000),
    golden: {
      scoreThreshold: parseNumber(process.env.STORY_GOLDEN_SCORE_THRESHOLD, 4),
      forceThreshold: parseNumber(process.env.STORY_GOLDEN_FORCE_THRESHOLD, 6),
      length: {
        long: parseNumber(process.env.STORY_GOLDEN_LENGTH_LONG, 40),
        medium: parseNumber(process.env.STORY_GOLDEN_LENGTH_MEDIUM, 20)
      },
      lengthScore: {
        long: parseNumber(process.env.STORY_GOLDEN_LENGTH_LONG_SCORE, 2),
        medium: parseNumber(process.env.STORY_GOLDEN_LENGTH_MEDIUM_SCORE, 1)
      },
      questionScore: parseNumber(process.env.STORY_GOLDEN_QUESTION_SCORE, 2),
      exclaimScore: parseNumber(process.env.STORY_GOLDEN_EXCLAIM_SCORE, 1),
      keywordScore: parseNumber(process.env.STORY_GOLDEN_KEYWORD_SCORE, 1)
    },
    depth: {
      max: parseNumber(process.env.STORY_MAX_DEPTH, 10),
      deepDiveMin: parseNumber(process.env.STORY_DEEP_DIVE_MIN, 3),
      heatedMin: parseNumber(process.env.STORY_HEATED_MIN, 5),
      closeOffTopicStreak: parseNumber(process.env.STORY_CLOSE_OFFTOPIC_STREAK, 2),
      closeDepth: parseNumber(process.env.STORY_CLOSE_DEPTH, 5),
      twistDepth: parseNumber(process.env.STORY_TWIST_DEPTH, 4),
      summaryDepth: parseNumber(process.env.STORY_SUMMARY_DEPTH, 4),
      summaryOffTopicStreak: parseNumber(process.env.STORY_SUMMARY_OFFTOPIC_STREAK, 2),
      summaryPenalty: parseNumber(process.env.STORY_SUMMARY_PENALTY, 2),
      goldenDepthBoost: parseNumber(process.env.STORY_GOLDEN_DEPTH_BOOST, 2),
      normalDepthBoost: parseNumber(process.env.STORY_DEPTH_BOOST, 1),
      offTopicDepthPenalty: parseNumber(process.env.STORY_OFFTOPIC_PENALTY, 1)
    },
    vibe: {
      signalThreshold: parseNumber(process.env.STORY_VIBE_SIGNAL_THRESHOLD, 2)
    },
    emotionLockDurations: {
      excitedGameMs: parseNumber(process.env.STORY_EMOTION_EXCITED_GAME_MS, 60_000),
      heatedMs: parseNumber(process.env.STORY_EMOTION_HEATED_MS, 45_000),
      cozyMs: parseNumber(process.env.STORY_EMOTION_COZY_MS, 40_000),
      defaultMs: parseNumber(process.env.STORY_EMOTION_DEFAULT_MS, 30_000)
    },
    trend: {
      decay: parseNumber(process.env.STORY_TREND_DECAY, 0.98)
    },
    extract: {
      minTokenLength: parseNumber(process.env.STORY_TOKEN_MIN_LENGTH, 2),
      maxTokenLength: parseNumber(process.env.STORY_TOKEN_MAX_LENGTH, 24)
    },
    recentNarrativeLimit: parseNumber(process.env.STORY_RECENT_NARRATIVE_LIMIT, 6)
  },
  prompts: {
    reply: {
      temperature: parseNumber(process.env.PROMPT_REPLY_TEMPERATURE, 0.6),
      maxTokens: parseNumber(process.env.PROMPT_REPLY_MAX_TOKENS, 2048)
    },
    monologue: {
      temperature: parseNumber(process.env.PROMPT_MONOLOGUE_TEMPERATURE, 0.7),
      maxTokens: parseNumber(process.env.PROMPT_MONOLOGUE_MAX_TOKENS, 2048)
    },
    narrative: {
      temperature: parseNumber(process.env.PROMPT_NARRATIVE_TEMPERATURE, 0.7),
      maxTokens: parseNumber(process.env.PROMPT_NARRATIVE_MAX_TOKENS, 400),
      recentCommentLimit: parseNumber(process.env.PROMPT_NARRATIVE_RECENT_LIMIT, 6)
    },
    memory: {
      relevanceThreshold: parseNumber(process.env.PROMPT_MEMORY_RELEVANCE_THRESHOLD, 0.7),
      maxImportanceStars: parseNumber(process.env.PROMPT_MEMORY_MAX_STARS, 5)
    }
  },
  adapters: {
    fileReplay: {
      pollingIntervalMs: parseNumber(process.env.MOCK_POLLING_INTERVAL, 1000)
    },
    youtube: {
      pollingIntervalMs: parseNumber(process.env.YOUTUBE_POLLING_INTERVAL, 1000),
      backoffInitialMs: parseNumber(process.env.YOUTUBE_BACKOFF_INITIAL_MS, 1000),
      backoffMaxMs: parseNumber(process.env.YOUTUBE_BACKOFF_MAX_MS, 60_000),
      seenIdLimit: parseNumber(process.env.YOUTUBE_SEEN_ID_LIMIT, 5000),
      liveBroadcastMaxResults: parseNumber(process.env.YOUTUBE_LIVE_BROADCAST_MAX_RESULTS, 1)
    },
    obs: {
      host: parseString(process.env.OBS_HOST, '127.0.0.1'),
      port: parseNumber(process.env.OBS_PORT, 4455)
    },
    vts: {
      host: parseString(process.env.VTS_HOST, 'localhost'),
      port: parseNumber(process.env.VTS_PORT, 8001),
      pluginName: parseString(process.env.VTS_PLUGIN_NAME, 'AI-VTuber'),
      pluginDeveloper: parseString(process.env.VTS_PLUGIN_DEVELOPER, 'AI-VTuber Developer'),
      maxReconnectAttempts: parseNumber(process.env.VTS_MAX_RECONNECT_ATTEMPTS, 5),
      requestTimeoutMs: parseNumber(process.env.VTS_REQUEST_TIMEOUT_MS, 5000),
      reconnectBackoffBaseMs: parseNumber(process.env.VTS_RECONNECT_BACKOFF_BASE_MS, 1000),
      reconnectBackoffMaxMs: parseNumber(process.env.VTS_RECONNECT_BACKOFF_MAX_MS, 30_000)
    }
  },
  tts: {
    voicevox: {
      baseUrl: parseString(process.env.VOICEVOX_BASE_URL, 'http://localhost:50021'),
      speakerId: parseNumber(process.env.VOICEVOX_SPEAKER_ID, 1),
      timeoutMs: parseNumber(process.env.VOICEVOX_TIMEOUT_MS, 15_000)
    },
    mock: {
      previewLength: parseNumber(process.env.MOCK_TTS_PREVIEW_LENGTH, 50)
    }
  },
  lipSync: {
    parameterId: parseString(process.env.VTS_LIPSYNC_PARAM_ID, 'MouthOpen'),
    frameDurationMs: parseNumber(process.env.VTS_LIPSYNC_FRAME_MS, 16),
    volumeScale: parseNumber(process.env.VTS_VOLUME_SCALE, 1.5),
    smoothing: parseNumber(process.env.VTS_LIPSYNC_SMOOTHING, 0.3),
    finalDelayMs: parseNumber(process.env.VTS_LIPSYNC_FINAL_DELAY_MS, 100)
  },
  volumeAnalyzer: {
    defaultFrameDurationMs: parseNumber(process.env.VOLUME_FRAME_MS, 16),
    rmsScale: parseNumber(process.env.VOLUME_RMS_SCALE, 2.0)
  },
  memory: {
    chromaUrl: parseString(process.env.CHROMA_URL, 'http://localhost:8000'),
    collectionName: parseString(process.env.MEMORY_COLLECTION_NAME, 'ai_vtuber_memories'),
    embeddingModel: parseString(process.env.MEMORY_EMBEDDING_MODEL, 'text-embedding-3-small'),
    defaultImportance: parseNumber(process.env.MEMORY_DEFAULT_IMPORTANCE, 5),
    searchLimit: parseNumber(process.env.MEMORY_SEARCH_LIMIT, 5),
    streamMemoriesLimit: parseNumber(process.env.MEMORY_STREAM_LIMIT, 10),
    viewerMemoriesLimit: parseNumber(process.env.MEMORY_VIEWER_LIMIT, 10),
    shortTermLimit: parseNumber(process.env.MEMORY_STM_LIMIT, 25),
    pruning: {
      decayDays: parseNumber(process.env.MEMORY_PRUNE_DECAY_DAYS, 30),
      threshold: parseNumber(process.env.MEMORY_PRUNE_THRESHOLD, 0.3)
    }
  },
  character: {
    traitCacheTtlMs: parseNumber(process.env.CHARACTER_TRAIT_CACHE_TTL_MS, 300_000)
  },
  llm: {
    provider: (parseString(process.env.LLM_PROVIDER, 'openai') as 'openai' | 'groq' | 'grok'),
    requestTimeoutMs: parseNumber(process.env.LLM_REQUEST_TIMEOUT_MS, 15_000),
    retry: {
      maxAttempts: parseNumber(process.env.LLM_RETRY_MAX_ATTEMPTS, 3),
      baseDelayMs: parseNumber(process.env.LLM_RETRY_BASE_DELAY_MS, 500),
      maxDelayMs: parseNumber(process.env.LLM_RETRY_MAX_DELAY_MS, 4_000)
    }
  },
  openai: {
    apiKey: parseString(process.env.OPENAI_API_KEY, ''),
    baseUrl: parseString(process.env.OPENAI_BASE_URL, ''),
    defaultModel: parseString(process.env.OPENAI_MODEL, 'gpt-4o-mini'),
    defaultTemperature: parseNumber(process.env.OPENAI_TEMPERATURE, 1),
    defaultMaxTokens: parseNumber(process.env.OPENAI_MAX_TOKENS, 1024)
  },
  xai: {
    apiKey: parseString(process.env.GROK_API_KEY, ''),
    baseUrl: parseString(process.env.GROK_BASE_URL, 'https://api.x.ai/v1'),
    defaultModel: parseString(process.env.GROK_MODEL, 'grok-beta'),
    defaultTemperature: parseNumber(process.env.GROK_TEMPERATURE, 0.7),
    defaultMaxTokens: parseNumber(process.env.GROK_MAX_TOKENS, 1024)
  },
  groq: {
    apiKey: parseString(process.env.GROQ_API_KEY, ''),
    defaultModel: parseString(process.env.GROQ_MODEL, 'llama3-70b-8192'),
    defaultTemperature: parseNumber(process.env.GROQ_TEMPERATURE, 0.7),
    defaultMaxTokens: parseNumber(process.env.GROQ_MAX_TOKENS, 1024)
  },
  news: {
    apiKey: parseString(process.env.NEWS_API_KEY, ''),
    baseUrl: parseString(process.env.NEWS_API_BASE_URL, 'https://newsapi.org/v2'),
    language: parseString(process.env.NEWS_API_LANGUAGE, 'ja'),
    maxResults: parseNumber(process.env.NEWS_API_MAX_RESULTS, 5),
    timeoutMs: parseNumber(process.env.NEWS_API_TIMEOUT_MS, 8_000)
  }
  };
};

export const config: AppConfig = buildConfig();

export const reloadConfig = (): AppConfig => {
  const next = buildConfig();
  Object.assign(config, next);
  return config;
};

export const configUtils = {
  parseBoolean,
  parseNumber,
  parseString
};
