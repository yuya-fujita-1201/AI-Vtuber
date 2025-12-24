import { promises as fs } from 'node:fs';
import { ChatMessage, IChatAdapter } from '../interfaces';

export interface FileReplayAdapterConfig {
  filePath: string;
  pollingInterval?: number;
}

export class FileReplayAdapter implements IChatAdapter<FileReplayAdapterConfig> {
  private messages: ChatMessage[] = [];
  private cursor = 0;
  private pollingInterval = 1000;
  private nextEmitAt = 0;
  private connected = false;

  async connect(config: FileReplayAdapterConfig): Promise<void> {
    if (!config?.filePath) {
      throw new Error('FileReplayAdapter requires a filePath');
    }

    this.pollingInterval = config.pollingInterval ?? 1000;
    const raw = await fs.readFile(config.filePath, 'utf-8');
    const parsed = JSON.parse(raw);

    if (!Array.isArray(parsed)) {
      throw new Error('Replay file must be a JSON array');
    }

    this.messages = parsed.map((item, index) => this.normalizeMessage(item, index));
    this.cursor = 0;
    this.nextEmitAt = 0;
    this.connected = true;
  }

  async fetchNewMessages(): Promise<ChatMessage[]> {
    if (!this.connected) {
      return [];
    }

    if (this.cursor >= this.messages.length) {
      return [];
    }

    const now = Date.now();
    if (this.nextEmitAt === 0) {
      this.nextEmitAt = now;
    }

    if (now < this.nextEmitAt) {
      return [];
    }

    const intervalsElapsed = Math.floor((now - this.nextEmitAt) / this.pollingInterval) + 1;
    const remaining = this.messages.length - this.cursor;
    const count = Math.min(intervalsElapsed, remaining);
    const batch = this.messages.slice(this.cursor, this.cursor + count);

    this.cursor += count;
    this.nextEmitAt += intervalsElapsed * this.pollingInterval;

    return batch;
  }

  disconnect(): void {
    this.connected = false;
  }

  private normalizeMessage(item: unknown, index: number): ChatMessage {
    const fallbackId = `replay-${index}`;
    const now = Date.now();

    if (typeof item === 'object' && item !== null) {
      const record = item as Record<string, unknown>;
      const id = typeof record.id === 'string' ? record.id : fallbackId;
      const authorName =
        typeof record.authorName === 'string'
          ? record.authorName
          : typeof record.author === 'string'
            ? record.author
            : 'Unknown';
      const content =
        typeof record.content === 'string'
          ? record.content
          : typeof record.message === 'string'
            ? record.message
            : '';
      const timestamp =
        typeof record.timestamp === 'number'
          ? record.timestamp
          : typeof record.publishedAt === 'number'
            ? record.publishedAt
            : now;

      return { id, authorName, content, timestamp };
    }

    return { id: fallbackId, authorName: 'Unknown', content: String(item ?? ''), timestamp: now };
  }
}
