export type VolumeFrame = {
  timeMs: number;
  volume: number;
};

export type WavInfo = {
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
  durationMs: number;
};

export class VolumeAnalyzer {
  private readonly defaultFrameDurationMs = 16;

  public analyzeWav(buffer: Buffer, frameDurationMs?: number): VolumeFrame[] {
    const frames: VolumeFrame[] = [];
    const duration = frameDurationMs ?? this.defaultFrameDurationMs;

    const header = this.parseWavHeader(buffer);
    if (!header) {
      console.warn('[VolumeAnalyzer] Failed to parse WAV header');
      return frames;
    }

    const { fmt, dataOffset, dataSize } = header;
    const samplesPerFrame = Math.floor((fmt.sampleRate * duration) / 1000);
    const bytesPerSample = fmt.bitsPerSample / 8;
    const bytesPerFrame = samplesPerFrame * fmt.channels * bytesPerSample;

    let currentTime = 0;
    let offset = dataOffset;

    while (offset + bytesPerFrame <= dataOffset + dataSize) {
      const samples: number[] = [];

      for (let i = 0; i < samplesPerFrame * fmt.channels; i++) {
        const sample = this.normalizeSample(buffer, offset + i * bytesPerSample, fmt.bitsPerSample);
        samples.push(Math.abs(sample));
      }

      const rms = this.calculateRms(samples);
      const volume = Math.min(1, Math.max(0, rms * 2.0));

      frames.push({ timeMs: currentTime, volume });

      currentTime += duration;
      offset += bytesPerFrame;
    }

    return frames;
  }

  public getWavInfo(buffer: Buffer): WavInfo | null {
    const header = this.parseWavHeader(buffer);
    if (!header) {
      return null;
    }

    const { fmt, dataSize } = header;
    const bytesPerSample = fmt.bitsPerSample / 8;
    const durationSeconds = dataSize / (fmt.sampleRate * fmt.channels * bytesPerSample);
    const durationMs = Math.max(0, Math.round(durationSeconds * 1000));

    return {
      sampleRate: fmt.sampleRate,
      channels: fmt.channels,
      bitsPerSample: fmt.bitsPerSample,
      durationMs
    };
  }

  private parseWavHeader(buffer: Buffer): {
    fmt: { sampleRate: number; channels: number; bitsPerSample: number };
    dataOffset: number;
    dataSize: number;
  } | null {
    if (buffer.length < 44) {
      return null;
    }

    if (buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WAVE') {
      return null;
    }

    let offset = 12;
    let sampleRate = 0;
    let bitsPerSample = 0;
    let channels = 0;
    let dataSize = 0;
    let dataOffset = 0;

    while (offset + 8 <= buffer.length) {
      const chunkId = buffer.toString('ascii', offset, offset + 4);
      const chunkSize = buffer.readUInt32LE(offset + 4);
      const chunkDataStart = offset + 8;

      if (chunkId === 'fmt ') {
        if (chunkSize >= 16 && chunkDataStart + 16 <= buffer.length) {
          channels = buffer.readUInt16LE(chunkDataStart + 2);
          sampleRate = buffer.readUInt32LE(chunkDataStart + 4);
          bitsPerSample = buffer.readUInt16LE(chunkDataStart + 14);
        }
      }

      if (chunkId === 'data') {
        dataSize = chunkSize;
        dataOffset = chunkDataStart;
        break;
      }

      offset += 8 + chunkSize + (chunkSize % 2);
    }

    if (!sampleRate || !bitsPerSample || !channels || !dataSize) {
      return null;
    }

    return {
      fmt: { sampleRate, channels, bitsPerSample },
      dataOffset,
      dataSize
    };
  }

  private calculateRms(samples: number[]): number {
    if (samples.length === 0) {
      return 0;
    }

    const sumSquares = samples.reduce((sum, sample) => sum + sample * sample, 0);
    return Math.sqrt(sumSquares / samples.length);
  }

  private normalizeSample(buffer: Buffer, offset: number, bitsPerSample: number): number {
    if (offset + bitsPerSample / 8 > buffer.length) {
      return 0;
    }

    let sample = 0;
    if (bitsPerSample === 8) {
      sample = (buffer.readUInt8(offset) - 128) / 128;
    } else if (bitsPerSample === 16) {
      sample = buffer.readInt16LE(offset) / 32768;
    } else if (bitsPerSample === 24) {
      const byte1 = buffer.readUInt8(offset);
      const byte2 = buffer.readUInt8(offset + 1);
      const byte3 = buffer.readInt8(offset + 2);
      sample = ((byte3 << 16) | (byte2 << 8) | byte1) / 8388608;
    } else if (bitsPerSample === 32) {
      sample = buffer.readInt32LE(offset) / 2147483648;
    }

    return sample;
  }
}
