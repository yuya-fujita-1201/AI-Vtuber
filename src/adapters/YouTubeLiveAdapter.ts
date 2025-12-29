import { google, youtube_v3 } from 'googleapis';
import { ChatMessage, IChatAdapter } from '../interfaces';
import { config as appConfig } from '../config/AppConfig';
import { logger } from '../lib/logger';

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
  private pollingIntervalMs = appConfig.adapters.youtube.pollingIntervalMs;
  private nextAllowedAt = 0;
  private connected = false;
  private backoffMs = 0;
  private seenIds = new Set<string>();

  async connect(options: YouTubeLiveAdapterConfig): Promise<void> {
    if (!options?.apiKey) {
      throw new Error('YouTubeLiveAdapter requires an apiKey');
    }

    this.youtube = google.youtube({ version: 'v3', auth: options.apiKey });
    this.pollingIntervalMs = options.pollingInterval ?? appConfig.adapters.youtube.pollingIntervalMs;
    // Treat empty string as undefined/false so resolution runs
    this.liveChatId = options.liveChatId || (await this.resolveLiveChatId(options));

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

      if (this.seenIds.size > appConfig.adapters.youtube.seenIdLimit) {
        this.seenIds.clear();
      }

      return messages;
    } catch (error) {
      logger.error('[YouTubeLiveAdapter] fetch error', error);
      this.backoffMs = this.backoffMs === 0
        ? appConfig.adapters.youtube.backoffInitialMs
        : Math.min(this.backoffMs * 2, appConfig.adapters.youtube.backoffMaxMs);
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
        logger.info(`[YouTubeLiveAdapter] Resolving chat ID for video: "${config.videoId}"`);
        const response = await this.youtube.videos.list({
          part: ['liveStreamingDetails', 'snippet'],
          id: [config.videoId]
        });
        const items = response.data.items;
        logger.info(`[YouTubeLiveAdapter] API response items: ${items?.length ?? 0}`);

        const liveDetails = items?.[0]?.liveStreamingDetails;
        if (liveDetails?.activeLiveChatId) {
          logger.info(`[YouTubeLiveAdapter] Found Chat ID: ${liveDetails.activeLiveChatId}`);
          return liveDetails.activeLiveChatId;
        } else {
          logger.warn('[YouTubeLiveAdapter] No activeLiveChatId found in liveDetails:', JSON.stringify(liveDetails, null, 2));
        }
      } catch (error) {
        logger.error('[YouTubeLiveAdapter] videos.list failed', error);
      }
    }

    try {
      const response = await this.youtube.liveBroadcasts.list({
        part: ['snippet'],
        broadcastStatus: 'active',
        broadcastType: 'all',
        maxResults: appConfig.adapters.youtube.liveBroadcastMaxResults
      });
      const liveChatId = response.data.items?.[0]?.snippet?.liveChatId;
      if (liveChatId) {
        return liveChatId;
      }
    } catch (error) {
      logger.error('[YouTubeLiveAdapter] liveBroadcasts.list failed', error);
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
