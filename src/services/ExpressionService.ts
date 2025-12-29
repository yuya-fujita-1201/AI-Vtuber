import { IVisualOutputAdapter } from '../interfaces';
import { EmotionState } from '../core/EmotionEngine';
import { config as appConfig } from '../config/AppConfig';
import { logger } from '../lib/logger';

export interface ExpressionConfig {
  hotkeyMap: Record<EmotionState, string>;
  debounceMs?: number;
}

export class ExpressionService {
  private adapter: IVisualOutputAdapter;
  private config: ExpressionConfig;
  private currentEmotion: EmotionState = EmotionState.NEUTRAL;
  private lastChangeAt = 0;
  private readonly debounceMs: number;

  constructor(adapter: IVisualOutputAdapter, config: ExpressionConfig) {
    this.adapter = adapter;
    this.config = config;
    this.debounceMs = config.debounceMs ?? appConfig.expression.debounceMs;
  }

  public async onEmotionChanged(newState: EmotionState): Promise<void> {
    if (newState === this.currentEmotion) {
      return;
    }

    const now = Date.now();
    if (now - this.lastChangeAt < this.debounceMs) {
      return;
    }

    const hotkeyId = this.config.hotkeyMap[newState];
    if (!hotkeyId) {
      logger.warn(`[Expression] No hotkey mapped for emotion: ${newState}`);
      return;
    }

    try {
      await this.adapter.triggerHotkey(hotkeyId);
      logger.info(`[Expression] Triggered hotkey for emotion: ${newState}`);
      this.currentEmotion = newState;
      this.lastChangeAt = now;
    } catch (error) {
      logger.error(`[Expression] Failed to trigger hotkey for ${newState}:`, error);
    }
  }

  public getHotkeyMap(): Record<EmotionState, string> {
    return { ...this.config.hotkeyMap };
  }

  public getCurrentEmotion(): EmotionState {
    return this.currentEmotion;
  }
}
