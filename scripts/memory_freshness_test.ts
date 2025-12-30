import { prisma } from '../src/lib/prisma';
import { MemoryService, MemoryType, calculateFreshnessScore } from '../src/services/MemoryService';

const assert = (condition: boolean, message: string) => {
  if (!condition) {
    throw new Error(message);
  }
};

const run = async () => {
  console.log('========================================');
  console.log('Memory Freshness Test');
  console.log('========================================');

  const now = new Date();
  const oldDate = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000); // 60 days ago

  const memory = await prisma.memory.create({
    data: {
      content: 'Freshness test memory',
      type: MemoryType.FACT,
      importance: 8,
      accessCount: 0,
      lastAccessedAt: oldDate
    }
  });

  const recentScore = calculateFreshnessScore(
    {
      importance: 8,
      accessCount: 0,
      lastAccessedAt: now,
      createdAt: memory.createdAt
    },
    { now }
  );

  const staleScore = calculateFreshnessScore(
    {
      importance: 8,
      accessCount: 0,
      lastAccessedAt: oldDate,
      createdAt: memory.createdAt
    },
    { now }
  );

  assert(
    staleScore < recentScore,
    `Expected stale score < recent score (${staleScore} vs ${recentScore})`
  );
  console.log('✅ Freshness score decays over time.');

  const memoryService = new MemoryService(process.env.CHROMA_URL);

  const before = await prisma.memory.findUnique({ where: { id: memory.id } });
  await memoryService.getMemoryById(memory.id);
  const after = await prisma.memory.findUnique({ where: { id: memory.id } });

  assert(before !== null && after !== null, 'Memory should exist');
  assert(
    (after?.accessCount ?? 0) === (before?.accessCount ?? 0) + 1,
    'Access count should increment on retrieval'
  );
  assert(
    after?.lastAccessedAt && before?.lastAccessedAt && after.lastAccessedAt > before.lastAccessedAt,
    'lastAccessedAt should update on retrieval'
  );
  console.log('✅ Access count and lastAccessedAt update on retrieval.');

  await prisma.memory.delete({ where: { id: memory.id } });

  console.log('✅ Memory freshness tests passed.');
};

run()
  .catch(error => {
    console.error('❌ Memory freshness test failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
