import { logger } from './logger';

export type RetryOptions = {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  timeoutMs: number;
  shouldRetry?: (error: unknown) => boolean;
  onRetry?: (info: { attempt: number; maxAttempts: number; delayMs: number; error: unknown }) => void;
};

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const defaultShouldRetry = (error: unknown): boolean => {
  if (!error) return false;

  const anyError = error as any;
  const status = anyError?.status ?? anyError?.response?.status ?? anyError?.response?.statusCode;
  if (typeof status === 'number') {
    if (status >= 500) return true;
    if (status === 429) return true;
  }

  const code = anyError?.code ?? anyError?.errno;
  if (typeof code === 'string') {
    if (['ETIMEDOUT', 'ECONNRESET', 'ECONNABORTED', 'EAI_AGAIN', 'ENOTFOUND', 'ERR_NETWORK'].includes(code)) {
      return true;
    }
  }

  if (anyError?.name === 'AbortError') {
    return true;
  }

  const message = typeof anyError?.message === 'string' ? anyError.message.toLowerCase() : '';
  if (message.includes('timeout') || message.includes('timed out')) {
    return true;
  }

  return false;
};

const withTimeout = async <T>(
  fn: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number
): Promise<T> => {
  const controller = new AbortController();
  let timeoutId: NodeJS.Timeout | undefined;

  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timeoutId = setTimeout(() => {
      controller.abort();
      const err = new Error('LLM request timed out');
      (err as any).code = 'ETIMEDOUT';
      reject(err);
    }, timeoutMs);
  });

  const fnPromise = fn(controller.signal);
  fnPromise.catch(() => undefined);

  try {
    return await Promise.race([fnPromise, timeoutPromise]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
};

export const withRetry = async <T>(
  fn: (signal: AbortSignal) => Promise<T>,
  options: RetryOptions
): Promise<T> => {
  const {
    maxAttempts,
    baseDelayMs,
    maxDelayMs,
    timeoutMs,
    shouldRetry = defaultShouldRetry,
    onRetry
  } = options;

  let attempt = 0;
  while (attempt < maxAttempts) {
    try {
      return await withTimeout(fn, timeoutMs);
    } catch (error) {
      const nextAttempt = attempt + 1;
      if (!shouldRetry(error) || nextAttempt >= maxAttempts) {
        throw error;
      }

      const delayBase = Math.min(maxDelayMs, baseDelayMs * Math.pow(2, attempt));
      const jitter = Math.random() * 0.2 * delayBase;
      const delayMs = Math.round(delayBase + jitter);

      if (onRetry) {
        onRetry({ attempt: nextAttempt + 1, maxAttempts, delayMs, error });
      } else {
        logger.warn(`[LLM] Retry ${nextAttempt + 1}/${maxAttempts} in ${delayMs}ms`, error);
      }

      await sleep(delayMs);
      attempt = nextAttempt;
    }
  }

  throw new Error('Retry attempts exhausted');
};
