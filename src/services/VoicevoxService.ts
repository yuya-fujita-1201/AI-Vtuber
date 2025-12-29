import axios, { AxiosInstance } from 'axios';
import { ITTSService, TTSOptions } from '../interfaces';
import { config } from '../config/AppConfig';
import { logger } from '../lib/logger';

export class VoicevoxService implements ITTSService {
    private client: AxiosInstance;
    private readonly speakerId: number;
    private readonly isDryRun: boolean;

    constructor(baseUrl?: string, speakerId?: number) {
        const resolvedBaseUrl = (baseUrl ?? config.tts.voicevox.baseUrl).replace(/\/+$/, '');
        const resolvedSpeaker = speakerId ?? config.tts.voicevox.speakerId;
        this.isDryRun = config.env.dryRun;

        this.client = axios.create({
            baseURL: resolvedBaseUrl,
            timeout: config.tts.voicevox.timeoutMs
        });
        this.speakerId = resolvedSpeaker;

        if (this.isDryRun) {
            logger.info('[VoicevoxService] DRY_RUN enabled. Skipping synthesis requests.');
        }
    }

    public async synthesize(text: string, options?: TTSOptions): Promise<Buffer> {
        if (!text) return Buffer.alloc(0);
        if (this.isDryRun) return Buffer.alloc(0);

        const overrideSpeaker = this.resolveSpeaker(options);

        try {
            const queryResponse = await this.client.post('/audio_query', null, {
                params: {
                    speaker: overrideSpeaker,
                    text
                }
            });

            const queryData = queryResponse.data;
            this.applyVoiceOptions(queryData, options);
            const synthesisResponse = await this.client.post('/synthesis', queryData, {
                params: { speaker: overrideSpeaker },
                responseType: 'arraybuffer'
            });

            return Buffer.from(synthesisResponse.data);
        } catch (error) {
            logger.error('[VoicevoxService] synthesize failed', error);
            return Buffer.alloc(0);
        }
    }

    public async isReady(): Promise<boolean> {
        if (this.isDryRun) {
            return true;
        }
        try {
            await this.client.get('/speakers');
            return true;
        } catch (error) {
            return false;
        }
    }

    private resolveSpeaker(options?: TTSOptions): number {
        if (!options) return this.speakerId;

        const candidate = options.speakerId ?? options.speaker;
        if (typeof candidate === 'number' && Number.isFinite(candidate)) {
            return candidate;
        }

        if (typeof candidate === 'string') {
            const parsed = Number(candidate);
            if (Number.isFinite(parsed)) {
                return parsed;
            }
        }

        return this.speakerId;
    }

    private applyVoiceOptions(queryData: Record<string, any>, options?: TTSOptions): void {
        if (!options) return;

        if (typeof options.pitch === 'number' && Number.isFinite(options.pitch)) {
            queryData.pitchScale = options.pitch;
        }

        if (typeof options.speed === 'number' && Number.isFinite(options.speed)) {
            queryData.speedScale = options.speed;
        }

        if (typeof options.intonation === 'number' && Number.isFinite(options.intonation)) {
            queryData.intonationScale = options.intonation;
        }
    }
}
