import { IVisualOutputAdapter } from '../interfaces';
import { VolumeAnalyzer, VolumeFrame } from './VolumeAnalyzer';
import { config } from '../config/AppConfig';
import { logger } from '../lib/logger';

export interface LipSyncConfig {
  parameterId?: string;
  frameDurationMs?: number;
  volumeScale?: number;
  smoothing?: number;
}

export class LipSyncService {
  private adapter: IVisualOutputAdapter;
  private analyzer: VolumeAnalyzer;
  private config: Required<LipSyncConfig>;
  private activeTimers: NodeJS.Timeout[] = [];
  private isSyncing = false;
  private lastVolume = 0;

  constructor(adapter: IVisualOutputAdapter, options?: LipSyncConfig) {
    this.adapter = adapter;
    this.analyzer = new VolumeAnalyzer();
    this.config = {
      parameterId: options?.parameterId ?? config.lipSync.parameterId,
      frameDurationMs: options?.frameDurationMs ?? config.lipSync.frameDurationMs,
      volumeScale: options?.volumeScale ?? config.lipSync.volumeScale,
      smoothing: options?.smoothing ?? config.lipSync.smoothing
    };
  }

  public async startSync(audioBuffer: Buffer): Promise<void> {
    this.cancelSync();

    const frames = this.analyzer.analyzeWav(audioBuffer, this.config.frameDurationMs);
    if (frames.length === 0) {
      logger.warn('[LipSync] No volume frames extracted');
      return;
    }

    this.isSyncing = true;
    this.lastVolume = 0;
    const startTime = Date.now();

    for (const frame of frames) {
      const delay = frame.timeMs - (Date.now() - startTime);

      if (delay < 0) {
        continue;
      }

      const timer = setTimeout(() => {
        if (!this.isSyncing) {
          return;
        }

        const smoothedVolume = this.lastVolume + (frame.volume - this.lastVolume) * (1 - this.config.smoothing);
        const scaledVolume = Math.min(1, Math.max(0, smoothedVolume * this.config.volumeScale));

        this.adapter.setParameter(this.config.parameterId, scaledVolume).catch((err) => {
          logger.warn('[LipSync] Parameter update failed:', err);
        });

        this.lastVolume = smoothedVolume;
      }, delay);

      this.activeTimers.push(timer);
    }

    const finalDelay = frames[frames.length - 1].timeMs + config.lipSync.finalDelayMs;
    const finalTimer = setTimeout(() => {
      this.adapter.setParameter(this.config.parameterId, 0).catch((err) => {
        logger.warn('[LipSync] Final parameter update failed:', err);
      });
      this.isSyncing = false;
      this.lastVolume = 0;
    }, finalDelay);

    this.activeTimers.push(finalTimer);
  }

  public cancelSync(): void {
    if (!this.isSyncing) {
      return;
    }

    for (const timer of this.activeTimers) {
      clearTimeout(timer);
    }

    this.activeTimers = [];
    this.isSyncing = false;
    this.lastVolume = 0;

    this.adapter.setParameter(this.config.parameterId, 0).catch((err) => {
      logger.warn('[LipSync] Cancel parameter reset failed:', err);
    });
  }

  public getSyncing(): boolean {
    return this.isSyncing;
  }
}
