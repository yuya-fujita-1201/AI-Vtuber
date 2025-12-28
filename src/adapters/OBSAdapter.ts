
import OBSWebSocket from 'obs-websocket-js';

export class OBSAdapter {
    private obs: OBSWebSocket;
    private connected: boolean = false;
    private readonly address = 'ws://127.0.0.1:4455';

    constructor() {
        this.obs = new OBSWebSocket();
    }

    public async connect(password?: string): Promise<void> {
        try {
            await this.obs.connect(this.address, password);
            this.connected = true;
            console.log('[OBS] Connected to OBS WebSocket');
        } catch (error) {
            console.error('[OBS] Connection failed', error);
            this.connected = false;
        }
    }

    public async disconnect(): Promise<void> {
        if (this.connected) {
            await this.obs.disconnect();
            this.connected = false;
        }
    }

    public async setScene(sceneName: string): Promise<void> {
        if (!this.connected) return;
        try {
            await this.obs.call('SetCurrentProgramScene', { sceneName });
            console.log(`[OBS] Switched to scene: ${sceneName}`);
        } catch (error) {
            console.error(`[OBS] Failed to switch scene to ${sceneName}`, error);
        }
    }

    public async setSourceVisibility(sceneName: string, sourceName: string, visible: boolean): Promise<void> {
        if (!this.connected) return;
        try {
            // OBS v5 way of handling this via scene items
            const { sceneItemId } = await this.getSceneItemId(sceneName, sourceName) || {};
            if (sceneItemId !== undefined) {
                await this.obs.call('SetSceneItemEnabled', {
                    sceneName,
                    sceneItemId,
                    sceneItemEnabled: visible
                });
                console.log(`[OBS] Source ${sourceName} visibility set to ${visible}`);
            }
        } catch (error) {
            console.error(`[OBS] Failed to toggle source ${sourceName}`, error);
        }
    }

    private async getSceneItemId(sceneName: string, sourceName: string): Promise<{ sceneItemId: number } | null> {
        try {
            const { sceneItems } = await this.obs.call('GetSceneItemList', { sceneName });
            const item = sceneItems.find((i: any) => i.sourceName === sourceName);
            return item ? { sceneItemId: item.sceneItemId as number } : null;
        } catch (error) {
            return null;
        }
    }
}
