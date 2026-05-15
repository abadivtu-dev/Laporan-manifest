import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../../src/utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('MessageQueue', () => {
  let mockSock;
  const originalMathRandom = Math.random;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSock = {
      sendMessage: vi.fn(),
    };
    // Default: Math.random returns 0 (minimum jitter)
    Math.random = vi.fn(() => 0);
  });

  afterEach(() => {
    Math.random = originalMathRandom;
    vi.useRealTimers();
  });

  describe('constructor', () => {
    it('should use default delays when no options provided', async () => {
      const { MessageQueue } = await import('../../../src/sender/message-queue.js');
      const queue = new MessageQueue();
      const stats = queue.getStats();
      expect(stats).toEqual({ sent: 0, failed: 0, avgDelayMs: 0 });
    });

    it('should accept custom min and max delay', async () => {
      const { MessageQueue } = await import('../../../src/sender/message-queue.js');
      const queue = new MessageQueue({ minDelayMs: 500, maxDelayMs: 1000 });
      expect(queue._minDelayMs).toBe(500);
      expect(queue._maxDelayMs).toBe(1000);
    });
  });

  describe('sendToGroup()', () => {
    it('should send message with image and caption', async () => {
      const { MessageQueue } = await import('../../../src/sender/message-queue.js');
      const queue = new MessageQueue({ minDelayMs: 0, maxDelayMs: 0 });

      mockSock.sendMessage.mockResolvedValue({ key: { id: 'abc123' } });

      const result = await queue.sendToGroup(mockSock, '123@g.us', Buffer.from('test-image'), 'Test caption');

      expect(mockSock.sendMessage).toHaveBeenCalledWith('123@g.us', {
        image: Buffer.from('test-image'),
        caption: 'Test caption',
      });
      expect(result).toEqual({ success: true, messageId: 'abc123' });
    });

    it('should apply base delay between messages', async () => {
      vi.useFakeTimers();
      const { MessageQueue } = await import('../../../src/sender/message-queue.js');
      const queue = new MessageQueue({ minDelayMs: 1000, maxDelayMs: 1000 });

      mockSock.sendMessage.mockResolvedValue({ key: { id: 'msg1' } });

      // Send first message (no delay for first)
      const p1 = queue.sendToGroup(mockSock, '123@g.us', Buffer.from('img'), 'cap1');
      await vi.advanceTimersByTimeAsync(0);
      await p1;
      expect(mockSock.sendMessage).toHaveBeenCalledTimes(1);

      // Send second message - should wait for base delay
      const p2 = queue.sendToGroup(mockSock, '123@g.us', Buffer.from('img'), 'cap2');

      // Advance time by less than delay - second should not have resolved yet
      await vi.advanceTimersByTimeAsync(500);
      expect(mockSock.sendMessage).toHaveBeenCalledTimes(1);

      // Advance past the full delay
      await vi.advanceTimersByTimeAsync(501);
      await p2;
      expect(mockSock.sendMessage).toHaveBeenCalledTimes(2);
    });

    it('should add jitter between min and max delay', async () => {
      vi.useFakeTimers();
      const { MessageQueue } = await import('../../../src/sender/message-queue.js');
      const queue = new MessageQueue({ minDelayMs: 4000, maxDelayMs: 6000 });

      // Math.random returns 0.5, so jitter = 4000 + 0.5 * 2000 = 5000
      Math.random = vi.fn(() => 0.5);

      mockSock.sendMessage.mockResolvedValue({ key: { id: 'msg1' } });

      // First message (no delay)
      const p1 = queue.sendToGroup(mockSock, '123@g.us', Buffer.from('img'), 'cap1');
      await vi.advanceTimersByTimeAsync(0);
      await p1;
      expect(mockSock.sendMessage).toHaveBeenCalledTimes(1);

      // Second message should have ~5000ms delay
      const p2 = queue.sendToGroup(mockSock, '123@g.us', Buffer.from('img'), 'cap2');

      // At 4500ms, should NOT have fired yet
      await vi.advanceTimersByTimeAsync(4500);
      expect(mockSock.sendMessage).toHaveBeenCalledTimes(1);

      // Advance remaining to trigger
      await vi.advanceTimersByTimeAsync(501);
      await p2;
      expect(mockSock.sendMessage).toHaveBeenCalledTimes(2);
    });

    it('should retry with exponential backoff on failure', async () => {
      vi.useFakeTimers();
      const { MessageQueue } = await import('../../../src/sender/message-queue.js');
      const queue = new MessageQueue({ minDelayMs: 1000, maxDelayMs: 1000 });

      // Fail first attempt, then succeed
      mockSock.sendMessage
        .mockRejectedValueOnce(new Error('Send failed'))
        .mockResolvedValueOnce({ key: { id: 'retry-success' } });

      const p = queue.sendToGroup(mockSock, '123@g.us', Buffer.from('img'), 'cap');

      // Advance past first retry delay: 1000ms (backoff: base * 2^0)
      await vi.advanceTimersByTimeAsync(1001);
      await p;

      // Should have called sendMessage twice: 1st fail + retry success
      expect(mockSock.sendMessage).toHaveBeenCalledTimes(2);
      await expect(p).resolves.toEqual({ success: true, messageId: 'retry-success' });
    });

    it('should fail after max retries exhausted', async () => {
      vi.useFakeTimers();
      const { MessageQueue } = await import('../../../src/sender/message-queue.js');
      const queue = new MessageQueue({ minDelayMs: 100, maxDelayMs: 100 });

      // Always fail
      mockSock.sendMessage.mockRejectedValue(new Error('Persistent failure'));

      const p = queue.sendToGroup(mockSock, '123@g.us', Buffer.from('img'), 'cap');

      // Advance enough for all retries: 100 (first backoff) + 200 (second backoff) = 300ms
      await vi.advanceTimersByTimeAsync(500);

      const result = await p;
      expect(result).toEqual({ success: false, messageId: undefined });
      // 3 attempts total (1 initial + 2 retries)
      expect(mockSock.sendMessage).toHaveBeenCalledTimes(3);
    });

    it('should reset consecutiveFails on success', async () => {
      vi.useFakeTimers();
      const { MessageQueue } = await import('../../../src/sender/message-queue.js');
      const queue = new MessageQueue({ minDelayMs: 100, maxDelayMs: 100 });

      // Fail once, then succeed
      mockSock.sendMessage
        .mockRejectedValueOnce(new Error('Fail'))
        .mockResolvedValueOnce({ key: { id: 'ok' } });

      const p1 = queue.sendToGroup(mockSock, '123@g.us', Buffer.from('img'), 'cap1');

      // Wait for retry backoff (100ms) + margin
      await vi.advanceTimersByTimeAsync(300);
      const r1 = await p1;
      expect(r1.success).toBe(true);
      expect(r1.messageId).toBe('ok');

      // Now consecutiveFails is 0. Second message should use normal base delay (100ms).
      mockSock.sendMessage.mockResolvedValue({ key: { id: 'msg2' } });

      const p2 = queue.sendToGroup(mockSock, '123@g.us', Buffer.from('img'), 'cap2');

      // Advance past base delay
      await vi.advanceTimersByTimeAsync(200);
      const r2 = await p2;
      expect(r2.success).toBe(true);

      // Total calls: 1st fail, retry success, 2nd msg success = 3
      expect(mockSock.sendMessage).toHaveBeenCalledTimes(3);
    });

    it('should throw immediately on auth_failure', async () => {
      const { MessageQueue } = await import('../../../src/sender/message-queue.js');
      const queue = new MessageQueue({ minDelayMs: 0, maxDelayMs: 0 });

      mockSock.sendMessage.mockRejectedValue(new Error('auth_failure: Session expired'));

      await expect(
        queue.sendToGroup(mockSock, '123@g.us', Buffer.from('img'), 'cap'),
      ).rejects.toThrow('auth_failure');
    });

    it('should log send attempts', async () => {
      const { MessageQueue } = await import('../../../src/sender/message-queue.js');
      const { logger } = await import('../../../src/utils/logger.js');
      const queue = new MessageQueue({ minDelayMs: 0, maxDelayMs: 0 });

      mockSock.sendMessage.mockResolvedValue({ key: { id: 'msg1' } });

      await queue.sendToGroup(mockSock, '123@g.us', Buffer.from('img'), 'caption');

      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('[wa]'), expect.any(Object));
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('sent'), expect.any(Object));
    });
  });

  describe('getStats()', () => {
    it('should return correct stats after successful sends', async () => {
      const { MessageQueue } = await import('../../../src/sender/message-queue.js');
      const queue = new MessageQueue({ minDelayMs: 0, maxDelayMs: 0 });

      mockSock.sendMessage.mockResolvedValue({ key: { id: 'msg1' } });

      await queue.sendToGroup(mockSock, '123@g.us', Buffer.from('img'), 'cap1');
      await queue.sendToGroup(mockSock, '123@g.us', Buffer.from('img'), 'cap2');
      await queue.sendToGroup(mockSock, '123@g.us', Buffer.from('img'), 'cap3');

      const stats = queue.getStats();
      expect(stats.sent).toBe(3);
      expect(stats.failed).toBe(0);
      expect(stats.avgDelayMs).toBe(0);
    });

    it('should track failed sends', async () => {
      vi.useFakeTimers();
      const { MessageQueue } = await import('../../../src/sender/message-queue.js');
      const queue = new MessageQueue({ minDelayMs: 100, maxDelayMs: 100 });

      mockSock.sendMessage.mockRejectedValue(new Error('Fail'));

      const p = queue.sendToGroup(mockSock, '123@g.us', Buffer.from('img'), 'cap');
      await vi.advanceTimersByTimeAsync(500);
      await p;

      const stats = queue.getStats();
      expect(stats.failed).toBe(1);
    });

    it('should calculate avgDelayMs', async () => {
      vi.useFakeTimers();
      const { MessageQueue } = await import('../../../src/sender/message-queue.js');
      const queue = new MessageQueue({ minDelayMs: 1000, maxDelayMs: 1000 });

      mockSock.sendMessage.mockResolvedValue({ key: { id: 'msg1' } });

      // Send 2 messages with 1000ms delay between them
      const p1 = queue.sendToGroup(mockSock, '123@g.us', Buffer.from('img'), 'cap1');
      await vi.advanceTimersByTimeAsync(0);
      await p1;

      const p2 = queue.sendToGroup(mockSock, '123@g.us', Buffer.from('img'), 'cap2');
      await vi.advanceTimersByTimeAsync(1001);
      await p2;

      const stats = queue.getStats();
      expect(stats.sent).toBe(2);
      expect(stats.avgDelayMs).toBeGreaterThanOrEqual(500);
    });
  });
});
