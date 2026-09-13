import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { io as ClientIO } from 'socket.io-client';
import { isValidLocalOrigin, isLoopbackAddress } from '../src/lib/localAccess';
import { isSocketAuthorizedForDevice, initSocket } from '../src/lib/socket';
import { connectDB, insertDevice, deleteDevice, deleteMultipleChatMessages } from '../src/db/sqlite';
import Database from 'better-sqlite3';
import path from 'node:path';

describe('W02: Socket Authentication & Privilege Control', () => {
  describe('Origin and Loopback Validation', () => {
    it('(a) legitimate web client with correct Origin is accepted', () => {
      assert.equal(isValidLocalOrigin('http://localhost:3000', 'localhost:3000'), true);
      assert.equal(isValidLocalOrigin('http://127.0.0.1:3000', '127.0.0.1:3000'), true);
      assert.equal(isLoopbackAddress('127.0.0.1'), true);
      assert.equal(isLoopbackAddress('::1'), true);
      assert.equal(isLoopbackAddress('::ffff:127.0.0.1'), true);
    });

    it('(b) socket with no Origin header is rejected by isValidLocalOrigin', () => {
      // Missing origin must return false
      assert.equal(isValidLocalOrigin('', 'localhost:3000'), false);
    });

    it('(b2) referer origin parsing and validation', () => {
      const validReferer = 'http://localhost:3000/chat?device_id=123';
      assert.equal(isValidLocalOrigin(new URL(validReferer).origin, 'localhost:3000'), true);
      const invalidReferer = 'http://evil.com/localhost:3000';
      assert.equal(isValidLocalOrigin(new URL(invalidReferer).origin, 'localhost:3000'), false);
    });

    it('(c) socket with spoofed/substring-matching Host or Origin is rejected', () => {
      // Substring attacks that previously passed `origin.includes(host)`
      assert.equal(isValidLocalOrigin('http://localhost:3000.evil.com', 'localhost:3000'), false);
      assert.equal(isValidLocalOrigin('http://evil.com?localhost:3000', 'localhost:3000'), false);
      assert.equal(isValidLocalOrigin('http://attacker.com/localhost:3000', 'localhost:3000'), false);
      assert.equal(isValidLocalOrigin('http://evil.com', 'localhost:3000'), false);
      assert.equal(isValidLocalOrigin('http://evil.com', 'evil.com'), false); // Host header spoofing
    });

    it('rejects remote LAN IP addresses without session tokens', () => {
      assert.equal(isLoopbackAddress('192.168.1.100'), false);
      assert.equal(isLoopbackAddress('::ffff:192.168.1.100'), false);
      assert.equal(isLoopbackAddress('10.0.0.5'), false);
      assert.equal(isLoopbackAddress('fe80::1'), false);
      assert.equal(isLoopbackAddress(undefined), false);
    });
  });

  describe('Socket Handshake Authorization Logic', () => {
    interface MockHandshake {
      auth?: { session_token?: string };
      headers: Record<string, string | undefined>;
      address?: string;
    }

    interface MockSocket {
      handshake: MockHandshake;
      conn: { remoteAddress?: string };
      request: { socket?: { remoteAddress?: string } };
      data: { role?: string; authenticated?: boolean; device_id?: string };
    }

    // Handshake simulator replicating io.use
    function executeHandshake(
      socket: MockSocket,
      getDeviceFn: (token: string) => { device_id: string } | null
    ): { error?: string } {
      const sessionToken = socket.handshake.auth?.session_token;

      if (!sessionToken) {
        const remoteAddress =
          socket.conn.remoteAddress ||
          socket.handshake.address ||
          socket.request.socket?.remoteAddress;
        const isLocal = isLoopbackAddress(remoteAddress);

        if (!isLocal) {
          return { error: 'Unauthorized: tokenless access restricted to local loopback' };
        }

        const rawHost = socket.handshake.headers.host;
        const host = (Array.isArray(rawHost) ? rawHost[0] : rawHost) || '';
        const rawOrigin = socket.handshake.headers.origin;
        const origin = Array.isArray(rawOrigin) ? rawOrigin[0] : rawOrigin;
        const rawReferer = socket.handshake.headers.referer || socket.handshake.headers.referrer;
        const referer = Array.isArray(rawReferer) ? rawReferer[0] : rawReferer;

        let isValidOrigin = false;
        if (origin) {
          isValidOrigin = isValidLocalOrigin(origin, host);
        } else if (referer) {
          try {
            const refererOrigin = new URL(referer).origin;
            isValidOrigin = isValidLocalOrigin(refererOrigin, host);
          } catch {
            isValidOrigin = false;
          }
        }

        if (!isValidOrigin) {
          return { error: 'Unauthorized: valid local origin required' };
        }

        socket.data.role = 'web';
        socket.data.authenticated = false;
        return {};
      }

      const device = getDeviceFn(sessionToken);
      if (!device) {
        return { error: 'Unauthorized: invalid session token' };
      }

      socket.data.device_id = device.device_id;
      socket.data.role = 'mobile';
      socket.data.authenticated = true;
      return {};
    }

    it('(a) legitimate web client with correct Origin gets web role', () => {
      const socket: MockSocket = {
        handshake: {
          headers: {
            origin: 'http://localhost:3000',
            host: 'localhost:3000',
          },
          address: '127.0.0.1',
        },
        conn: { remoteAddress: '127.0.0.1' },
        request: { socket: { remoteAddress: '127.0.0.1' } },
        data: {},
      };

      const result = executeHandshake(socket, () => null);

      assert.equal(result.error, undefined);
      assert.equal(socket.data.role, 'web');
      assert.equal(socket.data.authenticated, false);
      assert.equal(socket.data.device_id, undefined);
    });

    it('(b) real-world browser connection: loopback peer + host + referer without origin header is accepted with web role', () => {
      const socket: MockSocket = {
        handshake: {
          headers: {
            host: 'localhost:3000',
            referer: 'http://localhost:3000/',
            // origin header omitted by real browsers during same-origin polling
          },
          address: '127.0.0.1',
        },
        conn: { remoteAddress: '127.0.0.1' },
        request: { socket: { remoteAddress: '127.0.0.1' } },
        data: {},
      };

      const result = executeHandshake(socket, () => null);

      assert.equal(result.error, undefined);
      assert.equal(socket.data.role, 'web');
      assert.equal(socket.data.authenticated, false);
      assert.equal(socket.data.device_id, undefined);
    });

    it('rejects socket with neither origin nor referer header', () => {
      const socket: MockSocket = {
        handshake: {
          headers: {
            host: 'localhost:3000',
            // origin and referer omitted
          },
          address: '127.0.0.1',
        },
        conn: { remoteAddress: '127.0.0.1' },
        request: { socket: { remoteAddress: '127.0.0.1' } },
        data: {},
      };

      const result = executeHandshake(socket, () => null);

      assert.match(result.error || '', /valid local origin required/);
      assert.equal(socket.data.role, undefined);
    });

    it('rejects remote client with referer: http://localhost:3000/ from non-loopback IP', () => {
      const socket: MockSocket = {
        handshake: {
          headers: {
            host: 'localhost:3000',
            referer: 'http://localhost:3000/',
          },
          address: '192.168.1.188',
        },
        conn: { remoteAddress: '192.168.1.188' },
        request: { socket: { remoteAddress: '192.168.1.188' } },
        data: {},
      };

      const result = executeHandshake(socket, () => null);

      assert.match(result.error || '', /tokenless access restricted to local loopback/);
      assert.equal(socket.data.role, undefined);
    });

    it('rejects malicious referer (e.g. http://evil.com/localhost:3000)', () => {
      const socket: MockSocket = {
        handshake: {
          headers: {
            host: 'localhost:3000',
            referer: 'http://evil.com/localhost:3000',
          },
          address: '127.0.0.1',
        },
        conn: { remoteAddress: '127.0.0.1' },
        request: { socket: { remoteAddress: '127.0.0.1' } },
        data: {},
      };

      const result = executeHandshake(socket, () => null);

      assert.match(result.error || '', /valid local origin required/);
      assert.equal(socket.data.role, undefined);
    });

    it('(c) socket with spoofed/substring-matching Host is rejected', () => {
      const socket: MockSocket = {
        handshake: {
          headers: {
            origin: 'http://localhost:3000.evil.com',
            host: 'localhost:3000',
          },
          address: '127.0.0.1',
        },
        conn: { remoteAddress: '127.0.0.1' },
        request: { socket: { remoteAddress: '127.0.0.1' } },
        data: {},
      };

      const result = executeHandshake(socket, () => null);

      assert.match(result.error || '', /valid local origin required/);
      assert.equal(socket.data.role, undefined);
    });

    it('(d) legitimate mobile client gets mobile role', () => {
      const socket: MockSocket = {
        handshake: {
          auth: { session_token: 'valid-mobile-token-123' },
          headers: {},
          address: '192.168.1.55', // Connected over LAN
        },
        conn: { remoteAddress: '192.168.1.55' },
        request: { socket: { remoteAddress: '192.168.1.55' } },
        data: {},
      };

      const result = executeHandshake(socket, (token) => {
        if (token === 'valid-mobile-token-123') {
          return { device_id: 'android-abc-123' };
        }
        return null;
      });

      assert.equal(result.error, undefined);
      assert.equal(socket.data.role, 'mobile');
      assert.equal(socket.data.authenticated, true);
      assert.equal(socket.data.device_id, 'android-abc-123');
    });

    it('rejects mobile client with invalid session token', () => {
      const socket: MockSocket = {
        handshake: {
          auth: { session_token: 'invalid-token' },
          headers: {},
          address: '192.168.1.55',
        },
        conn: { remoteAddress: '192.168.1.55' },
        request: { socket: { remoteAddress: '192.168.1.55' } },
        data: {},
      };

      const result = executeHandshake(socket, () => null);

      assert.match(result.error || '', /invalid session token/);
      assert.equal(socket.data.role, undefined);
    });

    it('rejects unpaired LAN socket attempting to connect without token (even with fake origin)', () => {
      const socket: MockSocket = {
        handshake: {
          headers: {
            origin: 'http://localhost:3000',
            host: 'localhost:3000',
          },
          address: '192.168.1.188',
        },
        conn: { remoteAddress: '192.168.1.188' },
        request: { socket: { remoteAddress: '192.168.1.188' } },
        data: {},
      };

      const result = executeHandshake(socket, () => null);

      assert.match(result.error || '', /tokenless access restricted to local loopback/);
      assert.equal(socket.data.role, undefined);
    });
  });

  describe('Centralized Per-Event Device Authorization (isSocketAuthorizedForDevice)', () => {
    it('authorizes web client that has registered and joined the device room', () => {
      const webSocket = {
        data: { role: 'web', authenticated: false },
        rooms: new Set<string>(['socket-id-1', 'android-device-100']),
      };

      assert.equal(isSocketAuthorizedForDevice(webSocket, 'android-device-100'), true);
    });

    it('rejects web client attempting actions on a device room it has NOT joined', () => {
      const webSocket = {
        data: { role: 'web', authenticated: false },
        rooms: new Set<string>(['socket-id-1', 'android-device-100']),
      };

      // Not in room for android-device-999
      assert.equal(isSocketAuthorizedForDevice(webSocket, 'android-device-999'), false);
    });

    it('authorizes mobile client for its own authenticated device_id', () => {
      const mobileSocket = {
        data: { role: 'mobile', authenticated: true, device_id: 'android-my-device' },
        rooms: new Set<string>(['socket-id-2', 'android-my-device']),
      };

      assert.equal(isSocketAuthorizedForDevice(mobileSocket, 'android-my-device'), true);
    });

    it('rejects mobile client attempting actions for another device_id', () => {
      const mobileSocket = {
        data: { role: 'mobile', authenticated: true, device_id: 'android-my-device' },
        rooms: new Set<string>(['socket-id-2', 'android-my-device']),
      };

      // Mobile device cannot impersonate or fetch messages for another device
      assert.equal(isSocketAuthorizedForDevice(mobileSocket, 'android-victim-device'), false);
    });

    it('rejects unauthenticated or unauthorized socket roles', () => {
      const anonSocket = {
        data: { role: undefined, authenticated: false },
        rooms: new Set<string>(['socket-id-3']),
      };

      assert.equal(isSocketAuthorizedForDevice(anonSocket, 'android-device-100'), false);
    });

    it('rejects invalid or empty target device_ids', () => {
      const webSocket = {
        data: { role: 'web', authenticated: false },
        rooms: new Set<string>(['socket-id-1', 'android-device-100']),
      };

      assert.equal(isSocketAuthorizedForDevice(webSocket, undefined), false);
      assert.equal(isSocketAuthorizedForDevice(webSocket, ''), false);
    });
  });

  describe('Message Send -> Delivery Ack Path (Live E2E)', () => {
    it('sends message from web, delivers to mobile, receives delivery ack, and updates DB status to DELIVERED', async () => {
      connectDB();
      const dbPath = path.join(process.cwd(), 'database', 'Simplify-Sync.db');
      const db = new Database(dbPath);

      const testDeviceId = 'device-test-e2e-delivery-ack';
      const testSessionToken = 'session-token-test-e2e-delivery-ack';

      // Setup test device
      deleteDevice(testDeviceId);
      insertDevice({
        device_id: testDeviceId,
        device_name: 'Test Device E2E Ack',
        session_token: testSessionToken,
      });

      const server = createServer();
      const ioServer = initSocket(server);

      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
      const address = server.address() as any;
      const port = address.port;

      // 1. Web client connects simulating real browser same-origin polling (no origin header, host + referer)
      const webClient = ClientIO(`http://127.0.0.1:${port}`, {
        transports: ['polling'],
        extraHeaders: {
          host: `127.0.0.1:${port}`,
          referer: `http://127.0.0.1:${port}/`,
        },
      });

      await new Promise<void>((resolve, reject) => {
        webClient.on('connect', () => resolve());
        webClient.on('connect_error', (e) => reject(e));
      });

      // 2. Web client registers for device
      webClient.emit('register', testDeviceId);
      await new Promise((r) => setTimeout(r, 100));

      // 3. Mobile client connects with valid session token
      const mobileClient = ClientIO(`http://127.0.0.1:${port}`, {
        transports: ['polling'],
        auth: { session_token: testSessionToken },
      });

      await new Promise<void>((resolve, reject) => {
        mobileClient.on('connect', () => resolve());
        mobileClient.on('connect_error', (e) => reject(e));
      });

      // 4. Set up mobile listener for receive_message
      let savedMessageId: number | null = null;
      const receivePromise = new Promise<any>((resolve) => {
        mobileClient.on('receive_message', (msg: any) => {
          resolve(msg);
        });
      });

      // 5. Set up web listener for messages_delivered
      const deliveredPromise = new Promise<any>((resolve) => {
        webClient.on('messages_delivered', (data: any) => {
          resolve(data);
        });
      });

      // 6. Web client sends message via send_message
      const ack = await new Promise<any>((resolve) => {
        webClient.emit(
          'send_message',
          {
            device_id: testDeviceId,
            content: 'Live test message for delivery ack',
            content_type: 'text',
            sender: 'me',
          },
          (res: any) => resolve(res)
        );
      });

      assert.ok(ack.id, 'Ack must have an id');
      assert.equal(ack.status, 'SENT', 'Initial status must be SENT');
      savedMessageId = ack.id;

      // Wait for mobile to receive message
      const receivedMsg = await receivePromise;
      assert.equal(receivedMsg.id, savedMessageId);

      // 7. Mobile client acknowledges delivery
      mobileClient.emit('mark_delivered', {
        device_id: testDeviceId,
        message_ids: [savedMessageId],
      });

      // 8. Web client receives messages_delivered event
      const deliveredData = await deliveredPromise;
      assert.equal(deliveredData.device_id, testDeviceId);
      assert.deepEqual(deliveredData.message_ids, [savedMessageId]);

      // 9. Verify SQLite DB status is now DELIVERED
      const row = db.prepare('SELECT status FROM chat_history WHERE id = ?').get(savedMessageId) as any;
      assert.equal(row.status, 'DELIVERED', 'Database record must be DELIVERED');

      // Clean up
      webClient.close();
      mobileClient.close();
      ioServer.close();
      server.close();
      if (savedMessageId !== null) {
        deleteMultipleChatMessages([savedMessageId], testDeviceId);
      }
      deleteDevice(testDeviceId);
      db.close();
    });
  });
});
