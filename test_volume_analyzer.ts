import { VolumeAnalyzer } from './src/services/VolumeAnalyzer';

/**
 * VolumeAnalyzer Unit Tests
 *
 * Tests:
 * 1. WAV header parsing
 * 2. Volume frame extraction
 * 3. RMS calculation
 * 4. Edge cases (empty buffer, invalid WAV, etc.)
 */

function createTestWavBuffer(
  sampleRate: number = 24000,
  channels: number = 1,
  bitsPerSample: number = 16,
  durationSeconds: number = 1
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
  buffer.writeUInt32LE(16, 16); // fmt chunk size
  buffer.writeUInt16LE(1, 20); // audio format (PCM)
  buffer.writeUInt16LE(channels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * channels * (bitsPerSample / 8), 28); // byte rate
  buffer.writeUInt16LE(channels * (bitsPerSample / 8), 32); // block align
  buffer.writeUInt16LE(bitsPerSample, 34);

  // data chunk
  buffer.write('data', 36, 'ascii');
  buffer.writeUInt32LE(dataSize, 40);

  // Fill with sample data (sine wave for testing)
  const bytesPerSample = bitsPerSample / 8;
  for (let i = 0; i < dataSize / bytesPerSample; i++) {
    const value = Math.sin(2 * Math.PI * 440 * i / sampleRate); // 440Hz sine wave
    const sample = Math.floor(value * (bitsPerSample === 16 ? 32767 : 127));

    if (bitsPerSample === 16) {
      buffer.writeInt16LE(sample, 44 + i * 2);
    } else if (bitsPerSample === 8) {
      buffer.writeUInt8(sample + 128, 44 + i);
    }
  }

  return buffer;
}

function testWavInfoParsing() {
  console.log('[Test 1] WAV Info Parsing');

  const analyzer = new VolumeAnalyzer();
  const testBuffer = createTestWavBuffer(24000, 1, 16, 1);

  const info = analyzer.getWavInfo(testBuffer);

  if (!info) {
    console.error('❌ Failed to parse WAV info');
    return false;
  }

  if (info.sampleRate !== 24000) {
    console.error(`❌ Sample rate mismatch: expected 24000, got ${info.sampleRate}`);
    return false;
  }

  if (info.channels !== 1) {
    console.error(`❌ Channels mismatch: expected 1, got ${info.channels}`);
    return false;
  }

  if (info.bitsPerSample !== 16) {
    console.error(`❌ Bits per sample mismatch: expected 16, got ${info.bitsPerSample}`);
    return false;
  }

  const expectedDuration = 1000; // 1 second
  if (Math.abs(info.durationMs - expectedDuration) > 10) {
    console.error(`❌ Duration mismatch: expected ~${expectedDuration}ms, got ${info.durationMs}ms`);
    return false;
  }

  console.log('✅ WAV info parsed correctly');
  console.log(`   Sample rate: ${info.sampleRate}Hz`);
  console.log(`   Channels: ${info.channels}`);
  console.log(`   Bits per sample: ${info.bitsPerSample}`);
  console.log(`   Duration: ${info.durationMs}ms`);

  return true;
}

function testVolumeFrameExtraction() {
  console.log('\n[Test 2] Volume Frame Extraction');

  const analyzer = new VolumeAnalyzer();
  const testBuffer = createTestWavBuffer(24000, 1, 16, 0.5); // 500ms audio

  const frames = analyzer.analyzeWav(testBuffer, 16); // 16ms frames = ~60fps

  if (frames.length === 0) {
    console.error('❌ No frames extracted');
    return false;
  }

  const expectedFrames = Math.floor(500 / 16); // ~31 frames
  if (Math.abs(frames.length - expectedFrames) > 2) {
    console.error(`❌ Frame count mismatch: expected ~${expectedFrames}, got ${frames.length}`);
    return false;
  }

  // Check frame timing
  for (let i = 0; i < Math.min(5, frames.length); i++) {
    const expectedTime = i * 16;
    if (Math.abs(frames[i].timeMs - expectedTime) > 1) {
      console.error(`❌ Frame timing mismatch at frame ${i}: expected ${expectedTime}ms, got ${frames[i].timeMs}ms`);
      return false;
    }
  }

  // Check volume values are in valid range
  for (const frame of frames) {
    if (frame.volume < 0 || frame.volume > 1) {
      console.error(`❌ Volume out of range: ${frame.volume} at ${frame.timeMs}ms`);
      return false;
    }
  }

  console.log(`✅ Extracted ${frames.length} frames correctly`);
  console.log(`   Frame duration: 16ms (~60fps)`);
  console.log(`   Volume range: [${Math.min(...frames.map(f => f.volume)).toFixed(3)}, ${Math.max(...frames.map(f => f.volume)).toFixed(3)}]`);

  return true;
}

function testEmptyBuffer() {
  console.log('\n[Test 3] Empty Buffer Handling');

  const analyzer = new VolumeAnalyzer();
  const emptyBuffer = Buffer.alloc(0);

  const info = analyzer.getWavInfo(emptyBuffer);
  if (info !== null) {
    console.error('❌ Expected null for empty buffer');
    return false;
  }

  const frames = analyzer.analyzeWav(emptyBuffer);
  if (frames.length !== 0) {
    console.error('❌ Expected empty frame array');
    return false;
  }

  console.log('✅ Empty buffer handled correctly');
  return true;
}

function testInvalidWavFormat() {
  console.log('\n[Test 4] Invalid WAV Format Handling');

  const analyzer = new VolumeAnalyzer();
  const invalidBuffer = Buffer.from('This is not a WAV file');

  const info = analyzer.getWavInfo(invalidBuffer);
  if (info !== null) {
    console.error('❌ Expected null for invalid WAV');
    return false;
  }

  const frames = analyzer.analyzeWav(invalidBuffer);
  if (frames.length !== 0) {
    console.error('❌ Expected empty frame array for invalid WAV');
    return false;
  }

  console.log('✅ Invalid WAV format handled correctly');
  return true;
}

function testDifferentBitDepths() {
  console.log('\n[Test 5] Different Bit Depths');

  const analyzer = new VolumeAnalyzer();
  const bitDepths = [8, 16];

  for (const bits of bitDepths) {
    const testBuffer = createTestWavBuffer(24000, 1, bits, 0.1);
    const frames = analyzer.analyzeWav(testBuffer);

    if (frames.length === 0) {
      console.error(`❌ Failed to extract frames for ${bits}-bit audio`);
      return false;
    }

    console.log(`   ${bits}-bit: ${frames.length} frames extracted`);
  }

  console.log('✅ All bit depths handled correctly');
  return true;
}

function testSilenceDetection() {
  console.log('\n[Test 6] Silence Detection');

  const analyzer = new VolumeAnalyzer();

  // Create silent WAV (all zeros)
  const buffer = createTestWavBuffer(24000, 1, 16, 0.1);

  // Overwrite data section with zeros
  for (let i = 44; i < buffer.length; i++) {
    buffer[i] = 0;
  }

  const frames = analyzer.analyzeWav(buffer);

  if (frames.length === 0) {
    console.error('❌ No frames extracted from silent audio');
    return false;
  }

  // All volumes should be 0 or very close to 0
  const maxVolume = Math.max(...frames.map(f => f.volume));
  if (maxVolume > 0.01) {
    console.error(`❌ Expected near-zero volume for silence, got ${maxVolume}`);
    return false;
  }

  console.log(`✅ Silence detected correctly (max volume: ${maxVolume.toFixed(6)})`);
  return true;
}

// Run all tests
async function runTests() {
  console.log('='.repeat(50));
  console.log('VolumeAnalyzer Unit Tests');
  console.log('='.repeat(50));

  const tests = [
    testWavInfoParsing,
    testVolumeFrameExtraction,
    testEmptyBuffer,
    testInvalidWavFormat,
    testDifferentBitDepths,
    testSilenceDetection
  ];

  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    try {
      if (test()) {
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
