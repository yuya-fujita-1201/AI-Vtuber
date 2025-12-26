import { VoicevoxService } from './src/services/VoicevoxService';
import { AudioPlayer } from './src/services/AudioPlayer';
const main = async () => {
    console.log('Testing VOICEVOX connection...');
    const voicevox = new VoicevoxService();

    const isReady = await voicevox.isReady();
    if (!isReady) {
        console.error('❌ VOICEVOX Engine is NOT reachable at http://localhost:50021');
        console.error('Please make sure VOICEVOX Editor is running.');
        process.exit(1);
    }
    console.log('✅ VOICEVOX Engine is ready!');
    console.log('Synthesizing test audio...');
    const audio = await voicevox.synthesize('これはテストです。聞こえていますか？');

    console.log(`Audio synthesized: ${audio.length} bytes`);
    if (process.argv.includes('--play')) {
        console.log('Playing audio...');
        const player = new AudioPlayer();
        await player.play(audio);
        console.log('Playback finished.');
    }
};
main().catch(console.error);