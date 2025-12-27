import { IVisualOutputAdapter } from '../interfaces';
import { EmotionState } from '../core/EmotionEngine';

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
    this.debounceMs = config.debounceMs ?? 500;
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
      console.warn(`[Expression] No hotkey mapped for emotion: ${newState}`);
      return;
    }

    try {
      await this.adapter.triggerHotkey(hotkeyId);
      console.log(`[Expression] Triggered hotkey for emotion: ${newState}`);
      this.currentEmotion = newState;
      this.lastChangeAt = now;
    } catch (error) {
      console.error(`[Expression] Failed to trigger hotkey for ${newState}:`, error);
    }
  }

  public getHotkeyMap(): Record<EmotionState, string> {
    return { ...this.config.hotkeyMap };
  }

  public getCurrentEmotion(): EmotionState {
    return this.currentEmotion;
  }
}
