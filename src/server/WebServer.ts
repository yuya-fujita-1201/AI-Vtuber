import express, { Express } from 'express';
import { createServer, Server as HttpServer } from 'http';
import path from 'path';
import { Server as SocketIOServer } from 'socket.io';
import { IAgentEventEmitter } from '../interfaces';
import { config, reloadConfig } from '../config/AppConfig';
import { Agent } from '../core/Agent';
import { EmotionState } from '../core/EmotionEngine';
import { logger } from '../lib/logger';

export class WebServer implements IAgentEventEmitter {
    private app: Express;
    private httpServer?: HttpServer;
    private io?: SocketIOServer;
    private readonly publicDir: string;
    private agent?: Agent;

    constructor(publicDir: string = path.join(process.cwd(), 'public')) {
        this.app = express();
        this.publicDir = publicDir;
    }

    public setAgent(agent: Agent): void {
        this.agent = agent;
    }

    public async start(port: number): Promise<void> {
        if (this.httpServer) {
            return;
        }

        this.app.use(express.json());
        this.app.use(express.static(this.publicDir));

        this.app.get('/', (_req, res) => {
            res.redirect('/dashboard.html');
        });

        this.app.get('/health', (_req, res) => {
            res.status(200).json({ status: 'ok' });
        });

        this.app.post('/reload-config', (req, res) => {
            const secret = config.server.reloadSecret;
            if (!secret) {
                res.status(401).json({ error: 'Reload secret is not configured.' });
                return;
            }

            const authHeader = req.header('authorization')?.trim() ?? '';
            const token = authHeader.toLowerCase().startsWith('bearer ')
                ? authHeader.slice(7).trim()
                : authHeader;

            if (!token || token !== secret) {
                res.status(401).json({ error: 'Unauthorized' });
                return;
            }

            const updated = reloadConfig();
            this.agent?.reloadConfig();
            logger.info('[WebServer] Config reloaded via /reload-config');
            res.status(200).json({ status: 'ok', reloadedAt: Date.now(), env: updated.env.nodeEnv });
        });

        this.httpServer = createServer(this.app);
        this.io = new SocketIOServer(this.httpServer, {
            cors: {
                origin: config.server.corsOrigin
            }
        });

        this.io.on('connection', (socket) => {
            logger.info(`[WebServer] Client connected: ${socket.id}`);
            socket.emit('connected', { at: Date.now() });

            socket.on('disconnect', () => {
                logger.info(`[WebServer] Client disconnected: ${socket.id}`);
            });

            socket.on('force_emotion', (payload: { state?: string; durationMs?: number }) => {
                if (!this.agent) {
                    logger.warn('[WebServer] force_emotion ignored: agent not ready');
                    return;
                }

                const stateRaw = payload?.state?.toString().trim().toUpperCase();
                const state = Object.values(EmotionState).find(value => value === stateRaw) as EmotionState | undefined;
                if (!state) {
                    logger.warn('[WebServer] force_emotion ignored: invalid state', payload);
                    return;
                }

                const durationMs = this.parseDurationMs(payload?.durationMs, config.emotion.lockStateDefaultMs);
                this.agent.lockEmotion(state, durationMs);
                logger.info(`[WebServer] force_emotion -> ${state} (${durationMs}ms)`);
            });

            socket.on('trigger_monologue', () => {
                if (!this.agent) {
                    logger.warn('[WebServer] trigger_monologue ignored: agent not ready');
                    return;
                }
                void this.agent.triggerMonologue();
                logger.info('[WebServer] trigger_monologue invoked');
            });

            socket.on('set_ng_word', (payload: { word?: string; durationMs?: number }) => {
                if (!this.agent) {
                    logger.warn('[WebServer] set_ng_word ignored: agent not ready');
                    return;
                }

                const word = payload?.word?.toString() ?? '';
                const durationMs = this.parseDurationMs(payload?.durationMs, config.agent.moderation.ngWord.defaultDurationMs);
                const ok = this.agent.setNgWord(word, durationMs);
                if (!ok) {
                    logger.warn('[WebServer] set_ng_word ignored: invalid word');
                    return;
                }
                logger.info(`[WebServer] set_ng_word -> "${word.trim()}" (${durationMs}ms)`);
            });

            socket.on('mute_user', (payload: { user?: string; durationMs?: number }) => {
                if (!this.agent) {
                    logger.warn('[WebServer] mute_user ignored: agent not ready');
                    return;
                }

                const user = payload?.user?.toString() ?? '';
                const durationMs = this.parseDurationMs(payload?.durationMs, config.agent.moderation.mute.defaultDurationMs);
                const ok = this.agent.muteUser(user, durationMs);
                if (!ok) {
                    logger.warn('[WebServer] mute_user ignored: invalid user');
                    return;
                }
                logger.info(`[WebServer] mute_user -> "${user.trim()}" (${durationMs}ms)`);
            });
        });

        await new Promise<void>((resolve, reject) => {
            if (!this.httpServer) {
                reject(new Error('HTTP server not initialized'));
                return;
            }

            this.httpServer.once('error', reject);
            this.httpServer.listen(port, () => resolve());
        });
    }

    public async stop(): Promise<void> {
        if (!this.httpServer) {
            return;
        }

        await new Promise<void>((resolve) => {
            this.httpServer?.close(() => resolve());
        });

        this.io?.removeAllListeners();
        this.io = undefined;
        this.httpServer = undefined;
    }

    public broadcast(event: string, data?: unknown): void {
        this.io?.emit(event, data);
    }

    private parseDurationMs(value: unknown, fallback: number): number {
        if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
            return value;
        }
        if (typeof value === 'string') {
            const parsed = Number(value);
            if (Number.isFinite(parsed) && parsed > 0) {
                return parsed;
            }
        }
        return fallback;
    }
}
