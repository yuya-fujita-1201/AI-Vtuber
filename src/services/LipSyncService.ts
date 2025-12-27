import { IVisualOutputAdapter } from '../interfaces';
import { VolumeAnalyzer, VolumeFrame } from './VolumeAnalyzer';

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

  constructor(adapter: IVisualOutputAdapter, config?: LipSyncConfig) {
    this.adapter = adapter;
    this.analyzer = new VolumeAnalyzer();
    this.config = {
      parameterId: config?.parameterId ?? 'MouthOpen',
      frameDurationMs: config?.frameDurationMs ?? 16,
      volumeScale: config?.volumeScale ?? 1.5,
      smoothing: config?.smoothing ?? 0.3
    };
  }

  public async startSync(audioBuffer: Buffer): Promise<void> {
    this.cancelSync();

    const frames = this.analyzer.analyzeWav(audioBuffer, this.config.frameDurationMs);
    if (frames.length === 0) {
      console.warn('[LipSync] No volume frames extracted');
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
          console.warn('[LipSync] Parameter update failed:', err);
        });

        this.lastVolume = smoothedVolume;
      }, delay);

      this.activeTimers.push(timer);
    }

    const finalDelay = frames[frames.length - 1].timeMs + 100;
    const finalTimer = setTimeout(() => {
      this.adapter.setParameter(this.config.parameterId, 0).catch((err) => {
        console.warn('[LipSync] Final parameter update failed:', err);
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
      console.warn('[LipSync] Cancel parameter reset failed:', err);
    });
  }

  public getSyncing(): boolean {
    return this.isSyncing;
  }
}
