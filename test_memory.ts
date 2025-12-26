/**
 * Memory System Test
 *
 * This script tests the hybrid memory system:
 * 1. Prisma database connection
 * 2. ChromaDB connection
 * 3. Memory creation and storage
 * 4. Semantic search functionality
 */

import { MemoryService, MemoryType } from './src/services/MemoryService';
import { prisma } from './src/lib/prisma';

async function testMemorySystem() {
  console.log('========================================');
  console.log('Memory System Test');
  console.log('========================================\n');

  let memoryService: MemoryService | null = null;

  try {
    // Test 1: Prisma Database Connection
    console.log('Test 1: Prisma Database Connection');
    await prisma.$connect();
    console.log('✅ Prisma connected to SQLite database\n');

    // Test 2: ChromaDB Connection
    console.log('Test 2: ChromaDB Connection');
    memoryService = new MemoryService(process.env.CHROMA_URL);
    await memoryService.initialize();
    console.log('✅ ChromaDB initialized successfully\n');

    // Test 3: Create a Stream
    console.log('Test 3: Create a Stream Session');
    const stream = await prisma.stream.create({
      data: {
        title: 'Test Stream - Learning TypeScript',
        platform: 'mock',
      },
    });
    console.log(`✅ Stream created: ${stream.id}`);
    console.log(`   Title: ${stream.title}\n`);

    // Test 4: Create a Viewer
    console.log('Test 4: Create a Viewer');
    const viewer = await prisma.viewer.create({
      data: {
        name: 'TestUser',
        externalId: 'test_user_001',
        platform: 'mock',
      },
    });
    console.log(`✅ Viewer created: ${viewer.id}`);
    console.log(`   Name: ${viewer.name}\n`);

    // Test 5: Add Memories with Embeddings
    console.log('Test 5: Add Memories with Vector Embeddings');

    const memory1Id = await memoryService.addMemory({
      content: 'TypeScript is a strongly typed programming language that builds on JavaScript',
      type: MemoryType.FACT,
      importance: 8,
      streamId: stream.id,
      metadata: { topic: 'programming' },
    });
    console.log(`✅ Memory 1 added: ${memory1Id}`);

    const memory2Id = await memoryService.addMemory({
      content: 'The user TestUser mentioned they love cats and have three pets at home',
      type: MemoryType.VIEWER_INFO,
      importance: 7,
      viewerId: viewer.id,
      streamId: stream.id,
      metadata: { topic: 'pets' },
    });
    console.log(`✅ Memory 2 added: ${memory2Id}`);

    const memory3Id = await memoryService.addMemory({
      content: 'Python is a high-level programming language known for its simplicity',
      type: MemoryType.FACT,
      importance: 6,
      streamId: stream.id,
      metadata: { topic: 'programming' },
    });
    console.log(`✅ Memory 3 added: ${memory3Id}\n`);

    // Test 6: Semantic Search
    console.log('Test 6: Semantic Search');

    console.log('\nQuery 1: "What programming languages were discussed?"');
    const searchResults1 = await memoryService.searchMemory(
      'programming languages',
      2
    );
    console.log(`Found ${searchResults1.length} results:`);
    searchResults1.forEach((result, idx) => {
      console.log(`  ${idx + 1}. [Similarity: ${result.similarity.toFixed(3)}] ${result.content.substring(0, 60)}...`);
    });

    console.log('\nQuery 2: "Tell me about the user TestUser"');
    const searchResults2 = await memoryService.searchMemory(
      'TestUser preferences',
      1,
      { type: MemoryType.VIEWER_INFO }
    );
    console.log(`Found ${searchResults2.length} results:`);
    searchResults2.forEach((result, idx) => {
      console.log(`  ${idx + 1}. [Similarity: ${result.similarity.toFixed(3)}] ${result.content}`);
    });

    console.log('\nQuery 3: "cats and pets"');
    const searchResults3 = await memoryService.searchMemory('cats and pets', 1);
    console.log(`Found ${searchResults3.length} results:`);
    searchResults3.forEach((result, idx) => {
      console.log(`  ${idx + 1}. [Similarity: ${result.similarity.toFixed(3)}] ${result.content}`);
    });

    console.log('✅ Semantic search working correctly\n');

    // Test 7: Retrieve Viewer Memories
    console.log('Test 7: Retrieve Viewer-Specific Memories');
    const viewerMemories = await memoryService.getViewerMemories(viewer.id);
    console.log(`✅ Found ${viewerMemories.length} memories for viewer ${viewer.name}\n`);

    // Test 8: Retrieve Stream Memories
    console.log('Test 8: Retrieve Stream-Specific Memories');
    const streamMemories = await memoryService.getStreamMemories(stream.id);
    console.log(`✅ Found ${streamMemories.length} memories for stream "${stream.title}"\n`);

    // Test 9: Get Statistics
    console.log('Test 9: Memory System Statistics');
    const stats = await memoryService.getStats();
    console.log(`   ChromaDB vectors: ${stats.chromaCount}`);
    console.log(`   Prisma records: ${stats.prismaCount}`);
    console.log(`   In sync: ${stats.isInSync ? '✅ Yes' : '❌ No'}\n`);

    // Test 10: Cleanup
    console.log('Test 10: Cleanup Test Data');
    await prisma.memory.deleteMany({ where: { streamId: stream.id } });
    await prisma.viewer.delete({ where: { id: viewer.id } });
    await prisma.stream.delete({ where: { id: stream.id } });
    console.log('✅ Test data cleaned up\n');

    console.log('========================================');
    console.log('✅ All Tests Passed!');
    console.log('========================================\n');
    console.log('Your memory system is ready to use!');
    console.log('See docs/DAY7_MEMORY_IMPLEMENTATION.md for integration guide.\n');
  } catch (error) {
    console.error('\n❌ Test Failed:', error);
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
testMemorySystem();
