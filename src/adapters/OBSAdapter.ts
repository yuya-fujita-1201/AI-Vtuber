import OBSWebSocket from 'obs-websocket-js';

export interface OBSConfig {
  host?: string;
  port?: number;
  password?: string;
}

export class OBSAdapter {
  private obs: OBSWebSocket;
  private connected = false;
  private config: Required<OBSConfig> = {
    host: '127.0.0.1',
    port: 4455,
    password: ''
  };
  private sceneItemCache = new Map<string, number>();

  constructor() {
    this.obs = new OBSWebSocket();

    this.obs.on('ConnectionClosed', () => {
      this.connected = false;
      console.warn('[OBS] Connection closed');
    });
  }

  async connect(config: OBSConfig = {}): Promise<void> {
    this.config = { ...this.config, ...config };
    const url = `ws://${this.config.host}:${this.config.port}`;
    const password = this.config.password?.trim() || undefined;

    console.log(`[OBS] Connecting to ${url}...`);

    try {
      await this.obs.connect(url, password, { rpcVersion: 1 });
      this.connected = true;
      console.log('[OBS] Connected');
    } catch (error) {
      this.connected = false;
      console.error('[OBS] Connection failed:', error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (!this.connected) {
      return;
    }

    try {
      await this.obs.disconnect();
    } finally {
      this.connected = false;
    }
  }

  isConnected(): boolean {
    return this.connected;
  }

  async switchScene(sceneName: string): Promise<void> {
    if (!sceneName) {
      console.warn('[OBS] switchScene called with empty sceneName');
      return;
    }
    if (!this.connected) {
      console.warn('[OBS] switchScene skipped (not connected)');
      return;
    }

    try {
      await this.obs.call('SetCurrentProgramScene', { sceneName });
      console.log(`[OBS] Switched to scene: ${sceneName}`);
    } catch (error) {
      console.warn(`[OBS] Failed to switch scene to "${sceneName}":`, error);
    }
  }

  async toggleSource(sourceName: string, visible: boolean, sceneName?: string): Promise<void> {
    if (!sourceName) {
      console.warn('[OBS] toggleSource called with empty sourceName');
      return;
    }
    if (!this.connected) {
      console.warn('[OBS] toggleSource skipped (not connected)');
      return;
    }

    try {
      const targetScene = sceneName ?? (await this.getCurrentScene());
      if (!targetScene) {
        console.warn('[OBS] toggleSource could not resolve current scene');
        return;
      }

      const sceneItemId = await this.getSceneItemId(targetScene, sourceName);
      if (sceneItemId === null) {
        console.warn(`[OBS] Source not found in scene "${targetScene}": ${sourceName}`);
        return;
      }

      await this.obs.call('SetSceneItemEnabled', {
        sceneName: targetScene,
        sceneItemId,
        sceneItemEnabled: visible
      });

      console.log(`[OBS] ${visible ? 'Show' : 'Hide'} source "${sourceName}" in scene "${targetScene}"`);
    } catch (error) {
      console.warn(`[OBS] Failed to toggle source "${sourceName}":`, error);
    }
  }

  async setFilterEnabled(sourceName: string, filterName: string, enabled: boolean): Promise<void> {
    if (!sourceName || !filterName) {
      console.warn('[OBS] setFilterEnabled called with empty source/filter');
      return;
    }
    if (!this.connected) {
      console.warn('[OBS] setFilterEnabled skipped (not connected)');
      return;
    }

    try {
      await this.obs.call('SetSourceFilterEnabled', {
        sourceName,
        filterName,
        filterEnabled: enabled
      });

      console.log(`[OBS] ${enabled ? 'Enabled' : 'Disabled'} filter "${filterName}" on "${sourceName}"`);
    } catch (error) {
      console.warn(`[OBS] Failed to set filter "${filterName}" on "${sourceName}":`, error);
    }
  }

  private async getCurrentScene(): Promise<string | null> {
    try {
      const response = await this.obs.call('GetCurrentProgramScene');
      return response.currentProgramSceneName ?? null;
    } catch (error) {
      console.warn('[OBS] Failed to get current scene:', error);
      return null;
    }
  }

  private async getSceneItemId(sceneName: string, sourceName: string): Promise<number | null> {
    const cacheKey = `${sceneName}::${sourceName}`;
    const cached = this.sceneItemCache.get(cacheKey);
    if (typeof cached === 'number') {
      return cached;
    }

    try {
      const response = await this.obs.call('GetSceneItemId', { sceneName, sourceName });
      if (typeof response.sceneItemId === 'number') {
        this.sceneItemCache.set(cacheKey, response.sceneItemId);
        return response.sceneItemId;
      }
      return null;
    } catch (error) {
      console.warn(`[OBS] Failed to resolve scene item ID for "${sourceName}" in "${sceneName}":`, error);
      this.sceneItemCache.delete(cacheKey);
      return null;
    }
  }
}
