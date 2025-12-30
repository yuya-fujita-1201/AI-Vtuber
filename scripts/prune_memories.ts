import { ChromaClient } from 'chromadb';
import { prisma } from '../src/lib/prisma';
import { config } from '../src/config/AppConfig';
import { calculateFreshnessScore } from '../src/services/MemoryService';

type PruneMode = 'archive' | 'delete';

const parseArgs = (argv: string[]) => {
  const args: Record<string, string | boolean> = {};
  argv.forEach(arg => {
    if (!arg.startsWith('--')) return;
    const [rawKey, rawValue] = arg.replace(/^--/, '').split('=');
    if (rawValue === undefined) {
      args[rawKey] = true;
    } else {
      args[rawKey] = rawValue;
    }
  });
  return args;
};

const toNumber = (value: unknown, fallback: number) => {
  if (value === undefined || value === null) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const run = async () => {
  const args = parseArgs(process.argv.slice(2));
  const mode = (args.mode ?? 'archive') as PruneMode;
  const threshold = toNumber(args.threshold, config.memory.pruning.threshold);
  const decayDays = toNumber(args['decay-days'], config.memory.pruning.decayDays);
  const dryRun = args['dry-run'] === true || args.dryRun === true;

  if (mode !== 'archive' && mode !== 'delete') {
    throw new Error(`Invalid mode: ${mode}. Use --mode=archive or --mode=delete.`);
  }

  console.log('========================================');
  console.log('Memory Pruning Script');
  console.log('========================================');
  console.log(`Mode: ${mode}`);
  console.log(`Threshold: ${threshold}`);
  console.log(`Decay days: ${decayDays}`);
  console.log(`Dry run: ${dryRun ? 'yes' : 'no'}`);
  console.log('');

  const memories = await prisma.memory.findMany({
    where: { isArchived: false }
  });

  const now = new Date();
  const candidates = memories.map(memory => {
    const score = calculateFreshnessScore(
      {
        importance: memory.importance,
        accessCount: memory.accessCount,
        lastAccessedAt: memory.lastAccessedAt,
        createdAt: memory.createdAt
      },
      { decayDays, now }
    );
    return { memory, score };
  });

  const toPrune = candidates.filter(item => item.score < threshold);

  console.log(`Active memories: ${memories.length}`);
  console.log(`Prune candidates: ${toPrune.length}`);
  console.log('');

  if (toPrune.length === 0) {
    console.log('No memories to prune.');
    return;
  }

  let collection = null;
  try {
    const chroma = new ChromaClient({ path: config.memory.chromaUrl });
    collection = await chroma.getCollection({ name: config.memory.collectionName });
  } catch (error) {
    console.warn('[prune_memories] Failed to connect to ChromaDB; vector cleanup will be skipped.', error);
  }

  for (const { memory, score } of toPrune) {
    const reason = `score=${score.toFixed(3)} < threshold=${threshold}`;
    console.log(`- ${memory.id} (${memory.type}) ${reason}`);

    if (dryRun) continue;

    if (collection && memory.vectorId) {
      try {
        await collection.delete({ ids: [memory.vectorId] });
      } catch (error) {
        console.warn(`[prune_memories] Failed to delete vector ${memory.vectorId}`, error);
      }
    }

    if (mode === 'delete') {
      await prisma.memory.delete({ where: { id: memory.id } });
    } else {
      await prisma.memory.update({
        where: { id: memory.id },
        data: {
          isArchived: true,
          archivedAt: new Date()
        }
      });
    }
  }

  console.log('');
  console.log(`Pruning complete. ${dryRun ? 'No changes applied (dry run).' : 'Changes applied.'}`);
};

run()
  .catch(error => {
    console.error('❌ Memory pruning failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
