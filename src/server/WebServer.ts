import express, { Express } from 'express';
import { createServer, Server as HttpServer } from 'http';
import path from 'path';
import { Server as SocketIOServer } from 'socket.io';
import { IAgentEventEmitter } from '../interfaces';

export class WebServer implements IAgentEventEmitter {
    private app: Express;
    private httpServer?: HttpServer;
    private io?: SocketIOServer;
    private readonly publicDir: string;

    constructor(publicDir: string = path.join(process.cwd(), 'public')) {
        this.app = express();
        this.publicDir = publicDir;
    }

    public async start(port: number): Promise<void> {
        if (this.httpServer) {
            return;
        }

        this.app.use(express.static(this.publicDir));

        this.app.get('/', (_req, res) => {
            res.redirect('/dashboard.html');
        });

        this.app.get('/health', (_req, res) => {
            res.status(200).json({ status: 'ok' });
        });

        this.httpServer = createServer(this.app);
        this.io = new SocketIOServer(this.httpServer, {
            cors: {
                origin: '*'
            }
        });

        this.io.on('connection', (socket) => {
            console.log(`[WebServer] Client connected: ${socket.id}`);
            socket.emit('connected', { at: Date.now() });

            socket.on('disconnect', () => {
                console.log(`[WebServer] Client disconnected: ${socket.id}`);
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
}
