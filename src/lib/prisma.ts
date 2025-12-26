/**
 * Prisma Client Singleton
 *
 * This module exports a singleton instance of PrismaClient to avoid
 * creating multiple instances during development (hot-reload).
 *
 * Best practice recommended by Prisma:
 * https://www.prisma.io/docs/guides/database/troubleshooting-orm/help-articles/nextjs-prisma-client-dev-practices
 */

import { PrismaClient } from '@prisma/client';

// Extend globalThis to include prisma
declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

// Create a single instance of PrismaClient
export const prisma =
  global.prisma ||
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });

// In development, attach to global to prevent multiple instances during hot-reload
if (process.env.NODE_ENV !== 'production') {
  global.prisma = prisma;
}

/**
 * Graceful shutdown handler
 * Call this when your application is shutting down
 */
export async function disconnectPrisma() {
  await prisma.$disconnect();
  console.log('[Prisma] Disconnected');
}

/**
 * Initialize the database
 * This will ensure the database is ready before the app starts
 */
export async function initializeDatabase() {
  try {
    await prisma.$connect();
    console.log('[Prisma] Connected to database');
  } catch (error) {
    console.error('[Prisma] Failed to connect to database:', error);
    throw error;
  }
}
