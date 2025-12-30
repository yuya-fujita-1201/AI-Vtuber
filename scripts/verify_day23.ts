import { ViewerProfileService } from '../src/services/ViewerProfileService';
import { PromptManager } from '../src/core/PromptManager';
import { ILLMService, LLMRequest } from '../src/interfaces';
import { prisma } from '../src/lib/prisma';
import { TopicState } from '../src/interfaces';

// Mock LLM Service to avoid API calls and ensure deterministic output
class MockLLMService implements ILLMService {
    async generateText(request: LLMRequest): Promise<string> {
        // Return a mocked JSON response mimicking profile extraction
        return JSON.stringify({
            estimatedPersonality: ['cheerful', 'dog-lover'],
            communicationStyle: ['casual', 'emojis'],
            favoriteTopics: ['pets', 'tech'],
            dislikedTopics: [],
            mentionedFacts: ['has a border collie'],
            sentiment: 'positive'
        });
    }
}

async function verifyDay23() {
    console.log('--- Verifying Day 23: Viewer Profile Generation ---');

    const viewerId = `test-viewer-${Date.now()}`;
    const mockLLM = new MockLLMService();
    const profileService = new ViewerProfileService({ llmService: mockLLM });
    const promptManager = new PromptManager({ viewerProfileService: profileService });

    // 1. Setup: Create Parent Viewer
    await prisma.viewer.create({
        data: {
            id: viewerId,
            name: 'TestUser',
            platform: 'test',
            externalId: viewerId
        }
    });

    // 2. Initial State (No profile)
    const initialProfile = await profileService.getProfile(viewerId);
    console.log(`[Step 1] Initial profile check: ${initialProfile === null ? 'OK (Null)' : 'Failed'}`);


    // 2. Simulate User Comment & Update Profile
    console.log('[Step 2] User comments: "I just got a new border collie! It\'s so cute! 🐕"');
    await profileService.updateProfile(viewerId, "I just got a new border collie! It's so cute! 🐕");
    console.log('...Profile update triggered.');

    // 3. Verify Database Update
    const updatedProfile = await profileService.getProfile(viewerId);
    if (updatedProfile && updatedProfile.mentionedFacts.includes('has a border collie')) {
        console.log('✅ Success: Profile updated in DB with extracted fact.');
        console.log('Detected Personality:', updatedProfile.estimatedPersonality);
    } else {
        console.error('❌ Failed: Profile not updated or missing facts.');
        console.log('Current Profile:', updatedProfile);
    }

    // 4. Verify Context Injection in PromptManager
    console.log('[Step 3] verifying context injection in PromptManager...');
    const mockTopic: TopicState = {
        title: 'Test Topic',
        currentTopicId: 't1',
        currentSectionIndex: 0,
        outline: ['Section 1'],
        lockUntil: 0
    };

    const replyPrompt = await promptManager.buildReplyPrompt(
        {
            id: 'msg1',
            authorName: 'TestUser',
            content: 'Hello!',
            timestamp: Date.now()
        },
        mockTopic,
        [], // no memories
        undefined,
        undefined,
        undefined,
        { viewerId: viewerId }
    );

    const systemPrompt = replyPrompt.systemPrompt;
    if (systemPrompt.includes('has a border collie') && systemPrompt.includes('VIEWER PROFILE')) {
        console.log('✅ Success: PromptManager injected viewer profile data.');
    } else {
        console.error('❌ Failed: System prompt missing viewer profile data.');
    }

    // Cleanup
    await prisma.viewerProfile.deleteMany({ where: { viewerId } }).catch(() => { });
    await prisma.viewer.deleteMany({ where: { id: viewerId } }).catch(() => { });
}

verifyDay23().catch(console.error);
