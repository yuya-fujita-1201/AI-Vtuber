import { ITTSService, TTSOptions } from '../interfaces';
import { config } from '../config/AppConfig';
import { logger } from '../lib/logger';

export class MockTTSService implements ITTSService {
    async synthesize(text: string, options?: TTSOptions): Promise<Buffer> {
        const previewLimit = config.tts.mock.previewLength;
        const preview = `${text.slice(0, previewLimit)}${text.length > previewLimit ? '...' : ''}`;
        if (options) {
            logger.info(`[MockTTS] Synthesizing: "${preview}" (pitch=${options.pitch ?? 'default'}, speed=${options.speed ?? 'default'}, intonation=${options.intonation ?? 'default'})`);
        } else {
            logger.info(`[MockTTS] Synthesizing: "${preview}"`);
        }
        // Return empty buffer or proper WAV header if needed, but empty is usually fine for mocks unless player crashes
        return Buffer.from([]);
    }

    async isReady(): Promise<boolean> {
        return true;
    }
}
