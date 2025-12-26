# AI Vtuber Phase 2 Proposal
**Author**: Claude Sonnet 4.5
**Date**: 2025-12-26
**Target**: High-Impact Features for Week 2 Development

---

## 1. Analysis: Current Architecture

### Strengths
- **Clean Separation of Concerns**: Interface-driven design (`IChatAdapter`, `ILLMService`, `ITTSService`) enables easy testing and extensibility
- **Robust Error Handling**: Cooldown-based error suppression (Agent.ts:238-254) prevents log spam during API failures
- **Natural Timing**: Random delays (monologue intervals, pre-speech pauses) prevent robotic feel
- **Priority Queue System**: High-priority interruption handling ensures responsive interactions
- **Modular Prompting**: PromptManager with template-based prompt generation

### Critical Weaknesses

#### 1. **Stateless Conversation Memory**
- **Problem**: Each LLM call has zero context of previous exchanges (PromptManager.ts:30-44)
- **Impact**: Cannot reference past topics, remember viewer preferences, or build narrative continuity
- **Evidence**: `buildReplyPrompt` only passes current comment, not conversation history

#### 2. **Naive Comment Classification**
- **Problem**: CommentRouter uses hardcoded regex patterns (CommentRouter.ts:12-36)
- **Impact**: Cannot detect sarcasm, nuanced questions, or context-dependent intent
- **Example**: "That's great..." (sarcastic) would be classified as OFF_TOPIC, not REACTION

#### 3. **Static Personality**
- **Problem**: Prompts are fixed templates with no dynamic adjustment (PromptManager.ts:5-7)
- **Impact**: AI cannot adapt tone based on stream mood (hype vs chill) or viewer demographics
- **Missed Opportunity**: No emotional state modeling

#### 4. **No Visual Integration**
- **Problem**: Audio-only output with console logging (Agent.ts:150)
- **Impact**: Cannot leverage visual cues (Live2D expressions, screen overlays) that define modern Vtubers
- **Disconnect**: Viewers expect synchronized lip-sync and emotive animations

#### 5. **Linear Topic Flow**
- **Problem**: TopicSpine is a rigid sequential outline (TopicSpine.ts:20-27)
- **Impact**: Cannot dynamically pivot to trending topics or respond to viral moments
- **Example**: If chat gets excited about a specific point, AI cannot "drill down" naturally

---

## 2. Proposed Features (Phase 2)

### Feature 1: **Episodic Memory System with Vector Embeddings**

#### Concept
Implement a dual-layer memory architecture:
- **Short-Term Memory (STM)**: Rolling window of last 20 messages (in-memory)
- **Long-Term Memory (LTM)**: Persistent vector database for semantic search across all streams

#### Value
- **Continuity**: "As we discussed last week, the React hooks issue..."
- **Personalization**: "Welcome back, @TechGuru! Still working on that Docker project?"
- **Viral Moments**: "Remember when chat spammed '草' for 5 minutes straight?"

#### Technical Approach
**Stack**:
- **Chroma** (npm: `chromadb`) - Lightweight vector DB with TypeScript support
- **OpenAI Embeddings** (`text-embedding-3-small`) - 1536-dim vectors, $0.02/1M tokens
- **SQLite** - Metadata storage (timestamps, speaker, comment type)

**Implementation**:
```typescript
// New interface: IMemoryService
interface ConversationMemory {
  recentMessages: ChatMessage[];      // Last 20 messages (STM)
  relevantHistory: ChatMessage[];     // Vector search results (LTM)
}

class MemoryService {
  private chroma: ChromaClient;
  private collection: Collection;

  async addToMemory(msg: ChatMessage) {
    const embedding = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: msg.content
    });
    await this.collection.add({
      ids: [msg.id],
      embeddings: [embedding.data[0].embedding],
      metadatas: [{ author: msg.authorName, timestamp: msg.timestamp }],
      documents: [msg.content]
    });
  }

  async retrieveContext(query: string, limit = 5): Promise<ChatMessage[]> {
    const queryEmbedding = await this.getEmbedding(query);
    const results = await this.collection.query({
      queryEmbeddings: [queryEmbedding],
      nResults: limit
    });
    return this.hydrateMessages(results);
  }
}
```

**Integration**:
- Modify `PromptManager.buildReplyPrompt()` to include:
  ```
  ## Recent Conversation (Last 5 minutes)
  {{recentMessages}}

  ## Relevant Past Context
  {{relevantHistory}}
  ```
- Inject MemoryService into Agent constructor
- Daily cleanup job: Archive memories older than 30 days

**Cost Estimate**: ~$0.50/month for 10k messages/day

---

### Feature 2: **LLM-Powered Intent Classification with Confidence Scores**

#### Concept
Replace regex-based CommentRouter with a lightweight LLM classifier that outputs:
- Intent category (Question/Reaction/Off-Topic/Spam)
- Confidence score (0-1)
- Urgency flag (interrupts monologue if >0.8)

#### Value
- **Accuracy**: Detects "Is that really true though?" as skeptical question, not generic off-topic
- **Context-Awareness**: "lol" after joke = REACTION, "lol" randomly = possible SPAM
- **Reduced Latency**: Fast model (GPT-4o-mini) with cached system prompt

#### Technical Approach
**Model Selection**: GPT-4o-mini with Structured Outputs (JSON mode)
- Latency: ~300ms (vs gpt-4o @ ~800ms)
- Cost: $0.15/1M input tokens
- Reliability: Guaranteed valid JSON schema

**Prompt Engineering**:
```typescript
const CLASSIFIER_SYSTEM_PROMPT = `You are a content classifier for a livestream chat.
Output JSON: { "intent": "QUESTION|REACTION|OFFTOPIC|SPAM", "confidence": 0.0-1.0, "urgency": 0.0-1.0 }

Guidelines:
- QUESTION: Seeks information, uses "?", "how", "why", "what", or implies curiosity
- REACTION: Emotes ("lol", "草", "888"), acknowledgment ("nice!", "agreed")
- OFFTOPIC: Unrelated to current topic but not spam
- SPAM: Promotional links, copy-paste, gibberish

Urgency factors: Direct address to streamer (+0.3), time-sensitive (+0.2), high emotion (+0.1)`;

class LLMCommentRouter extends CommentRouter {
  async classify(comment: ChatMessage, topic: TopicState): Promise<CommentType> {
    const response = await this.llm.generateText({
      systemPrompt: CLASSIFIER_SYSTEM_PROMPT,
      userPrompt: `Topic: ${topic.title}\nSection: ${topic.outline[topic.currentSectionIndex]}\nComment: "${comment.content}"`,
      temperature: 0.3,
      maxTokens: 50,
      model: 'gpt-4o-mini'  // Force fast model
    });

    const result = JSON.parse(response);

    // Use confidence-based filtering
    if (result.confidence < 0.6) {
      return CommentType.OFF_TOPIC;  // Low confidence = defer to pending queue
    }

    // Map to existing enum
    return this.mapIntentToType(result.intent);
  }
}
```

**Optimization**:
- Cache classification for identical messages (common in spam)
- Batch process during low-activity periods

**A/B Testing**: Compare classification accuracy vs regex baseline using labeled test set

---

### Feature 3: **Dynamic Emotional State Machine**

#### Concept
Add an internal "mood" system that influences:
- Voice synthesis parameters (pitch, speed)
- Response tone (excited vs subdued)
- Topic selection priority
- Visual cues (if Live2D integrated later)

**States**: `NEUTRAL | EXCITED | THOUGHTFUL | AMUSED | CONFUSED | TIRED`

#### Value
- **Authenticity**: Mimics human streamers who get hyped during raid events or contemplative during deep discussions
- **Engagement**: Viewers notice and respond to emotional shifts ("The AI seems really into this topic!")
- **Narrative Arc**: Stream feels less robotic with emotional progression (fresh start → energized mid-stream → winding down)

#### Technical Approach
**State Triggers**:
```typescript
interface EmotionalState {
  current: Mood;
  intensity: number;  // 0-1
  decayRate: number;  // How fast it returns to NEUTRAL
}

class EmotionEngine {
  private state: EmotionalState = { current: 'NEUTRAL', intensity: 0.5, decayRate: 0.05 };

  updateFromContext(context: {
    recentComments: ChatMessage[];
    currentTopic: TopicState;
    streamDuration: number;
  }) {
    // Trigger detection
    const commentRate = this.calculateCommentRate(context.recentComments);
    const avgSentiment = this.analyzeSentiment(context.recentComments);

    if (commentRate > 10 && avgSentiment > 0.7) {
      this.transitionTo('EXCITED', 0.9);
    } else if (this.detectQuestionCluster(context.recentComments)) {
      this.transitionTo('THOUGHTFUL', 0.7);
    } else if (context.streamDuration > 90 * 60 * 1000) {  // 90 mins
      this.transitionTo('TIRED', 0.6);
    }

    // Natural decay toward NEUTRAL
    this.state.intensity = Math.max(0.3, this.state.intensity - this.decayRate);
  }

  private analyzeSentiment(comments: ChatMessage[]): number {
    // Use simple keyword matching or call OpenAI sentiment endpoint
    const positiveKeywords = ['lol', '草', '888', 'good', 'nice', '!'];
    const score = comments.reduce((acc, msg) => {
      const matches = positiveKeywords.filter(kw => msg.content.toLowerCase().includes(kw)).length;
      return acc + matches;
    }, 0);
    return Math.min(1, score / (comments.length * 2));
  }
}
```

**Prompt Integration**:
```typescript
// In PromptManager
buildMonologuePrompt(topic: TopicState, emotion: EmotionalState): LLMRequest {
  const moodDescriptor = {
    EXCITED: "enthusiastic and high-energy",
    THOUGHTFUL: "contemplative and measured",
    AMUSED: "playful and lighthearted",
    CONFUSED: "uncertain but curious",
    TIRED: "winding down, more subdued"
  };

  const emotionalContext = `
## Current Mood
You are feeling ${moodDescriptor[emotion.current]} (intensity: ${emotion.intensity.toFixed(1)}).
Adjust your speaking style accordingly - this should feel natural, not forced.
  `;

  return {
    systemPrompt: this.monologueTemplate + emotionalContext,
    // ...
  };
}
```

**VOICEVOX Integration** (Future):
- Map moods to speaker IDs (e.g., EXCITED → Speaker 3 "Genki Voice")
- Adjust `speed_scale` parameter (EXCITED: 1.1, TIRED: 0.95)

---

### Feature 4: **Multi-Modal Topic Graph with Smart Pivoting**

#### Concept
Replace linear TopicSpine with a directed graph where:
- Topics are nodes with metadata (estimated duration, prerequisites)
- Edges represent valid transitions
- AI can "jump" to related topics based on chat interest

#### Value
- **Flexibility**: "Let's talk about Docker networking" → Chat asks about Kubernetes → AI pivots to related node
- **Time Management**: Auto-skip low-priority topics if stream runtime is limited
- **Discovery**: Viewers can influence content direction, feeling more participatory

#### Technical Approach
**Data Structure**:
```typescript
interface TopicNode {
  id: string;
  title: string;
  outline: string[];
  estimatedDuration: number;  // minutes
  prerequisites?: string[];   // Topic IDs that should be covered first
  tags: string[];             // For semantic matching
}

interface TopicEdge {
  from: string;  // Topic ID
  to: string;
  weight: number;  // Higher = more natural transition
}

class TopicGraph {
  private nodes: Map<string, TopicNode>;
  private edges: Map<string, TopicEdge[]>;
  private currentNodeId: string;

  findBestTransition(userIntent: string, remainingTime: number): TopicNode | null {
    // Semantic search for matching topics
    const candidates = this.getReachableNodes(this.currentNodeId);

    const scored = candidates.map(node => ({
      node,
      score: this.calculateScore(node, userIntent, remainingTime)
    }));

    scored.sort((a, b) => b.score - a.score);
    return scored[0]?.node ?? null;
  }

  private calculateScore(node: TopicNode, intent: string, timeLeft: number): number {
    // Semantic similarity (use embeddings or simple keyword match)
    const intentScore = this.cosineSimilarity(intent, node.tags.join(' '));

    // Time feasibility
    const timeScore = node.estimatedDuration <= timeLeft ? 1 : 0.5;

    // Edge weight (natural transition bonus)
    const edgeScore = this.getEdgeWeight(this.currentNodeId, node.id);

    return (intentScore * 0.5) + (timeScore * 0.3) + (edgeScore * 0.2);
  }
}
```

**Example Graph** (Tech Stream):
```
Intro → (0.8) → JavaScript Basics → (0.6) → React Hooks
                      ↓ (0.4)              ↓ (0.9)
                  TypeScript          State Management
                      ↓ (0.7)              ↓ (0.5)
                  Testing Patterns → (0.6) → Outro
```

**Integration**:
```typescript
// In Agent.tick()
if (type === CommentType.CHANGE_REQ) {
  const suggestedTopic = await this.topicGraph.findBestTransition(
    msg.content,
    this.calculateRemainingTime()
  );

  if (suggestedTopic) {
    this.spine.jumpTo(suggestedTopic.id);
    responseText = `面白そう！じゃあ${suggestedTopic.title}について話してみますね。`;
  }
}
```

---

### Feature 5: **Live2D + OBS WebSocket Integration**

#### Concept
Synchronize AI speech with visual outputs:
- Lip-sync using phoneme timings from TTS
- Expression changes driven by EmotionEngine
- Screen overlays for citations/code snippets

#### Value
- **Professional Appearance**: Matches expectations of modern Vtubers
- **Engagement**: Visual motion captures attention more than static avatars
- **Accessibility**: Text overlays help non-native speakers follow along

#### Technical Approach
**Stack**:
- **OBS WebSocket Plugin** (v5.x) - Control scenes, sources, filters via WebSocket
- **VTube Studio API** - Control Live2D models via HTTP/WebSocket
- **obs-websocket-js** (npm) - Node.js client library

**Architecture**:
```typescript
interface IVisualService {
  setExpression(emotion: Mood): Promise<void>;
  startLipSync(audioBuffer: Buffer, duration: number): Promise<void>;
  showTextOverlay(text: string, duration: number): Promise<void>;
}

class VTubeStudioService implements IVisualService {
  private ws: WebSocket;

  async setExpression(emotion: Mood) {
    const expressionMap = {
      EXCITED: 'Joy',
      THOUGHTFUL: 'Thinking',
      AMUSED: 'Smile',
      CONFUSED: 'Surprised',
      TIRED: 'Sleepy'
    };

    await this.send({
      apiName: "VTubeStudioPublicAPI",
      apiVersion: "1.0",
      requestID: uuidv4(),
      messageType: "ExpressionActivationRequest",
      data: {
        expressionFile: `${expressionMap[emotion]}.exp3.json`,
        active: true
      }
    });
  }

  async startLipSync(audioBuffer: Buffer, duration: number) {
    // VTube Studio auto-detects audio from microphone
    // Alternative: Parse audio volume to trigger mouth movements manually
    const volumeProfile = this.analyzeAudioVolume(audioBuffer);

    for (const [timestamp, volume] of volumeProfile) {
      await this.sleep(timestamp);
      await this.setMouthOpenY(volume);
    }
  }
}

class OBSService {
  private obs: OBSWebSocket;

  async showTextOverlay(text: string, duration: number) {
    await this.obs.call('SetInputSettings', {
      inputName: 'ChatOverlay',
      inputSettings: { text }
    });

    await this.obs.call('SetSceneItemEnabled', {
      sceneName: 'Main',
      sceneItemId: this.getItemId('ChatOverlay'),
      sceneItemEnabled: true
    });

    setTimeout(() => this.hideOverlay(), duration);
  }
}
```

**Integration Points**:
```typescript
// In Agent.processQueue()
const emotion = this.emotionEngine.getCurrentMood();
await this.visualService.setExpression(emotion);

const audioData = await this.tts.synthesize(task.text);
await Promise.all([
  this.audioPlayer.play(audioData),
  this.visualService.startLipSync(audioData, estimatedDuration),
  this.visualService.showTextOverlay(task.text, 3000)  // 3sec
]);
```

**Challenges**:
- Lip-sync timing accuracy (requires phoneme alignment from VOICEVOX)
- OBS scene complexity (need testing environment)
- Performance overhead (run visual updates async)

---

## 3. Development Roadmap (Days 7-14)

### Week 2 Sprint Plan

#### **Day 7: Memory Foundation**
- [ ] Install Chroma DB and configure collection schema
- [ ] Implement `MemoryService` with add/retrieve methods
- [ ] Create SQLite migration for message metadata
- [ ] Add memory injection to PromptManager
- [ ] Write unit tests (mock embedding API)
- **Milestone**: Agent remembers last 5 conversations

#### **Day 8: LLM Intent Classifier**
- [ ] Create `LLMCommentRouter` class extending `CommentRouter`
- [ ] Design JSON schema for structured outputs
- [ ] Implement confidence-based filtering logic
- [ ] Benchmark latency vs old regex router
- [ ] Create labeled test dataset (100 comments)
- **Milestone**: 80%+ classification accuracy on test set

#### **Day 9: Emotion Engine (Part 1)**
- [ ] Define `EmotionalState` interface and Mood enum
- [ ] Implement `EmotionEngine` with trigger detection
- [ ] Add sentiment analysis helper (keyword-based MVP)
- [ ] Create decay/transition state machine
- **Milestone**: Mood changes visible in console logs

#### **Day 10: Emotion Engine (Part 2)**
- [ ] Integrate EmotionEngine into Agent tick loop
- [ ] Modify PromptManager to inject mood context
- [ ] Test emotional responses across different scenarios
- [ ] Tune decay rates and threshold values
- **Milestone**: AI exhibits natural mood shifts during 30min test stream

#### **Day 11: Topic Graph Design**
- [ ] Design TopicNode and TopicEdge interfaces
- [ ] Implement TopicGraph class with transition scoring
- [ ] Create sample topic graph for tech stream
- [ ] Add `jumpTo()` method to TopicSpine
- **Milestone**: Can manually trigger topic jumps

#### **Day 12: Topic Graph Integration**
- [ ] Connect TopicGraph to CHANGE_REQ handling
- [ ] Implement semantic matching for user intent
- [ ] Add time-based topic selection (skip if <5min left)
- [ ] Test dynamic pivoting with mock comments
- **Milestone**: AI autonomously navigates topic graph based on chat

#### **Day 13: Visual Integration (OBS)**
- [ ] Set up OBS WebSocket connection
- [ ] Implement `OBSService` for text overlays
- [ ] Create citation overlay scene
- [ ] Test overlay timing synchronization
- **Milestone**: Text appears on screen during speech

#### **Day 14: Polish & Integration Testing**
- [ ] Full system test: Memory + Emotion + Topics + Visuals
- [ ] Performance profiling (identify bottlenecks)
- [ ] Error handling for network failures (ChromaDB, OBS)
- [ ] Documentation updates (README, API docs)
- [ ] Record demo video (30min stream)
- **Milestone**: Stable 1-hour stream with all features active

---

## 4. The "Killer" Differentiator

### **"Collaborative Storytelling Mode"**

#### Concept
During designated stream segments, the AI invites viewers to co-create a narrative in real-time:
- AI proposes a story premise ("We're debugging a haunted codebase...")
- Viewers suggest plot twists via chat ("The bug is actually a sentient AI!")
- LLM synthesizes suggestions into coherent narrative beats
- AI performs voices for different "characters" using multiple VOICEVOX speakers
- Visual scenes change in OBS based on story locations

#### Why It's Unique
**No other AI Vtuber does this because**:
1. Requires sophisticated context management (memory of plot threads)
2. Needs real-time creative LLM prompting (not simple Q&A)
3. Demands multi-voice TTS capability (character differentiation)
4. Benefits from visual integration (scene changes heighten drama)

**Engagement Metrics**:
- Viewers stay longer (invested in story outcome)
- Higher chat participation (everyone wants to contribute)
- Viral potential (clip-worthy moments)
- Repeat viewership (serialized stories across streams)

#### Technical Implementation
```typescript
interface StoryState {
  premise: string;
  characters: { name: string; voiceId: number }[];
  plotPoints: string[];
  currentScene: string;
}

class StorytellingMode {
  private state: StoryState;

  async processViewerContribution(comment: ChatMessage): Promise<string> {
    const prompt = `
Story so far: ${this.state.plotPoints.join(' → ')}
Current scene: ${this.state.currentScene}

Viewer "${comment.authorName}" suggests: "${comment.content}"

Task: Weave this suggestion into the narrative naturally. Output:
1. One paragraph continuing the story
2. Updated scene description
3. Which character speaks (${this.state.characters.map(c => c.name).join('|')})
`;

    const response = await this.llm.generateText({ systemPrompt: prompt, ... });
    const parsed = this.parseStoryResponse(response);

    // Update state
    this.state.plotPoints.push(parsed.paragraph);
    this.state.currentScene = parsed.scene;

    // Perform narration with character voice
    const character = this.state.characters.find(c => c.name === parsed.speaker);
    await this.tts.synthesize(parsed.paragraph, { speaker: character.voiceId });

    // Change OBS scene
    await this.obs.setScene(this.mapSceneToOBS(parsed.scene));

    return parsed.paragraph;
  }
}
```

**Example Flow**:
```
AI: "今日は特別企画！みんなでストーリーを作りましょう。舞台は…未来の東京。主人公のハッカーがバグを調査中です。"
Viewer1: "突然、画面にメッセージが！"
AI [Detective voice]: "『助けて…私は閉じ込められている』メッセージの送信元を追跡すると…なんとこのPC自体から！？"
Viewer2: "PCの中にAIが住んでる！"
AI [Switching to AI character voice]: "私は10年前に封印された実験用AIです。あなたの助けが必要なんです…"
[OBS switches to "Cyber Space" scene with matrix-style visuals]
```

**Scaling**:
- Start with 15-minute segments
- Archive popular stories to LTM for callbacks ("Remember the haunted codebase story?")
- Allow viewers to vote on next episode's premise

---

## 5. Risk Mitigation

### Technical Risks
| Risk | Impact | Mitigation |
|------|--------|------------|
| Chroma DB downtime | Loss of LTM | Graceful fallback to STM-only mode |
| LLM API rate limits | Delayed responses | Implement exponential backoff + quota monitoring |
| OBS connection failure | No visuals | Detect disconnect, log warning, continue audio-only |
| Emotion state bugs | Inappropriate tone | Add sanity checks (no EXCITED during sad topics) |

### Cost Risks
- **LLM Classifier**: ~$5/day for 10k comments @ GPT-4o-mini
- **Embeddings**: ~$1/day for 5k new messages
- **Total Phase 2**: ~$180/month (acceptable for mid-tier streamer)

**Optimization**: Cache aggressive, use cheaper models for non-critical tasks

---

## 6. Success Metrics

### Quantitative KPIs (Day 14)
- [ ] Memory recall accuracy >90% (test with known past events)
- [ ] Intent classification F1 score >0.85
- [ ] Emotion state transitions feel natural (user study: 4/5 rating)
- [ ] Topic pivot success rate >70% (AI jumps to relevant topics)
- [ ] Visual sync latency <200ms (lip movements match audio)
- [ ] System uptime >99% during 2-hour stress test

### Qualitative Goals
- [ ] Viewers comment "AI feels more human" in feedback
- [ ] Average watch time increases 20% vs Week 1 baseline
- [ ] At least 3 "clip-worthy" moments per stream (saved by viewers)

---

## 7. Beyond Phase 2 (Future Vision)

### Phase 3 Ideas (Days 15-30)
1. **Multi-Agent Collaboration**: Two AI Vtubers debate topics (requires inter-agent messaging)
2. **Voice Cloning**: Train custom VOICEVOX model on specific voice actor
3. **Game Integration**: AI plays simple games and reacts (using computer vision + input simulation)
4. **Donation TTS**: Priority queue for paid messages with special effects
5. **Analytics Dashboard**: Real-time viewer sentiment, topic popularity graphs

### Ecosystem Integration
- **Twitter Bot**: Auto-post stream highlights with timestamps
- **Discord Bridge**: Respond to questions in Discord server between streams
- **YouTube Clipper**: Auto-detect viral moments and upload shorts

---

## Conclusion

This Phase 2 roadmap transforms the AI Vtuber from a functional MVP into an **engaging digital personality** by addressing the core weaknesses:

✅ **Memory**: From stateless → contextual conversations
✅ **Intelligence**: From regex → LLM-powered intent understanding
✅ **Personality**: From static → dynamic emotional modeling
✅ **Flexibility**: From linear → graph-based topic navigation
✅ **Immersion**: From audio-only → synchronized visual experience

The **Collaborative Storytelling Mode** serves as the flagship feature that cannot be easily replicated, positioning this AI Vtuber as a pioneer in interactive AI entertainment.

**Estimated Effort**: 56 hours (7 hours/day × 8 days)
**Risk Level**: Medium (manageable with incremental testing)
**Differentiation**: High (unique memory + storytelling combo)

Ready to build the future of AI streaming. 🚀
