
import { ITTSService } from '../interfaces';

export class MockTTSService implements ITTSService {
    async synthesize(text: string, options?: Record<string, unknown>): Promise<Buffer> {
        console.log(`[MockTTS] Synthesizing: "${text.slice(0, 50)}${text.length > 50 ? '...' : ''}"`);
        // Return empty buffer or proper WAV header if needed, but empty is usually fine for mocks unless player crashes
        return Buffer.from([]);
    }

    async isReady(): Promise<boolean> {
        return true;
    }
}
