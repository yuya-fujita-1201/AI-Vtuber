import { google, youtube_v3 } from 'googleapis';
import { ChatMessage, IChatAdapter } from '../interfaces';

export interface YouTubeLiveAdapterConfig {
  apiKey: string;
  liveChatId?: string;
  videoId?: string;
  pollingInterval?: number;
}

export class YouTubeLiveAdapter implements IChatAdapter<YouTubeLiveAdapterConfig> {
  private youtube?: youtube_v3.Youtube;
  private liveChatId?: string;
  private nextPageToken?: string;
  private pollingIntervalMs = 1000;
  private nextAllowedAt = 0;
  private connected = false;
  private backoffMs = 0;
  private seenIds = new Set<string>();

  async connect(config: YouTubeLiveAdapterConfig): Promise<void> {
    if (!config?.apiKey) {
      throw new Error('YouTubeLiveAdapter requires an apiKey');
    }

    this.youtube = google.youtube({ version: 'v3', auth: config.apiKey });
    this.pollingIntervalMs = config.pollingInterval ?? 1000;
    this.liveChatId = config.liveChatId ?? (await this.resolveLiveChatId(config));

    if (!this.liveChatId) {
      throw new Error('liveChatId could not be resolved. Set YOUTUBE_LIVE_CHAT_ID or YOUTUBE_VIDEO_ID.');
    }

    this.connected = true;
  }

  async fetchNewMessages(): Promise<ChatMessage[]> {
    if (!this.connected || !this.youtube || !this.liveChatId) {
      return [];
    }

    await this.waitForPollingWindow();

    try {
      const response = await this.youtube.liveChatMessages.list({
        part: ['snippet', 'authorDetails'],
        liveChatId: this.liveChatId,
        pageToken: this.nextPageToken
      });

      const data = response.data;
      this.nextPageToken = data.nextPageToken ?? this.nextPageToken;
      this.pollingIntervalMs = data.pollingIntervalMillis ?? this.pollingIntervalMs;
      this.nextAllowedAt = Date.now() + this.pollingIntervalMs;
      this.backoffMs = 0;

      const items = data.items ?? [];
      const messages: ChatMessage[] = [];

      for (const item of items) {
        const message = this.toChatMessage(item);
        if (!message) {
          continue;
        }
        if (this.seenIds.has(message.id)) {
          continue;
        }
        this.seenIds.add(message.id);
        messages.push(message);
      }

      if (this.seenIds.size > 5000) {
        this.seenIds.clear();
      }

      return messages;
    } catch (error) {
      console.error('[YouTubeLiveAdapter] fetch error', error);
      this.backoffMs = this.backoffMs === 0 ? 1000 : Math.min(this.backoffMs * 2, 60000);
      this.nextAllowedAt = Date.now() + this.backoffMs;
      await sleep(this.backoffMs);
      return [];
    }
  }

  disconnect(): void {
    this.connected = false;
  }

  private async resolveLiveChatId(config: YouTubeLiveAdapterConfig): Promise<string | undefined> {
    if (!this.youtube) {
      return undefined;
    }

    if (config.videoId) {
      try {
        const response = await this.youtube.videos.list({
          part: ['liveStreamingDetails'],
          id: [config.videoId]
        });
        const liveDetails = response.data.items?.[0]?.liveStreamingDetails;
        if (liveDetails?.activeLiveChatId) {
          return liveDetails.activeLiveChatId;
        }
      } catch (error) {
        console.error('[YouTubeLiveAdapter] videos.list failed', error);
      }
    }

    try {
      const response = await this.youtube.liveBroadcasts.list({
        part: ['snippet'],
        broadcastStatus: 'active',
        broadcastType: 'all',
        maxResults: 1
      });
      const liveChatId = response.data.items?.[0]?.snippet?.liveChatId;
      if (liveChatId) {
        return liveChatId;
      }
    } catch (error) {
      console.error('[YouTubeLiveAdapter] liveBroadcasts.list failed', error);
    }

    return undefined;
  }

  private toChatMessage(item: youtube_v3.Schema$LiveChatMessage): ChatMessage | null {
    const id = item.id ?? '';
    const content = item.snippet?.displayMessage ?? '';
    const authorName = item.authorDetails?.displayName ?? 'Unknown';
    const publishedAt = item.snippet?.publishedAt;
    const timestamp = publishedAt ? new Date(publishedAt).getTime() : Date.now();

    if (!id || !content) {
      return null;
    }

    return { id, authorName, content, timestamp };
  }

  private async waitForPollingWindow(): Promise<void> {
    const now = Date.now();
    const waitMs = Math.max(0, this.nextAllowedAt - now);
    if (waitMs > 0) {
      await sleep(waitMs);
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
