import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { IAudioPlayer } from '../interfaces';

export class AudioPlayer implements IAudioPlayer {
    private currentPlayback: Promise<void> | null = null;
    private readonly command: string;
    private readonly isDryRun: boolean;

    constructor(command?: string) {
        this.command = command ?? this.resolveDefaultCommand();
        this.isDryRun = parseBoolean(process.env.DRY_RUN);

        if (this.isDryRun) {
            console.log('[AudioPlayer] DRY_RUN enabled. Skipping audio playback.');
        }
    }

    public async play(buffer: Buffer): Promise<void> {
        if (!buffer || buffer.length === 0) {
            return;
        }
        if (this.isDryRun) {
            return;
        }

        const playback = async () => {
            const tempPath = path.join(
                os.tmpdir(),
                `kamee-tts-${Date.now()}-${Math.random().toString(16).slice(2)}.wav`
            );

            try {
                await fs.writeFile(tempPath, buffer);
                await this.playFile(tempPath);
            } catch (error) {
                console.error('[AudioPlayer] play failed', error);
            } finally {
                await fs.unlink(tempPath).catch(() => undefined);
            }
        };

        const previous = this.currentPlayback ?? Promise.resolve();
        const next = previous.then(playback, playback);
        this.currentPlayback = next;

        try {
            await next;
        } finally {
            if (this.currentPlayback === next) {
                this.currentPlayback = null;
            }
        }
    }

    private playFile(filePath: string): Promise<void> {
        return new Promise((resolve) => {
            const child = spawn(this.command, [filePath], { stdio: 'ignore' });

            child.once('error', (error) => {
                console.error(`[AudioPlayer] Failed to start ${this.command}`, error);
                resolve();
            });

            child.once('close', () => resolve());
        });
    }

    private resolveDefaultCommand(): string {
        if (process.env.AUDIO_PLAYER_COMMAND) {
            return process.env.AUDIO_PLAYER_COMMAND;
        }

        if (process.platform === 'darwin') {
            return 'afplay';
        }

        if (process.platform === 'linux') {
            return 'aplay';
        }

        return 'afplay';
    }
}

const parseBoolean = (value?: string): boolean => {
    if (!value) return false;
    const normalized = value.trim().toLowerCase();
    return normalized === 'true' || normalized === '1' || normalized === 'yes';
};
