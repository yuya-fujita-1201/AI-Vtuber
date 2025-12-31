import axios, { AxiosInstance } from 'axios';
import { config } from '../config/AppConfig';

export type NewsArticle = {
  title: string;
  description?: string;
  url?: string;
  source?: string;
  publishedAt?: string;
};

export type NewsApiServiceOptions = {
  apiKey?: string;
  baseUrl?: string;
  language?: string;
  maxResults?: number;
  timeoutMs?: number;
};

export class NewsApiService {
  private client: AxiosInstance;
  private apiKey: string;
  private baseUrl: string;
  private language: string;
  private maxResults: number;
  private timeoutMs: number;

  constructor(options: NewsApiServiceOptions = {}) {
    this.apiKey = options.apiKey ?? config.news.apiKey;
    this.baseUrl = (options.baseUrl ?? config.news.baseUrl).replace(/\/$/, '');
    this.language = options.language ?? config.news.language;
    this.maxResults = options.maxResults ?? config.news.maxResults;
    this.timeoutMs = options.timeoutMs ?? config.news.timeoutMs;

    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: this.timeoutMs
    });
  }

  public updateConfig(options: NewsApiServiceOptions = {}) {
    this.apiKey = options.apiKey ?? config.news.apiKey;
    this.baseUrl = (options.baseUrl ?? config.news.baseUrl).replace(/\/$/, '');
    this.language = options.language ?? config.news.language;
    this.maxResults = options.maxResults ?? config.news.maxResults;
    this.timeoutMs = options.timeoutMs ?? config.news.timeoutMs;
    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: this.timeoutMs
    });
  }

  public async getTopHeadlines(query?: string): Promise<NewsArticle[]> {
    if (!this.apiKey) {
      throw new Error('NEWS_API_KEY is missing');
    }

    const params: Record<string, string | number> = {
      apiKey: this.apiKey,
      language: this.language,
      pageSize: this.maxResults
    };

    if (query) {
      params.q = query;
    }

    const response = await this.client.get('/top-headlines', { params });
    const articles = response.data?.articles;
    if (!Array.isArray(articles)) {
      return [];
    }

    return articles
      .map((article: any) => ({
        title: article?.title ?? '',
        description: article?.description ?? undefined,
        url: article?.url ?? undefined,
        source: article?.source?.name ?? undefined,
        publishedAt: article?.publishedAt ?? undefined
      }))
      .filter(article => article.title);
  }
}
