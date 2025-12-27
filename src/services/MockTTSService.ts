
import { ITTSService, TTSOptions } from '../interfaces';

export class MockTTSService implements ITTSService {
    async synthesize(text: string, options?: TTSOptions): Promise<Buffer> {
        const preview = `${text.slice(0, 50)}${text.length > 50 ? '...' : ''}`;
        if (options) {
            console.log(`[MockTTS] Synthesizing: "${preview}" (pitch=${options.pitch ?? 'default'}, speed=${options.speed ?? 'default'}, intonation=${options.intonation ?? 'default'})`);
        } else {
            console.log(`[MockTTS] Synthesizing: "${preview}"`);
        }
        // Return empty buffer or proper WAV header if needed, but empty is usually fine for mocks unless player crashes
        return Buffer.from([]);
    }

    async isReady(): Promise<boolean> {
        return true;
    }
}
