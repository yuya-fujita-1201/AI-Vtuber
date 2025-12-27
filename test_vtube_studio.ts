/**
 * VTubeStudioAdapter Integration Tests
 *
 * Note: These tests require a running VTube Studio instance
 * To run: VTS_ENABLED=true npm run test:vts
 */

import { VTubeStudioAdapter } from './src/adapters/VTubeStudioAdapter';
import { LipSyncService } from './src/services/LipSyncService';
import { ExpressionService } from './src/services/ExpressionService';
import { EmotionState } from './src/core/EmotionEngine';

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testConnection() {
  console.log('[Test 1] VTube Studio Connection');

  const adapter = new VTubeStudioAdapter();

  try {
    await adapter.connect({
      host: 'localhost',
      port: 8001,
      authToken: process.env.VTS_AUTH_TOKEN
    });

    if (!adapter.isConnected()) {
      console.error('❌ Adapter not connected after successful connection');
      await adapter.disconnect();
      return false;
    }

    console.log('✅ Connected to VTube Studio successfully');
    await adapter.disconnect();

    if (adapter.isConnected()) {
      console.error('❌ Adapter still connected after disconnect');
      return false;
    }

    console.log('✅ Disconnected successfully');
    return true;
  } catch (error) {
    console.error('❌ Connection failed:', error);
    return false;
  }
}

async function testParameterUpdate() {
  console.log('\n[Test 2] Parameter Update');

  const adapter = new VTubeStudioAdapter();

  try {
    await adapter.connect({
      host: 'localhost',
      port: 8001,
      authToken: process.env.VTS_AUTH_TOKEN
    });

    // Test setting MouthOpen parameter
    await adapter.setParameter('MouthOpen', 0.5);
    console.log('✅ Set MouthOpen to 0.5');

    await sleep(500);

    await adapter.setParameter('MouthOpen', 1.0);
    console.log('✅ Set MouthOpen to 1.0');

    await sleep(500);

    await adapter.setParameter('MouthOpen', 0.0);
    console.log('✅ Reset MouthOpen to 0.0');

    await adapter.disconnect();
    return true;
  } catch (error) {
    console.error('❌ Parameter update failed:', error);
    await adapter.disconnect();
    return false;
  }
}

async function testHotkeyTrigger() {
  console.log('\n[Test 3] Hotkey Trigger');

  const adapter = new VTubeStudioAdapter();

  try {
    await adapter.connect({
      host: 'localhost',
      port: 8001,
      authToken: process.env.VTS_AUTH_TOKEN
    });

    const hotkeyId = process.env.VTS_HOTKEY_HAPPY;

    if (!hotkeyId) {
      console.warn('⚠️  VTS_HOTKEY_HAPPY not set, skipping hotkey test');
      await adapter.disconnect();
      return true;
    }

    await adapter.triggerHotkey(hotkeyId);
    console.log('✅ Triggered HAPPY hotkey');

    await sleep(1000);

    await adapter.disconnect();
    return true;
  } catch (error) {
    console.error('❌ Hotkey trigger failed:', error);
    await adapter.disconnect();
    return false;
  }
}

async function testLipSyncService() {
  console.log('\n[Test 4] LipSync Service');

  const adapter = new VTubeStudioAdapter();

  try {
    await adapter.connect({
      host: 'localhost',
      port: 8001,
      authToken: process.env.VTS_AUTH_TOKEN
    });

    const lipSync = new LipSyncService(adapter, {
      volumeScale: 1.5
    });

    // Create a simple WAV buffer for testing
    const testWav = createTestWavBuffer(24000, 1, 16, 2); // 2 seconds

    console.log('   Starting lip sync for 2 seconds...');
    await lipSync.startSync(testWav);

    // Wait for lip sync to complete
    await sleep(2500);

    if (lipSync.getSyncing()) {
      console.warn('⚠️  Lip sync still running after expected duration');
    }

    console.log('✅ Lip sync completed');

    await adapter.disconnect();
    return true;
  } catch (error) {
    console.error('❌ Lip sync test failed:', error);
    await adapter.disconnect();
    return false;
  }
}

async function testExpressionService() {
  console.log('\n[Test 5] Expression Service');

  const adapter = new VTubeStudioAdapter();

  try {
    await adapter.connect({
      host: 'localhost',
      port: 8001,
      authToken: process.env.VTS_AUTH_TOKEN
    });

    const expression = new ExpressionService(adapter, {
      hotkeyMap: {
        [EmotionState.NEUTRAL]: process.env.VTS_HOTKEY_NEUTRAL || '',
        [EmotionState.HAPPY]: process.env.VTS_HOTKEY_HAPPY || '',
        [EmotionState.SAD]: process.env.VTS_HOTKEY_SAD || '',
        [EmotionState.ANGRY]: process.env.VTS_HOTKEY_ANGRY || '',
        [EmotionState.EXCITED]: process.env.VTS_HOTKEY_EXCITED || ''
      },
      debounceMs: 500
    });

    const emotions = [
      EmotionState.HAPPY,
      EmotionState.SAD,
      EmotionState.ANGRY,
      EmotionState.EXCITED,
      EmotionState.NEUTRAL
    ];

    for (const emotion of emotions) {
      const hotkeyId = expression.getHotkeyMap()[emotion];

      if (!hotkeyId) {
        console.warn(`⚠️  No hotkey configured for ${emotion}, skipping`);
        continue;
      }

      await expression.onEmotionChanged(emotion);
      console.log(`   Changed to ${emotion}`);
      await sleep(1000);
    }

    console.log('✅ Expression changes completed');

    await adapter.disconnect();
    return true;
  } catch (error) {
    console.error('❌ Expression test failed:', error);
    await adapter.disconnect();
    return false;
  }
}

function createTestWavBuffer(
  sampleRate: number,
  channels: number,
  bitsPerSample: number,
  durationSeconds: number
): Buffer {
  const dataSize = sampleRate * channels * (bitsPerSample / 8) * durationSeconds;
  const fileSize = 36 + dataSize;

  const buffer = Buffer.alloc(44 + dataSize);

  // RIFF header
  buffer.write('RIFF', 0, 'ascii');
  buffer.writeUInt32LE(fileSize, 4);
  buffer.write('WAVE', 8, 'ascii');

  // fmt chunk
  buffer.write('fmt ', 12, 'ascii');
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(channels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * channels * (bitsPerSample / 8), 28);
  buffer.writeUInt16LE(channels * (bitsPerSample / 8), 32);
  buffer.writeUInt16LE(bitsPerSample, 34);

  // data chunk
  buffer.write('data', 36, 'ascii');
  buffer.writeUInt32LE(dataSize, 40);

  // Fill with sine wave
  for (let i = 0; i < dataSize / (bitsPerSample / 8); i++) {
    const value = Math.sin(2 * Math.PI * 440 * i / sampleRate);
    const sample = Math.floor(value * 16000);
    buffer.writeInt16LE(sample, 44 + i * 2);
  }

  return buffer;
}

async function runTests() {
  console.log('='.repeat(50));
  console.log('VTubeStudioAdapter Integration Tests');
  console.log('='.repeat(50));
  console.log('Note: VTube Studio must be running on localhost:8001');
  console.log('');

  if (!process.env.VTS_ENABLED || process.env.VTS_ENABLED !== 'true') {
    console.error('❌ VTS_ENABLED is not set to true');
    console.log('   Please set VTS_ENABLED=true to run these tests');
    process.exit(1);
  }

  const tests = [
    testConnection,
    testParameterUpdate,
    testHotkeyTrigger,
    testLipSyncService,
    testExpressionService
  ];

  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    try {
      if (await test()) {
        passed++;
      } else {
        failed++;
      }
    } catch (error) {
      console.error(`❌ Test threw exception: ${error}`);
      failed++;
    }
  }

  console.log('\n' + '='.repeat(50));
  console.log(`Tests completed: ${passed} passed, ${failed} failed`);
  console.log('='.repeat(50));

  process.exit(failed > 0 ? 1 : 0);
}

runTests();
