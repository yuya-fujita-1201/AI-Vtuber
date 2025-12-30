import { PromptManager } from '../src/core/PromptManager';
import { EmotionState } from '../src/core/EmotionEngine';
import { ConversationVibe, TopicState, NarrativeContext } from '../src/interfaces';

async function verifyDay22() {
    console.log('--- Verifying Day 22: Dynamic Prompt Engineering ---');
    const promptManager = new PromptManager();

    // Mock inputs
    const mockTopic: TopicState = {
        title: 'Test Topic',
        currentTopicId: 't1',
        currentSectionIndex: 0,
        outline: ['Section 1', 'Section 2'],
        lockUntil: 0
    };

    const mockNarrative: NarrativeContext = {
        theme: 'Technology',
        arcPhase: 'Casual Opening', // Valid enum value
        vibe: 'EXCITED',
        topicDepth: 1
    };

    // Test Case 1: HAPPY + EXCITED
    console.log('\n[Test 1] Generating prompt for HAPPY emotion + EXCITED vibe...');
    const result1 = await promptManager.buildMonologuePrompt(
        mockTopic,
        mockNarrative,
        undefined,
        undefined,
        EmotionState.HAPPY,
        'EXCITED' as ConversationVibe
    );

    const systemPrompt1 = result1.systemPrompt;
    const hasHappy = systemPrompt1.includes('とても嬉しい気分');
    const hasExcited = systemPrompt1.includes('チャットが盛り上がっている');

    if (hasHappy && hasExcited) {
        console.log('✅ Success: System prompt contains expected dynamic instructions.');
    } else {
        console.error('❌ Failed: Missing dynamic instructions.');
        console.log('System Prompt Snippet:', systemPrompt1.slice(-500));
    }

    // Test Case 2: SAD + COZY
    console.log('\n[Test 2] Generating prompt for SAD emotion + COZY vibe...');
    const result2 = await promptManager.buildMonologuePrompt(
        mockTopic,
        mockNarrative,
        undefined,
        undefined,
        EmotionState.SAD,
        'COZY' as ConversationVibe
    );

    const systemPrompt2 = result2.systemPrompt;
    const hasSad = systemPrompt2.includes('少し沈んだ気分');
    const hasCozy = systemPrompt2.includes('場の空気はまったり');

    if (hasSad && hasCozy) {
        console.log('✅ Success: System prompt contains expected dynamic instructions.');
    } else {
        console.error('❌ Failed: Missing dynamic instructions.');
        console.log('System Prompt Snippet:', systemPrompt2.slice(-500));
    }
}

verifyDay22().catch(console.error);
