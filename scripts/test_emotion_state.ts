/**
 * Emotion State Test Script
 *
 * Usage:
 *   ts-node scripts/test_emotion_state.ts --state HAPPY --vibe EXCITED --message "今日どう？" [--run-llm]
 */

import { EmotionEngine, EmotionState } from '../src/core/EmotionEngine';
import { PromptManager } from '../src/core/PromptManager';
import { OpenAIService } from '../src/services/OpenAIService';
import type { ConversationVibe, NarrativeContext, TopicState } from '../src/interfaces';

const readFlag = (name: string) => {
  const index = process.argv.indexOf(name);
  if (index === -1) return undefined;
  return process.argv[index + 1];
};

const stateArg = readFlag('--state') ?? 'HAPPY';
const vibeArg = readFlag('--vibe') ?? 'CALM';
const message = readFlag('--message') ?? '今日はどんな気分？';
const runLlm = process.argv.includes('--run-llm');

const isEmotionState = (value: string): value is EmotionState => {
  return Object.values(EmotionState).includes(value as EmotionState);
};

const emotionState = isEmotionState(stateArg) ? stateArg : EmotionState.HAPPY;
const conversationVibe = (['CALM', 'EXCITED', 'HEATED', 'COZY'] as ConversationVibe[]).includes(vibeArg as ConversationVibe)
  ? (vibeArg as ConversationVibe)
  : 'CALM';

const run = async () => {
  const engine = new EmotionEngine();
  engine.lockState(emotionState, 60_000);

  const promptManager = new PromptManager();

  const topicState: TopicState = {
    currentTopicId: 'test-topic',
    title: '感情テスト',
    outline: ['導入'],
    currentSectionIndex: 0,
    lockUntil: 0
  };

  const narrative: NarrativeContext = {
    theme: '感情テスト',
    arcPhase: 'Casual Opening',
    vibe: conversationVibe,
    topicDepth: 0
  };

  const prompt = await promptManager.buildReplyPrompt(
    { id: 'emotion-test', authorName: 'Tester', content: message, timestamp: Date.now() },
    topicState,
    [],
    narrative,
    undefined,
    null,
    { emotionState: engine.getCurrentState(), conversationVibe }
  );

  console.log('--- System Prompt ---');
  console.log(prompt.systemPrompt);
  console.log('--- User Prompt ---');
  console.log(prompt.userPrompt);

  if (runLlm) {
    const llm = new OpenAIService();
    const response = await llm.generateText(prompt);
    console.log('--- LLM Response ---');
    console.log(response);
  }
};

run().catch(error => {
  console.error('Emotion state test failed:', error);
  process.exit(1);
});
