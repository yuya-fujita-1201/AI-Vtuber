/**
 * MemoryService - Hybrid Memory System
 *
 * This service provides a hybrid memory architecture:
 * 1. Prisma + SQLite: Structured data storage (sessions, messages, viewers)
 * 2. ChromaDB: Vector embeddings for semantic search
 *
 * Use Cases:
 * - Store and retrieve viewer information
 * - Search past conversations by semantic similarity
 * - Remember facts and preferences across streams
 */

import { ChromaClient, Collection } from 'chromadb';
import OpenAI from 'openai';
import { prisma } from '../lib/prisma';

export interface AddMemoryOptions {
  content: string;
  type: MemoryType;
  importance?: number; // 1-10, defaults to 5
  streamId?: string;
  topicId?: string;
  viewerId?: string;
  summary?: string;
  metadata?: Record<string, any>;
}

export interface SearchMemoryResult {
  id: string;
  content: string;
  type: string;
  importance: number;
  similarity: number; // 0-1, higher is more similar
  metadata?: any;
  createdAt: Date;
}

export enum MemoryType {
  FACT = 'FACT',                           // General fact or knowledge
  PREFERENCE = 'PREFERENCE',               // User preference (likes/dislikes)
  EVENT = 'EVENT',                         // Significant event during stream
  CONVERSATION_SUMMARY = 'CONVERSATION_SUMMARY', // Summary of past conversations
  VIEWER_INFO = 'VIEWER_INFO',             // Information about a specific viewer
  TOPIC_SUMMARY = 'TOPIC_SUMMARY',         // Summary of a topic discussion
}

export class MemoryService {
  private chromaClient: ChromaClient;
  private collection: Collection | null = null;
  private openai: OpenAI;
  private isInitialized: boolean = false;

  // Configuration
  private readonly collectionName = 'ai_vtuber_memories';
  private readonly embeddingModel = 'text-embedding-3-small';
  private readonly chromaUrl: string;

  constructor(chromaUrl: string = 'http://localhost:8000') {
    this.chromaUrl = chromaUrl;
    this.chromaClient = new ChromaClient({ path: chromaUrl });

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is required for MemoryService');
    }

    this.openai = new OpenAI({ apiKey });
  }

  /**
   * Initialize the ChromaDB connection and collection
   * Call this before using other methods
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      console.log('[MemoryService] Already initialized');
      return;
    }

    try {
      console.log(`[MemoryService] Connecting to ChromaDB at ${this.chromaUrl}...`);

      // Test connection
      await this.chromaClient.heartbeat();
      console.log('[MemoryService] ChromaDB connection successful');

      // Get or create collection
      try {
        this.collection = await this.chromaClient.getCollection({
          name: this.collectionName,
        });
        console.log(`[MemoryService] Using existing collection: ${this.collectionName}`);
      } catch (error) {
        // Collection doesn't exist, create it
        this.collection = await this.chromaClient.createCollection({
          name: this.collectionName,
          metadata: { description: 'AI VTuber long-term memories' },
        });
        console.log(`[MemoryService] Created new collection: ${this.collectionName}`);
      }

      this.isInitialized = true;
      console.log('[MemoryService] Initialization complete');
    } catch (error) {
      console.error('[MemoryService] Initialization failed:', error);
      throw new Error(`Failed to initialize MemoryService: ${error}`);
    }
  }

  /**
   * Add a new memory to both Prisma and ChromaDB
   */
  async addMemory(options: AddMemoryOptions): Promise<string> {
    if (!this.isInitialized || !this.collection) {
      throw new Error('MemoryService not initialized. Call initialize() first.');
    }

    const {
      content,
      type,
      importance = 5,
      streamId,
      topicId,
      viewerId,
      summary,
      metadata = {},
    } = options;

    try {
      // 1. Generate embedding using OpenAI
      console.log(`[MemoryService] Generating embedding for memory...`);
      const embedding = await this.generateEmbedding(content);

      // 2. Create memory in Prisma (SQLite)
      const memory = await prisma.memory.create({
        data: {
          content,
          summary,
          type,
          importance,
          streamId,
          topicId,
          viewerId,
          metadata: metadata ? JSON.stringify(metadata) : undefined,
          lastSyncedAt: new Date(),
        },
      });

      // 3. Add to ChromaDB with embedding
      const vectorId = `memory_${memory.id}`;

      // Sanitize metadata for ChromaDB (remove nulls)
      const chromaMetadata: Record<string, any> = {
        memoryId: memory.id,
        type,
        importance,
        createdAt: memory.createdAt.toISOString(),
        ...metadata,
      };

      if (streamId) chromaMetadata.streamId = streamId;
      if (topicId) chromaMetadata.topicId = topicId;
      if (viewerId) chromaMetadata.viewerId = viewerId;

      await this.collection.add({
        ids: [vectorId],
        embeddings: [embedding],
        documents: [content],
        metadatas: [chromaMetadata],
      });

      // 4. Update Prisma with vectorId
      await prisma.memory.update({
        where: { id: memory.id },
        data: { vectorId },
      });

      console.log(`[MemoryService] Memory added successfully: ${memory.id}`);
      return memory.id;
    } catch (error) {
      console.error('[MemoryService] Failed to add memory:', error);
      throw new Error(`Failed to add memory: ${error}`);
    }
  }

  /**
   * Search memories by semantic similarity
   * Returns memories ranked by relevance to the query
   */
  async searchMemory(
    query: string,
    limit: number = 5,
    filter?: { type?: MemoryType; viewerId?: string; streamId?: string }
  ): Promise<SearchMemoryResult[]> {
    if (!this.isInitialized || !this.collection) {
      throw new Error('MemoryService not initialized. Call initialize() first.');
    }

    try {
      console.log(`[MemoryService] Searching memories for: "${query}"`);

      // Generate query embedding manually for stable search
      const queryEmbedding = await this.generateEmbedding(query);

      // Build where filter for ChromaDB
      let whereFilter: Record<string, any> = {};
      const conditions: Record<string, any>[] = [];

      if (filter?.type) {
        conditions.push({ type: filter.type });
      }
      if (filter?.viewerId) {
        conditions.push({ viewerId: filter.viewerId });
      }
      if (filter?.streamId) {
        conditions.push({ streamId: filter.streamId });
      }

      if (conditions.length > 1) {
        whereFilter = { $and: conditions };
      } else if (conditions.length === 1) {
        whereFilter = conditions[0];
      }

      // Query ChromaDB with embedding (more stable than queryTexts)
      const results = await this.collection.query({
        queryEmbeddings: [queryEmbedding],
        nResults: limit,
        ...(Object.keys(whereFilter).length > 0 ? { where: whereFilter } : {}),
      });

      // Parse results
      const memories: SearchMemoryResult[] = [];

      if (results.ids[0] && results.ids[0].length > 0) {
        for (let i = 0; i < results.ids[0].length; i++) {
          const metadata = results.metadatas?.[0]?.[i];
          const document = results.documents?.[0]?.[i];
          const distance = results.distances?.[0]?.[i];

          if (!metadata || !document) continue;

          // Convert distance to similarity (0-1, higher is better)
          // ChromaDB uses cosine distance, so similarity = 1 - distance
          const similarity = (distance !== undefined && distance !== null) ? 1 - distance : 0;

          memories.push({
            id: metadata.memoryId as string,
            content: document,
            type: metadata.type as string,
            importance: metadata.importance as number,
            similarity,
            metadata,
            createdAt: new Date(metadata.createdAt as string),
          });
        }
      }

      console.log(`[MemoryService] Found ${memories.length} relevant memories`);
      return memories;
    } catch (error) {
      console.error('[MemoryService] Search failed:', error);
      throw new Error(`Failed to search memories: ${error}`);
    }
  }

  /**
   * Get memory by ID from Prisma
   */
  async getMemoryById(id: string) {
    return await prisma.memory.findUnique({
      where: { id },
      include: {
        stream: true,
        topic: true,
        viewer: true,
      },
    });
  }

  /**
   * Delete a memory from both Prisma and ChromaDB
   */
  async deleteMemory(id: string): Promise<void> {
    try {
      const memory = await prisma.memory.findUnique({ where: { id } });
      if (!memory) {
        throw new Error(`Memory not found: ${id}`);
      }

      // Delete from ChromaDB
      if (memory.vectorId && this.collection) {
        await this.collection.delete({ ids: [memory.vectorId] });
      }

      // Delete from Prisma
      await prisma.memory.delete({ where: { id } });

      console.log(`[MemoryService] Memory deleted: ${id}`);
    } catch (error) {
      console.error('[MemoryService] Failed to delete memory:', error);
      throw new Error(`Failed to delete memory: ${error}`);
    }
  }

  /**
   * Get recent memories from a specific stream
   */
  async getStreamMemories(streamId: string, limit: number = 10) {
    return await prisma.memory.findMany({
      where: { streamId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        viewer: true,
        topic: true,
      },
    });
  }

  /**
   * Get memories about a specific viewer
   */
  async getViewerMemories(viewerId: string, limit: number = 10) {
    return await prisma.memory.findMany({
      where: { viewerId },
      orderBy: { importance: 'desc' },
      take: limit,
    });
  }

  /**
   * Generate embedding using OpenAI API
   */
  private async generateEmbedding(text: string): Promise<number[]> {
    try {
      const response = await this.openai.embeddings.create({
        model: this.embeddingModel,
        input: text,
      });

      return response.data[0].embedding;
    } catch (error) {
      console.error('[MemoryService] Embedding generation failed:', error);
      throw new Error(`Failed to generate embedding: ${error}`);
    }
  }

  /**
   * Get collection statistics
   */
  async getStats() {
    if (!this.collection) {
      throw new Error('Collection not initialized');
    }

    const count = await this.collection.count();
    const prismaCount = await prisma.memory.count();

    return {
      chromaCount: count,
      prismaCount,
      isInSync: count === prismaCount,
    };
  }

  /**
   * Cleanup and disconnect
   */
  async disconnect(): Promise<void> {
    console.log('[MemoryService] Disconnecting...');
    await prisma.$disconnect();
    this.isInitialized = false;
    this.collection = null;
  }
}
