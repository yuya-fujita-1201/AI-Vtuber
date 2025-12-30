/**
 * Sprint 1 Integration Test
 *
 * Verifies:
 * - DB connection
 * - Comment throttling under load
 * - LLM-based classification
 * - Three-tier memory (short-term, topic history, long-term)
 * - Dynamic character trait injection
 */

import { CommentType } from '../src/interfaces';
import type { ChatMessage, IChatAdapter, ILLMService, LLMRequest } from '../src/interfaces';

const assert = (condition: boolean, message: string) => {
  if (!condition) {
    throw new Error(message);
  }
};

class MockChatAdapter implements IChatAdapter {
  private messages: ChatMessage[];
  private index = 0;

  constructor(messages: ChatMessage[]) {
    this.messages = messages;
  }

  async connect(): Promise<void> {
    console.log('[MockAdapter] Connected');
  }

  async fetchNewMessages(): Promise<ChatMessage[]> {
    if (this.index >= this.messages.length) {
      return [];
    }
    // Burst all remaining messages at once to stress throttling
    const remaining = this.messages.slice(this.index);
    this.index = this.messages.length;
    return remaining;
  }

  async disconnect(): Promise<void> {
    console.log('[MockAdapter] Disconnected');
  }
}

class MockLLMService implements ILLMService {
  async generateText(req: LLMRequest): Promise<string> {
    if (req.systemPrompt.includes('配信コメントの分類器')) {
      const content = req.userPrompt;
      if (content.includes('次') || content.toLowerCase().includes('change')) return 'TOPIC_CHANGE_REQUEST';
      if (content.includes('草') || content.includes('w')) return 'REACTION';
      if (content.includes('猫') || content.includes('TypeScript') || content.includes('React')) return 'ON_TOPIC';
      if (content.includes('?') || content.includes('？')) return 'ON_TOPIC';
      return 'OFF_TOPIC';
    }

    if (req.systemPrompt.includes('話題を抽出する分類器')) {
      const content = req.userPrompt;
      if (content.includes('TypeScript')) return 'TypeScript';
      if (content.includes('猫')) return '猫';
      if (content.includes('React')) return 'React';
      return '雑談';
    }

    // Default response for replies
    return 'テスト応答です！';
  }
}

const run = async () => {
  process.env.DRY_RUN = process.env.DRY_RUN ?? 'true';
  process.env.AGENT_TICK_INTERVAL_MS = process.env.AGENT_TICK_INTERVAL_MS ?? '200';
  process.env.AGENT_MAX_COMMENTS_PER_TICK = process.env.AGENT_MAX_COMMENTS_PER_TICK ?? '3';
  process.env.AGENT_PRESPEECH_DELAY_MIN_MS = process.env.AGENT_PRESPEECH_DELAY_MIN_MS ?? '0';
  process.env.AGENT_PRESPEECH_DELAY_MAX_MS = process.env.AGENT_PRESPEECH_DELAY_MAX_MS ?? '0';
  process.env.AGENT_SPEECH_PER_CHAR_MS = process.env.AGENT_SPEECH_PER_CHAR_MS ?? '10';
  process.env.AGENT_SPEECH_FALLBACK_MIN_MS = process.env.AGENT_SPEECH_FALLBACK_MIN_MS ?? '50';
  process.env.AGENT_CLASSIFIER_USE_LLM = process.env.AGENT_CLASSIFIER_USE_LLM ?? 'true';
  process.env.AGENT_TOPIC_HISTORY_ENABLED = process.env.AGENT_TOPIC_HISTORY_ENABLED ?? 'true';

  const { Agent } = await import('../src/core/Agent');
  const { MemoryService } = await import('../src/services/MemoryService');
  const { CharacterService } = await import('../src/services/CharacterService');
  const { TopicService } = await import('../src/services/TopicService');
  const { LLMClassifierService } = await import('../src/services/LLMClassifierService');
  const { PromptManager } = await import('../src/core/PromptManager');
  const { MockTTSService } = await import('../src/services/MockTTSService');
  const { prisma } = await import('../src/lib/prisma');
  const { config } = await import('../src/config/AppConfig');

  console.log('========================================');
  console.log('Sprint 1 Integration Test');
  console.log('========================================\n');

  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required for this test');
  }
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is required for this test');
  }
  if (!process.env.CHROMA_URL) {
    throw new Error('CHROMA_URL is required for this test');
  }

  console.log(`DATABASE_URL: ${process.env.DATABASE_URL}`);
  if (!process.env.DATABASE_URL.includes('postgres')) {
    console.warn('⚠️ DATABASE_URL does not appear to be PostgreSQL. Proceeding anyway.');
  }

  await prisma.$connect();
  console.log('✅ Database connection established\n');

  const characterService = new CharacterService();
  const topicService = new TopicService();
  const promptManager = new PromptManager();

  console.log('Test 1: Character trait injection');
  const traitIds: string[] = [];
  const traitPayloads = [
    { category: 'base_personality', value: 'ちょっと照れ屋で人懐っこい' },
    { category: 'speech_style', value: '語尾に「〜かも」をよく使う' },
    { category: 'favorite_topic', value: 'ゲーム実況' }
  ];

  for (const trait of traitPayloads) {
    const created = await prisma.characterTrait.create({
      data: {
        category: trait.category,
        value: trait.value,
        isActive: true,
        priority: 10
      }
    });
    traitIds.push(created.id);
  }

  const profile = await characterService.getCharacterProfile(true);
  const prompt = promptManager.buildReplyPrompt(
    { id: 'c1', authorName: 'Tester', content: '今日は何する？', timestamp: Date.now() },
    { currentTopicId: 'topic-1', title: '雑談', outline: ['導入'], currentSectionIndex: 0, lockUntil: 0 },
    [],
    undefined,
    profile,
    null
  );

  assert(prompt.systemPrompt.includes('ちょっと照れ屋で人懐っこい'), 'Character trait should appear in system prompt');
  console.log('✅ Character traits injected into prompt\n');

  console.log('Test 2: Topic history normalization');
  await topicService.updateTopicMention('ReactJS');
  const fetchedTopic = await topicService.getTopicHistory('React');
  assert(fetchedTopic?.normalizedName === 'react', 'Topic normalization should collapse ReactJS to react');
  assert(fetchedTopic?.totalMentions === 1, 'Topic mention count should be 1');
  console.log('✅ Topic history normalization working\n');

  console.log('Test 3: Memory service initialization');
  const memoryService = new MemoryService(process.env.CHROMA_URL);
  await memoryService.initialize();
  console.log('✅ MemoryService initialized\n');

  console.log('Test 4: Comment throttling + LLM classification');
  const mockLLM = new MockLLMService();
  const llmClassifier = new LLMClassifierService(mockLLM);
  const sampleType = await llmClassifier.classifyCommentType(
    { id: 'sample', authorName: 'Tester', content: 'TypeScriptの話して', timestamp: Date.now() },
    { currentTopicId: 'topic-1', title: '雑談', outline: ['導入'], currentSectionIndex: 0, lockUntil: 0 }
  );
  assert(sampleType === CommentType.ON_TOPIC, 'LLM classifier should label on-topic comment');
  const sampleTopic = await llmClassifier.identifyTopic(
    { id: 'sample2', authorName: 'Tester', content: 'Reactってどう？', timestamp: Date.now() },
    { currentTopicId: 'topic-1', title: '雑談', outline: ['導入'], currentSectionIndex: 0, lockUntil: 0 }
  );
  assert(sampleTopic === 'React', 'LLM classifier should extract topic name');

  const messages: ChatMessage[] = [
    { id: 'm1', authorName: 'Alice', content: '猫が好き！', timestamp: Date.now() },
    { id: 'm2', authorName: 'Bob', content: 'TypeScriptの型推論って？', timestamp: Date.now() + 10 },
    { id: 'm3', authorName: 'Cara', content: '草', timestamp: Date.now() + 20 },
    { id: 'm4', authorName: 'Dan', content: '次はゲームの話して', timestamp: Date.now() + 30 },
    { id: 'm5', authorName: 'Eve', content: 'Reactってどう？', timestamp: Date.now() + 40 },
    { id: 'm6', authorName: 'Finn', content: '雑談しよう', timestamp: Date.now() + 50 },
    { id: 'm7', authorName: 'Gina', content: '猫かわいい', timestamp: Date.now() + 60 },
    { id: 'm8', authorName: 'Hiro', content: 'TypeScript最高！', timestamp: Date.now() + 70 },
    { id: 'm9', authorName: 'Ivy', content: 'www', timestamp: Date.now() + 80 }
  ];

  const adapter = new MockChatAdapter(messages);
  await adapter.connect();

  const agent = new Agent(adapter, {
    llmService: mockLLM,
    promptManager,
    ttsService: new MockTTSService(),
    memoryService,
    characterService,
    topicService,
    llmClassifierService: llmClassifier
  });

  const agentRun = agent.start();

  await new Promise(resolve => setTimeout(resolve, 400));
  const earlyCount = await prisma.message.count();
  assert(earlyCount < messages.length, 'Throttling should prevent processing all messages immediately');
  console.log(`✅ Throttling active (processed ${earlyCount}/${messages.length} messages early)\n`);

  await new Promise(resolve => setTimeout(resolve, 2500));
  await agent.stop();
  await agentRun.catch(() => undefined);

  const finalCount = await prisma.message.count();
  assert(finalCount === messages.length, 'All messages should eventually be processed');
  console.log('✅ All messages processed after throttling\n');

  console.log('Test 5: Long-term memory + access tracking');
  const memories = await prisma.memory.findMany();
  assert(memories.length > 0, 'Memories should be created from on-topic comments');
  const searchResults = await memoryService.searchMemory('猫', 3);
  assert(searchResults.length > 0, 'Memory search should return results');
  console.log('✅ Memory system operational\n');

  console.log('Test 6: Topic history updates');
  const topicHistory = await topicService.getTopicHistory('猫');
  assert(topicHistory && topicHistory.totalMentions >= 1, 'Topic history should record mentions');
  console.log('✅ Topic history recorded\n');

  console.log('Test 7: Short-term memory window');
  const recentComments = (agent as any).recentComments as ChatMessage[];
  assert(recentComments.length <= config.agent.recentCommentLimit, 'Recent comments should be capped');
  console.log('✅ Short-term memory window enforced\n');

  console.log('Test 8: Character trait update');
  await prisma.characterTrait.update({
    where: { id: traitIds[0] },
    data: { value: 'とても内向的で慎重' }
  });
  const updatedProfile = await characterService.getCharacterProfile(true);
  const updatedPrompt = promptManager.buildReplyPrompt(
    { id: 'c2', authorName: 'Tester', content: '性格変わった？', timestamp: Date.now() },
    { currentTopicId: 'topic-1', title: '雑談', outline: ['導入'], currentSectionIndex: 0, lockUntil: 0 },
    [],
    undefined,
    updatedProfile,
    null
  );
  assert(updatedPrompt.systemPrompt.includes('とても内向的で慎重'), 'Updated trait should reflect in prompt');
  console.log('✅ Character trait change reflected after refresh\n');

  // Cleanup
  await prisma.characterTrait.deleteMany({ where: { id: { in: traitIds } } });
  await prisma.topicHistory.deleteMany({
    where: { normalizedName: { in: ['react', '猫', 'typescript', '雑談'] } }
  });
  await prisma.memory.deleteMany({});
  await prisma.message.deleteMany({});
  await prisma.viewer.deleteMany({});
  await prisma.stream.deleteMany({});

  await memoryService.disconnect();
  await prisma.$disconnect();

  console.log('========================================');
  console.log('✅ Sprint 1 Integration Test Passed!');
  console.log('========================================');
};

run().catch(error => {
  console.error('❌ Sprint 1 Integration Test Failed:', error);
  process.exit(1);
});
