import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock Baileys before importing the module
const mockEvOn = vi.fn();
const mockEnd = vi.fn();
const mockWsClose = vi.fn();
const mockMakeWASocket = vi.fn();
const mockUseMultiFileAuthState = vi.fn();
const mockSaveCreds = vi.fn();

vi.mock('@whiskeysockets/baileys', () => ({
  makeWASocket: (...args) => mockMakeWASocket(...args),
  useMultiFileAuthState: (...args) => mockUseMultiFileAuthState(...args),
  DisconnectReason: {
    loggedOut: 401,
    connectionClosed: 428,
    timedOut: 408,
    connectionLost: 408,
    badSession: 500,
    restartRequired: 515,
    forbidden: 403,
    unavailableService: 503,
    connectionReplaced: 440,
    multideviceMismatch: 411,
  },
}));

// Mock logger
vi.mock('../../../src/utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    fatal: vi.fn(),
  },
}));

function createMockSocket(overrides = {}) {
  return {
    ev: {
      on: mockEvOn,
    },
    ws: {
      close: mockWsClose,
      ...overrides.ws,
    },
    end: mockEnd,
    user: { id: 'user@test', name: 'Test User' },
    ...overrides,
  };
}

describe('WA Client', () => {
  let mockSocket;
  let connectionUpdateHandler;
  let credsUpdateHandler;

  beforeEach(async () => {
    vi.clearAllMocks();

    mockSocket = createMockSocket();
    mockMakeWASocket.mockReturnValue(mockSocket);
    mockUseMultiFileAuthState.mockResolvedValue({
      state: { creds: {}, keys: {} },
      saveCreds: mockSaveCreds,
    });

    // Capture the event handlers
    mockEvOn.mockImplementation((event, handler) => {
      if (event === 'connection.update') connectionUpdateHandler = handler;
      if (event === 'creds.update') credsUpdateHandler = handler;
    });

    // Reset module registry to get fresh imports
    vi.resetModules();
  });

  afterEach(async () => {
    vi.resetAllMocks();
  });

  describe('startBot()', () => {
    it('should initialize socket with correct auth and config', async () => {
      const { startBot } = await import('../../../src/sender/wa-client.js');
      const sock = await startBot();

      expect(mockUseMultiFileAuthState).toHaveBeenCalledWith('auth_info');
      expect(mockMakeWASocket).toHaveBeenCalledWith({
        auth: { creds: {}, keys: {} },
        syncFullHistory: false,
        markOnlineOnConnect: false,
        printQRInTerminal: true,
      });
      expect(sock).toBe(mockSocket);
    });

    it('should register connection.update and creds.update event handlers', async () => {
      const { startBot } = await import('../../../src/sender/wa-client.js');
      await startBot();

      expect(mockEvOn).toHaveBeenCalledWith('connection.update', expect.any(Function));
      expect(mockEvOn).toHaveBeenCalledWith('creds.update', expect.any(Function));
    });

    it('should save creds on creds.update event', async () => {
      const { startBot } = await import('../../../src/sender/wa-client.js');
      await startBot();

      credsUpdateHandler({ some: 'data' });
      expect(mockSaveCreds).toHaveBeenCalledWith({ some: 'data' });
    });

    it('should log info on connection open', async () => {
      const { startBot } = await import('../../../src/sender/wa-client.js');
      const { logger } = await import('../../../src/utils/logger.js');
      await startBot();

      connectionUpdateHandler({ connection: 'open' });
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('[wa]'),
        expect.objectContaining({ connection: 'open' }),
      );
    });

    it('should log connecting state', async () => {
      const { startBot } = await import('../../../src/sender/wa-client.js');
      const { logger } = await import('../../../src/utils/logger.js');
      await startBot();

      connectionUpdateHandler({ connection: 'connecting' });
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('[wa]'),
        expect.objectContaining({ connection: 'connecting' }),
      );
    });

    it('should auto-reconnect when connection closed with non-loggedOut reason', async () => {
      const { startBot } = await import('../../../src/sender/wa-client.js');
      await startBot();

      // Simulate close with connectionClosed reason
      const closeUpdate = {
        connection: 'close',
        lastDisconnect: {
          error: {
            output: {
              statusCode: 428,
            },
          },
        },
      };

      connectionUpdateHandler(closeUpdate);

      // Flush microtasks so the async inner startBot() continues
      await Promise.resolve();
      await Promise.resolve();

      expect(mockMakeWASocket).toHaveBeenCalledTimes(2);
    });

    it('should throw error when loggedOut', async () => {
      const { startBot } = await import('../../../src/sender/wa-client.js');
      const { logger } = await import('../../../src/utils/logger.js');
      await startBot();

      const logoutUpdate = {
        connection: 'close',
        lastDisconnect: {
          error: {
            output: {
              statusCode: 401,
            },
          },
        },
      };

      expect(() => connectionUpdateHandler(logoutUpdate)).toThrow();
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('[wa]'),
        expect.objectContaining({ reason: 401 }),
      );
    });

    it('should handle close event without lastDisconnect error object', async () => {
      const { startBot } = await import('../../../src/sender/wa-client.js');
      await startBot();

      const closeUpdate = {
        connection: 'close',
      };

      connectionUpdateHandler(closeUpdate);

      await Promise.resolve();
      await Promise.resolve();

      expect(mockMakeWASocket).toHaveBeenCalledTimes(2);
    });
  });

  describe('isConnected()', () => {
    it('should return true when socket has ws reference', async () => {
      const { isConnected } = await import('../../../src/sender/wa-client.js');
      const sock = createMockSocket();
      expect(isConnected(sock)).toBe(true);
    });

    it('should return false when socket has no ws', async () => {
      const { isConnected } = await import('../../../src/sender/wa-client.js');
      const sock = createMockSocket({ ws: null });
      expect(isConnected(sock)).toBe(false);
    });

    it('should return false when socket is null', async () => {
      const { isConnected } = await import('../../../src/sender/wa-client.js');
      expect(isConnected(null)).toBe(false);
    });
  });

  describe('disconnect()', () => {
    it('should call end() on socket and close ws', async () => {
      const { disconnect } = await import('../../../src/sender/wa-client.js');
      const sock = createMockSocket();
      await disconnect(sock);

      expect(mockEnd).toHaveBeenCalled();
      expect(mockWsClose).toHaveBeenCalled();
    });

    it('should log info on disconnect', async () => {
      const { disconnect } = await import('../../../src/sender/wa-client.js');
      const { logger } = await import('../../../src/utils/logger.js');
      const sock = createMockSocket();
      await disconnect(sock);

      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('[wa] disconnect'));
    });

    it('should not throw when socket is null', async () => {
      const { disconnect } = await import('../../../src/sender/wa-client.js');
      await expect(disconnect(null)).resolves.not.toThrow();
    });
  });

  describe('getSocket()', () => {
    it('should return active socket if initialized', async () => {
      const { startBot, getSocket } = await import('../../../src/sender/wa-client.js');
      await startBot();
      const sock = getSocket();
      expect(sock).toBe(mockSocket);
    });

    it('should throw error if not initialized', async () => {
      const { getSocket } = await import('../../../src/sender/wa-client.js');
      expect(() => getSocket()).toThrow('WA client not initialized');
    });
  });
});
