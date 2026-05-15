import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('findGroup', () => {
  let mockGroupFetch;
  let mockSock;

  beforeEach(() => {
    vi.clearAllMocks();
    mockGroupFetch = vi.fn();
    mockSock = {
      groupFetchAllParticipating: mockGroupFetch,
    };
  });

  it('should find group by exact JID when groupJid is provided', async () => {
    const { findGroup } = await import('../../../src/sender/group-finder.js');
    mockGroupFetch.mockResolvedValue({
      '123@g.us': { id: '123@g.us', subject: 'Test Group' },
      '456@g.us': { id: '456@g.us', subject: 'Other Group' },
    });

    const result = await findGroup(mockSock, '123@g.us', null);
    expect(result).toEqual({ id: '123@g.us', subject: 'Test Group' });
  });

  it('should find group by exact name match', async () => {
    const { findGroup } = await import('../../../src/sender/group-finder.js');
    mockGroupFetch.mockResolvedValue({
      '123@g.us': { id: '123@g.us', subject: 'Laporan Manifest Umroh' },
      '456@g.us': { id: '456@g.us', subject: 'Other Group' },
    });

    const result = await findGroup(mockSock, null, 'Laporan Manifest Umroh');
    expect(result).toEqual({ id: '123@g.us', subject: 'Laporan Manifest Umroh' });
  });

  it('should find group by case-insensitive contains match when no exact match', async () => {
    const { findGroup } = await import('../../../src/sender/group-finder.js');
    mockGroupFetch.mockResolvedValue({
      '123@g.us': { id: '123@g.us', subject: 'Group A Chat' },
      '456@g.us': { id: '456@g.us', subject: 'laporan manifest umroh group' },
      '789@g.us': { id: '789@g.us', subject: 'Group B Chat' },
    });

    const result = await findGroup(mockSock, null, 'Laporan Manifest');
    expect(result).toEqual({ id: '456@g.us', subject: 'laporan manifest umroh group' });
  });

  it('should prefer JID match over name match', async () => {
    const { findGroup } = await import('../../../src/sender/group-finder.js');
    mockGroupFetch.mockResolvedValue({
      '123@g.us': { id: '123@g.us', subject: 'Target Group' },
      '456@g.us': { id: '456@g.us', subject: 'Some Other Group' },
    });

    const result = await findGroup(mockSock, '123@g.us', 'Some Other Group');
    expect(result).toEqual({ id: '123@g.us', subject: 'Target Group' });
  });

  it('should throw GROUP_NOT_FOUND error with available groups listed when no match found', async () => {
    const { findGroup } = await import('../../../src/sender/group-finder.js');
    mockGroupFetch.mockResolvedValue({
      '111@g.us': { id: '111@g.us', subject: 'Group Alpha' },
      '222@g.us': { id: '222@g.us', subject: 'Group Beta' },
    });

    try {
      await findGroup(mockSock, null, 'NonExistent Group');
      expect.fail('Should have thrown');
    } catch (error) {
      expect(error.message).toContain('GROUP_NOT_FOUND');
      expect(error.message).toContain('Group Alpha');
      expect(error.message).toContain('Group Beta');
    }
  });

  it('should throw GROUP_NOT_FOUND when groupJid does not match any group', async () => {
    const { findGroup } = await import('../../../src/sender/group-finder.js');
    mockGroupFetch.mockResolvedValue({
      '111@g.us': { id: '111@g.us', subject: 'Group Alpha' },
    });

    try {
      await findGroup(mockSock, '999@g.us', null);
      expect.fail('Should have thrown');
    } catch (error) {
      expect(error.message).toContain('GROUP_NOT_FOUND');
    }
  });

  it('should use groupName as fallback when JID not found', async () => {
    const { findGroup } = await import('../../../src/sender/group-finder.js');
    mockGroupFetch.mockResolvedValue({
      '111@g.us': { id: '111@g.us', subject: 'Laporan Manifest Umroh' },
    });

    // JID not found, but name matches
    const result = await findGroup(mockSock, '999@g.us', 'Laporan Manifest Umroh');
    expect(result).toEqual({ id: '111@g.us', subject: 'Laporan Manifest Umroh' });
  });

  it('should return first match for case-insensitive search when multiple groups contain the name', async () => {
    const { findGroup } = await import('../../../src/sender/group-finder.js');
    mockGroupFetch.mockResolvedValue({
      '111@g.us': { id: '111@g.us', subject: 'Laporan A' },
      '222@g.us': { id: '222@g.us', subject: 'Laporan B' },
    });

    const result = await findGroup(mockSock, null, 'laporan');
    expect(result).toBeDefined();
    expect(result.subject).toMatch(/Laporan/);
  });

  it('should propagate errors from groupFetchAllParticipating', async () => {
    const { findGroup } = await import('../../../src/sender/group-finder.js');
    mockGroupFetch.mockRejectedValue(new Error('Network error'));

    await expect(findGroup(mockSock, null, 'Test')).rejects.toThrow('Network error');
  });
});
