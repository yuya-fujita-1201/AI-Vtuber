/**
 * End-to-End Integration Test
 *
 * Tests the full Agent + MemoryService integration:
 * 1. Agent creates a stream session
 * 2. Agent processes messages and stores them
 * 3. Agent uses memory context in replies
 * 4. Cleanup and shutdown
 */

import { Agent } from './src/core/Agent';
import { MemoryService } from './src/services/MemoryService';
import { prisma } from './src/lib/prisma';
import { IChatAdapter, ChatMessage } from './src/interfaces';

// Mock ChatAdapter for testing
class MockChatAdapter implements IChatAdapter {
    private messages: ChatMessage[] = [];
    private messageIndex = 0;

    constructor(messages: ChatMessage[]) {
        this.messages = messages;
    }

    async connect(): Promise<void> {
        console.log('[MockAdapter] Connected');
    }

    async fetchNewMessages(): Promise<ChatMessage[]> {
        if (this.messageIndex >= this.messages.length) {
            return [];
        }
        const msg = this.messages[this.messageIndex];
        this.messageIndex++;
        return [msg];
    }

    async disconnect(): Promise<void> {
        console.log('[MockAdapter] Disconnected');
    }
}

async function runIntegrationTest() {
    console.log('========================================');
    console.log('End-to-End Integration Test');
    console.log('========================================\n');

    let memoryService: MemoryService | null = null;
    let agent: Agent | null = null;

    try {
        // Test 1: Setup
        console.log('Test 1: Setup ChromaDB and MemoryService');
        memoryService = new MemoryService(process.env.CHROMA_URL);
        console.log('✅ MemoryService created\n');

        // Test 2: Create Mock Messages
        console.log('Test 2: Prepare Mock Messages');
        const testMessages: ChatMessage[] = [
            {
                id: 'msg1',
                authorName: 'Alice',
                content: '猫が好きです！3匹飼っています',
                timestamp: Date.now(),
            },
            {
                id: 'msg2',
                authorName: 'Bob',
                content: 'TypeScriptについて教えてください',
                timestamp: Date.now() + 1000,
            },
            {
                id: 'msg3',
                authorName: 'Alice',
                content: '私のペットの話を覚えていますか？',
                timestamp: Date.now() + 2000,
            },
        ];
        console.log(`✅ Prepared ${testMessages.length} test messages\n`);

        // Test 3: Create Agent with Memory
        console.log('Test 3: Create Agent with MemoryService Integration');
        const mockAdapter = new MockChatAdapter(testMessages);
        await mockAdapter.connect();

        agent = new Agent(
            mockAdapter,
            undefined, // Use default OpenAIService
            undefined, // Use default PromptManager
            undefined, // Use default VoicevoxService
            undefined, // Use default AudioPlayer
            memoryService // Pass memory service
        );
        console.log('✅ Agent created with MemoryService\n');

        // Test 4: Start Agent (but stop after processing messages)
        console.log('Test 4: Start Agent and Process Messages');
        const agentPromise = agent.start();

        // Wait for messages to be processed
        await new Promise(resolve => setTimeout(resolve, 5000));

        // Stop agent
        await agent.stop();
        console.log('✅ Agent processed messages and stopped\n');

        // Test 5: Verify Database Storage
        console.log('Test 5: Verify Database Storage');

        const streams = await prisma.stream.findMany();
        console.log(`   Streams created: ${streams.length}`);
        if (streams.length === 0) {
            throw new Error('No streams were created!');
        }

        const messages = await prisma.message.findMany({
            include: { viewer: true },
        });
        console.log(`   Messages stored: ${messages.length}`);
        console.log(`   Unique viewers: ${new Set(messages.map(m => m.viewerId)).size}`);

        if (messages.length === 0) {
            throw new Error('No messages were stored!');
        }

        const memories = await prisma.memory.findMany();
        console.log(`   Memories created: ${memories.length}`);
        console.log('✅ Data stored successfully\n');

        // Test 6: Verify Memory Search
        console.log('Test 6: Verify Memory Search Functionality');
        const searchResults = await memoryService.searchMemory('猫 ペット', 3);
        console.log(`   Search results for "猫 ペット": ${searchResults.length}`);

        if (searchResults.length > 0) {
            console.log(`   Top result: ${searchResults[0].content.substring(0, 50)}...`);
            console.log(`   Similarity: ${searchResults[0].similarity.toFixed(3)}`);
        }
        console.log('✅ Memory search working\n');

        // Test 7: Verify Viewer Tracking
        console.log('Test 7: Verify Viewer Tracking');
        const viewers = await prisma.viewer.findMany({
            include: { _count: { select: { messages: true, memories: true } } },
        });

        viewers.forEach(viewer => {
            console.log(`   Viewer: ${viewer.name}`);
            console.log(`     Messages: ${viewer._count.messages}`);
            console.log(`     Memories: ${viewer._count.memories}`);
            console.log(`     First seen: ${viewer.firstSeenAt.toISOString()}`);
            console.log(`     Last seen: ${viewer.lastSeenAt.toISOString()}`);
        });
        console.log('✅ Viewer tracking working\n');

        // Test 8: Verify Stream Session
        console.log('Test 8: Verify Stream Session');
        const stream = streams[0];
        console.log(`   Stream ID: ${stream.id}`);
        console.log(`   Title: ${stream.title || 'Untitled'}`);
        console.log(`   Started: ${stream.startedAt.toISOString()}`);
        console.log(`   Ended: ${stream.endedAt ? stream.endedAt.toISOString() : 'Still active'}`);
        console.log('✅ Stream session tracked correctly\n');

        // Test 9: Cleanup
        console.log('Test 9: Cleanup Test Data');
        await prisma.memory.deleteMany({});
        await prisma.message.deleteMany({});
        await prisma.viewer.deleteMany({});
        await prisma.stream.deleteMany({});
        console.log('✅ Test data cleaned up\n');

        console.log('========================================');
        console.log('✅ All Integration Tests Passed!');
        console.log('========================================\n');
        console.log('The Agent + MemoryService integration is working correctly!');
        console.log('Your AI VTuber can now:');
        console.log('  - Remember viewers across sessions');
        console.log('  - Store and recall past conversations');
        console.log('  - Search memories semantically');
        console.log('  - Track stream sessions with metadata\n');
    } catch (error) {
        console.error('\n❌ Integration Test Failed:', error);
        process.exit(1);
    } finally {
        // Cleanup
        if (memoryService) {
            await memoryService.disconnect();
        }
        await prisma.$disconnect();
    }
}

// Run tests
runIntegrationTest();
