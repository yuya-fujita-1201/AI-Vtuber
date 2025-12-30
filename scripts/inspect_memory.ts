
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('Connecting to database...');
    try {
        const count = await prisma.memory.count();
        console.log(`Total Memories: ${count}`);

        const memories = await prisma.memory.findMany({
            orderBy: { createdAt: 'desc' },
            take: 20,
            include: {
                stream: true,
                viewer: true
            }
        });

        console.log('\n--- Recent 20 Memories ---');
        if (memories.length === 0) {
            console.log('No memories found.');
        }

        for (const m of memories) {
            console.log(`ID: ${m.id}`);
            console.log(`Time: ${m.createdAt.toLocaleString()}`);
            console.log(`Type: ${m.type} | Importance: ${m.importance}`);
            if (m.stream) console.log(`Stream: ${m.stream.title} (${m.stream.platform})`);
            if (m.viewer) console.log(`Viewer: ${m.viewer.name} (${m.viewer.externalId})`);
            console.log(`Content: ${m.content}`);
            console.log('---------------------------');
        }

    } catch (error) {
        console.error('Error connecting to database:', error);
    } finally {
        await prisma.$disconnect();
    }
}

main();
