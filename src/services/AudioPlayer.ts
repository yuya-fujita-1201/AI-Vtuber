import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { IAudioPlayer } from '../interfaces';

export class AudioPlayer implements IAudioPlayer {
    private currentPlayback: Promise<void> | null = null;
    private readonly command: string;

    constructor(command?: string) {
        this.command = command ?? this.resolveDefaultCommand();
    }

    public async play(buffer: Buffer): Promise<void> {
        if (!buffer || buffer.length === 0) {
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
