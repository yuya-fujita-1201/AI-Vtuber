const prismaMock = {
  topicHistory: {
    findUnique: jest.fn(),
    upsert: jest.fn()
  }
};

const loggerMock = {
  error: jest.fn()
};

jest.mock('../../lib/prisma', () => ({
  prisma: prismaMock
}));

jest.mock('../../lib/logger', () => ({
  logger: loggerMock
}));

import { TopicService } from '../TopicService';

describe('TopicService', () => {
  const service = new TopicService();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('normalizes topic names and synonyms', () => {
    expect(service.normalizeTopicName(' React JS ')).toBe('react');
    expect(service.normalizeTopicName('vue.js')).toBe('vue');
    expect(service.normalizeTopicName('NODE_js')).toBe('node');
  });

  it('returns null when topic history does not exist', async () => {
    prismaMock.topicHistory.findUnique.mockResolvedValue(null);

    const result = await service.getTopicHistory('React');

    expect(result).toBeNull();
    expect(prismaMock.topicHistory.findUnique).toHaveBeenCalledWith({
      where: { normalizedName: 'react' }
    });
  });

  it('maps nullable fields to undefined for topic history', async () => {
    const now = new Date('2025-01-02T12:00:00.000Z');
    prismaMock.topicHistory.findUnique.mockResolvedValue({
      id: 'topic-1',
      topicName: 'Vue.js',
      normalizedName: 'vue',
      totalMentions: 3,
      firstDiscussedAt: now,
      lastDiscussedAt: now,
      lastViewerId: null,
      lastSentiment: null
    });

    const result = await service.getTopicHistory('Vue.js');

    expect(result).toEqual({
      topicName: 'Vue.js',
      normalizedName: 'vue',
      totalMentions: 3,
      firstDiscussedAt: now,
      lastDiscussedAt: now,
      lastViewerId: undefined,
      lastSentiment: undefined
    });
  });

  it('upserts topic mentions with normalized name and metadata', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2025-01-01T00:00:00.000Z'));
    const now = new Date();

    prismaMock.topicHistory.upsert.mockResolvedValue({
      id: 'topic-2',
      topicName: 'React.js',
      normalizedName: 'react',
      totalMentions: 2,
      firstDiscussedAt: now,
      lastDiscussedAt: now,
      lastViewerId: 'viewer-1',
      lastSentiment: 'positive'
    });

    const result = await service.updateTopicMention('React.js', 'viewer-1', 'positive');

    expect(prismaMock.topicHistory.upsert).toHaveBeenCalledTimes(1);
    const args = prismaMock.topicHistory.upsert.mock.calls[0][0];

    expect(args.where).toEqual({ normalizedName: 'react' });
    expect(args.update).toMatchObject({
      topicName: 'React.js',
      lastDiscussedAt: now,
      totalMentions: { increment: 1 },
      lastViewerId: 'viewer-1',
      lastSentiment: 'positive'
    });
    expect(args.create).toMatchObject({
      topicName: 'React.js',
      normalizedName: 'react',
      totalMentions: 1,
      firstDiscussedAt: now,
      lastDiscussedAt: now,
      lastViewerId: 'viewer-1',
      lastSentiment: 'positive'
    });

    expect(result).toEqual({
      topicName: 'React.js',
      normalizedName: 'react',
      totalMentions: 2,
      firstDiscussedAt: now,
      lastDiscussedAt: now,
      lastViewerId: 'viewer-1',
      lastSentiment: 'positive'
    });

    jest.useRealTimers();
  });
});
