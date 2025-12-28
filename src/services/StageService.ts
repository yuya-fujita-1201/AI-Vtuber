import { EmotionState } from '../core/EmotionEngine';
import { OBSAdapter } from '../adapters/OBSAdapter';

export type EmotionFilterConfig = {
  sourceName: string;
  filterName: string;
};

export interface StageConfig {
  sceneMain?: string;
  sceneWaiting?: string;
  sceneEnding?: string;
  sectionSceneMap?: Record<string, string>;
  emotionSceneMap?: Partial<Record<EmotionState, string>>;
  emotionFilterMap?: Partial<Record<EmotionState, EmotionFilterConfig>>;
}

export class StageService {
  private adapter: OBSAdapter;
  private config: StageConfig;
  private lastSection?: string;
  private lastEmotion?: EmotionState;
  private activeFilter?: EmotionFilterConfig;

  constructor(adapter: OBSAdapter, config: StageConfig = {}) {
    this.adapter = adapter;
    this.config = config;
  }

  public async onStreamStart(): Promise<void> {
    if (!this.config.sceneMain) {
      return;
    }

    await this.adapter.switchScene(this.config.sceneMain);
  }

  public async onStreamStop(): Promise<void> {
    const target = this.config.sceneEnding ?? this.config.sceneWaiting;
    if (!target) {
      console.warn('[Stage] No ending/waiting scene configured');
      return;
    }

    await this.adapter.switchScene(target);
  }

  public async transitionToEnding(): Promise<void> {
    if (!this.config.sceneEnding) {
      console.warn('[Stage] No ending scene configured');
      return;
    }

    await this.adapter.switchScene(this.config.sceneEnding);
  }

  public async onSectionChanged(section: string): Promise<void> {
    if (!section || section === this.lastSection) {
      return;
    }

    this.lastSection = section;
    const sceneName = this.config.sectionSceneMap?.[section];
    if (!sceneName) {
      return;
    }

    await this.adapter.switchScene(sceneName);
  }

  public async onEmotionChanged(state: EmotionState): Promise<void> {
    if (state === this.lastEmotion) {
      return;
    }

    this.lastEmotion = state;

    const nextScene = this.config.emotionSceneMap?.[state];
    if (nextScene) {
      await this.adapter.switchScene(nextScene);
    }

    if (!this.config.emotionFilterMap) {
      return;
    }

    const nextFilter = this.config.emotionFilterMap[state];
    if (this.activeFilter) {
      const shouldDisable =
        !nextFilter ||
        nextFilter.sourceName !== this.activeFilter.sourceName ||
        nextFilter.filterName !== this.activeFilter.filterName;

      if (shouldDisable) {
        await this.adapter.setFilterEnabled(
          this.activeFilter.sourceName,
          this.activeFilter.filterName,
          false
        );
      }
    }

    if (nextFilter) {
      await this.adapter.setFilterEnabled(nextFilter.sourceName, nextFilter.filterName, true);
      this.activeFilter = nextFilter;
    } else {
      this.activeFilter = undefined;
    }
  }

  public async handleCommand(message: string): Promise<boolean> {
    const trimmed = message.trim();
    if (!trimmed.startsWith('!')) {
      return false;
    }

    const parts = trimmed.split(/\s+/);
    const command = parts.shift()?.toLowerCase();
    if (!command) {
      return false;
    }

    try {
      switch (command) {
        case '!scene': {
          const sceneName = parts.join(' ').trim();
          if (!sceneName) {
            console.warn('[Stage] !scene requires a scene name');
            return true;
          }
          await this.adapter.switchScene(sceneName);
          return true;
        }
        case '!stage': {
          const alias = parts[0]?.toLowerCase();
          const sceneName = this.resolveStageScene(alias);
          if (!sceneName) {
            console.warn('[Stage] !stage expects main|waiting|ending');
            return true;
          }
          await this.adapter.switchScene(sceneName);
          return true;
        }
        case '!source': {
          if (parts.length < 2) {
            console.warn('[Stage] !source requires a source name and on/off');
            return true;
          }
          const visibilityToken = parts.pop();
          const visible = this.parseVisibility(visibilityToken);
          if (visible === null) {
            console.warn('[Stage] !source visibility must be on/off');
            return true;
          }
          const sourceName = parts.join(' ').trim();
          if (!sourceName) {
            console.warn('[Stage] !source requires a source name');
            return true;
          }
          await this.adapter.toggleSource(sourceName, visible);
          return true;
        }
        default:
          return false;
      }
    } catch (error) {
      console.warn('[Stage] Command handling failed:', error);
      return true;
    }
  }

  private resolveStageScene(alias?: string): string | undefined {
    if (!alias) {
      return undefined;
    }

    switch (alias) {
      case 'main':
        return this.config.sceneMain;
      case 'waiting':
        return this.config.sceneWaiting;
      case 'ending':
        return this.config.sceneEnding;
      default:
        return undefined;
    }
  }

  private parseVisibility(value?: string): boolean | null {
    if (!value) {
      return null;
    }

    const normalized = value.toLowerCase();
    if (['on', 'true', 'show', '1'].includes(normalized)) {
      return true;
    }
    if (['off', 'false', 'hide', '0'].includes(normalized)) {
      return false;
    }
    return null;
  }
}
