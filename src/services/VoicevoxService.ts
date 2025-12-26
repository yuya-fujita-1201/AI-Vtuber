import axios, { AxiosInstance } from 'axios';
import { ITTSService } from '../interfaces';

export class VoicevoxService implements ITTSService {
    private client: AxiosInstance;
    private readonly speakerId: number;

    constructor(baseUrl?: string, speakerId?: number) {
        const resolvedBaseUrl = (baseUrl ?? process.env.VOICEVOX_BASE_URL ?? 'http://localhost:50021').replace(/\/+$/, '');
        const envSpeaker = Number(process.env.VOICEVOX_SPEAKER_ID ?? '1');
        const resolvedSpeaker = speakerId ?? (Number.isFinite(envSpeaker) ? envSpeaker : 1);

        this.client = axios.create({
            baseURL: resolvedBaseUrl,
            timeout: 15000
        });
        this.speakerId = resolvedSpeaker;
    }

    public async synthesize(text: string, options?: Record<string, unknown>): Promise<Buffer> {
        if (!text) return Buffer.alloc(0);

        const overrideSpeaker = this.resolveSpeaker(options);

        try {
            const queryResponse = await this.client.post('/audio_query', null, {
                params: {
                    speaker: overrideSpeaker,
                    text
                }
            });

            const queryData = queryResponse.data;
            const synthesisResponse = await this.client.post('/synthesis', queryData, {
                params: { speaker: overrideSpeaker },
                responseType: 'arraybuffer'
            });

            return Buffer.from(synthesisResponse.data);
        } catch (error) {
            console.error('[VoicevoxService] synthesize failed', error);
            return Buffer.alloc(0);
        }
    }

    public async isReady(): Promise<boolean> {
        try {
            await this.client.get('/speakers');
            return true;
        } catch (error) {
            return false;
        }
    }

    private resolveSpeaker(options?: Record<string, unknown>): number {
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
}
