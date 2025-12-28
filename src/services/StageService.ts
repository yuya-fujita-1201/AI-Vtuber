
import { OBSAdapter } from '../adapters/OBSAdapter';

type StageConfig = {
    obsPassword?: string;
    mainScene: string;
    endingScene: string;
};

export class StageService {
    private obs: OBSAdapter;
    private config: StageConfig;

    constructor(obsAdapter: OBSAdapter, config: StageConfig) {
        this.obs = obsAdapter;
        this.config = config;
    }

    public async initialize(): Promise<void> {
        await this.obs.connect(this.config.obsPassword);
    }

    public async transitionToMain(): Promise<void> {
        await this.obs.setScene(this.config.mainScene);
    }

    public async transitionToEnding(): Promise<void> {
        await this.obs.setScene(this.config.endingScene);
    }

    public async toggleOverlay(visible: boolean): Promise<void> {
        // Example: Toggling a specific browser source named "Browser"
        // This assumes the overlay is in the Main scene
        await this.obs.setSourceVisibility(this.config.mainScene, 'Browser', visible);
    }

    public async disconnect(): Promise<void> {
        await this.obs.disconnect();
    }
}
