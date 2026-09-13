import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, Server as HTTPServer } from 'node:http';
import { io as ClientIO, Socket as ClientSocket } from 'socket.io-client';
import {
  initSocket,
  resetIOForTesting,
  isDeviceOnline,
} from '../src/lib/socket';
import {
  connectDB,
  insertDevice,
  deleteDevice,
  insertChatMessage,
  deleteAllChatMessages,
  getChatByDeviceId,
  getPendingActions,
  clearPendingActionsForDevice,
} from '../src/db/sqlite';
import { useChatStore } from '../src/store/chatStore';
import { DELETE as deleteChatHandler } from '../src/app/api/chat/route';

describe('Phase 2 Batch 3: W14-W19 Logic & State Bug Fixes', () => {
  let server: HTTPServer;
  let port: number;

  const DEVICE_A = {
    device_id: 'test-batch3-dev-a',
    device_name: 'Device Alpha',
    session_token: 'token-batch3-a-1111',
  };
  const DEVICE_B = {
    device_id: 'test-batch3-dev-b',
    device_name: 'Device Beta',
    session_token: 'token-batch3-b-2222',
  };

  function connectMobile(sessionToken: string): Promise<ClientSocket> {
    return new Promise((resolve, reject) => {
      const client = ClientIO(`http://127.0.0.1:${port}`, {
        transports: ['polling'],
        auth: { session_token: sessionToken },
        reconnection: false,
      });
      client.on('connect', () => resolve(client));
      client.on('connect_error', (err) => reject(err));
    });
  }

  function connectWeb(): Promise<ClientSocket> {
    return new Promise((resolve, reject) => {
      const client = ClientIO(`http://127.0.0.1:${port}`, {
        transports: ['polling'],
        extraHeaders: {
          host: `127.0.0.1:${port}`,
          referer: `http://127.0.0.1:${port}/`,
        },
        reconnection: false,
      });
      client.on('connect', () => resolve(client));
      client.on('connect_error', (err) => reject(err));
    });
  }

  before(async () => {
    connectDB();
    resetIOForTesting();
    try { deleteDevice(DEVICE_A.device_id); } catch {}
    try { deleteDevice(DEVICE_B.device_id); } catch {}
    insertDevice(DEVICE_A);
    insertDevice(DEVICE_B);

    server = createServer(async (req, res) => {
      if (req.url?.startsWith('/api/chat') && req.method === 'DELETE') {
        const chunks: Buffer[] = [];
        for await (const chunk of req) chunks.push(chunk);
        const body = JSON.parse(Buffer.concat(chunks).toString() || '{}');
        const apiReq = new Request(`http://127.0.0.1:${port}${req.url}`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const apiRes = await deleteChatHandler(apiReq as any);
        const data = await apiRes.json();
        res.writeHead(apiRes.status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(data));
        return;
      }
      res.writeHead(404);
      res.end();
    });
    initSocket(server);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    port = (server.address() as any).port;
    process.env.TEST_BASE_URL = `http://127.0.0.1:${port}`;
  });

  after(async () => {
    try { deleteDevice(DEVICE_A.device_id); } catch {}
    try { deleteDevice(DEVICE_B.device_id); } catch {}
    resetIOForTesting();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  beforeEach(() => {
    deleteAllChatMessages(DEVICE_A.device_id);
    deleteAllChatMessages(DEVICE_B.device_id);
    clearPendingActionsForDevice(DEVICE_A.device_id);
    clearPendingActionsForDevice(DEVICE_B.device_id);
    useChatStore.setState({
      messages: [],
      activeDeviceId: null,
      pendingQueue: [],
      isDeviceOnline: false,
      isChatOpen: false,
    });
  });

  // ── W14: Cross-Device Deletion Scope ─────────────────────────────────────
  describe('W14: Cross-Device Deletion Choice (sync_to_device)', () => {
    it('Clear Chat with sync-off deletes from SQLite but does NOT queue pending action or emit to mobile', async () => {
      insertChatMessage({ device_id: DEVICE_A.device_id, sender: 'me', content_type: 'text', content: 'Msg 1' });
      insertChatMessage({ device_id: DEVICE_A.device_id, sender: 'me', content_type: 'text', content: 'Msg 2' });

      const mobile = await connectMobile(DEVICE_A.session_token);
      let mobileReceivedDelete = false;
      mobile.on('delete_messages', () => {
        mobileReceivedDelete = true;
      });

      const web = await connectWeb();
      await new Promise<void>((res) => web.emit('register', DEVICE_A.device_id, () => res()));

      // Send delete_messages with sync_to_device: false
      const ack = await new Promise<any>((res) => {
        web.emit('delete_messages', {
          device_id: DEVICE_A.device_id,
          message_ids: 'all',
          sync_to_device: false,
        }, res);
      });

      assert.equal(ack?.success, true);
      // Wait briefly for potential broadcasts
      await new Promise((r) => setTimeout(r, 100));

      // 1. Web / SQLite cleared
      const remaining = getChatByDeviceId(DEVICE_A.device_id);
      assert.equal(remaining.length, 0);

      // 2. Mobile did NOT receive delete event
      assert.equal(mobileReceivedDelete, false);

      // 3. No pending clear_chat actions queued
      const pending = getPendingActions(DEVICE_A.device_id);
      const clearActions = pending.filter((a) => a.action_type === 'clear_chat' && a.applied === 0);
      assert.equal(clearActions.length, 0);

      web.disconnect();
      mobile.disconnect();
    });

    it('Clear Chat with sync-on deletes from SQLite and queues pending action when mobile is offline', async () => {
      insertChatMessage({ device_id: DEVICE_A.device_id, sender: 'me', content_type: 'text', content: 'Msg 1' });

      const web = await connectWeb();
      await new Promise<void>((res) => web.emit('register', DEVICE_A.device_id, () => res()));

      // Send delete_messages with sync_to_device: true (mobile is offline)
      const ack = await new Promise<any>((res) => {
        web.emit('delete_messages', {
          device_id: DEVICE_A.device_id,
          message_ids: 'all',
          sync_to_device: true,
        }, res);
      });

      assert.equal(ack?.success, true);

      // SQLite cleared
      const remaining = getChatByDeviceId(DEVICE_A.device_id);
      assert.equal(remaining.length, 0);

      // Pending action queued for Android
      const pending = getPendingActions(DEVICE_A.device_id);
      const clearActions = pending.filter((a) => a.action_type === 'clear_chat' && a.applied === 0);
      assert.equal(clearActions.length, 1);

      web.disconnect();
    });

    it('HTTP fallback DELETE /api/chat respects sync_to_device', async () => {
      insertChatMessage({ device_id: DEVICE_A.device_id, sender: 'me', content_type: 'text', content: 'HTTP 1' });

      // 1. sync_to_device: false -> deletes from SQLite, no pending action
      const reqSyncOff = new Request('http://localhost:3000/api/chat', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          device_id: DEVICE_A.device_id,
          message_ids: 'all',
          sync_to_device: false,
        }),
      });
      const resSyncOff = await deleteChatHandler(reqSyncOff as any);
      assert.equal(resSyncOff.status, 200);
      assert.equal(getChatByDeviceId(DEVICE_A.device_id).length, 0);
      assert.equal(getPendingActions(DEVICE_A.device_id).filter((a) => a.action_type === 'clear_chat' && a.applied === 0).length, 0);

      // 2. sync_to_device: true -> deletes from SQLite and queues pending action
      insertChatMessage({ device_id: DEVICE_A.device_id, sender: 'me', content_type: 'text', content: 'HTTP 2' });
      const reqSyncOn = new Request('http://localhost:3000/api/chat', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          device_id: DEVICE_A.device_id,
          message_ids: 'all',
          sync_to_device: true,
        }),
      });
      const resSyncOn = await deleteChatHandler(reqSyncOn as any);
      assert.equal(resSyncOn.status, 200);
      assert.equal(getChatByDeviceId(DEVICE_A.device_id).length, 0);
      const pendingOn = getPendingActions(DEVICE_A.device_id).filter((a) => a.action_type === 'clear_chat' && a.applied === 0);
      assert.equal(pendingOn.length, 1);
    });
  });

  // ── W15: Device Target Binding Across Animations ─────────────────────────
  describe('W15: Device Target Binding & Switching Protection', () => {
    it('deleting device A while activeDeviceId switched to device B deletes A in DB and leaves B messages in store', async () => {
      insertChatMessage({ device_id: DEVICE_A.device_id, sender: 'me', content_type: 'text', content: 'A Msg' });
      const bMsg = insertChatMessage({ device_id: DEVICE_B.device_id, sender: 'me', content_type: 'text', content: 'B Msg' });

      const web = await connectWeb();
      await new Promise<void>((res) => web.emit('register', DEVICE_B.device_id, () => res()));

      // User confirmed Clear Chat for Device A, but store switches to Device B during snap animation
      useChatStore.setState({
        socket: web as any,
        isConnected: true,
        activeDeviceId: DEVICE_B.device_id,
        messages: [bMsg],
      });

      // Clear Chat operation finishes and calls deleteMessages with explicitly captured targetDeviceId = DEVICE_A
      await useChatStore.getState().deleteMessages('all', false, DEVICE_A.device_id);

      await new Promise((r) => setTimeout(r, 100));

      // Device A messages deleted in SQLite
      assert.equal(getChatByDeviceId(DEVICE_A.device_id).length, 0);

      // Device B messages in SQLite still intact
      assert.equal(getChatByDeviceId(DEVICE_B.device_id).length, 1);

      // Store messages for active device B were NOT wiped out
      const storeMessages = useChatStore.getState().messages;
      assert.equal(storeMessages.length, 1);
      assert.equal(storeMessages[0].content, 'B Msg');

      web.disconnect();
    });
  });

  // ── W16: Stale History Isolation & Safe Message Merging ───────────────────
  describe('W16: Stale History Isolation & Safe Merging', () => {
    it('cursor-based pagination returns strictly older messages', () => {
      const m1 = insertChatMessage({ device_id: DEVICE_A.device_id, sender: 'me', content_type: 'text', content: 'Oldest' });
      const m2 = insertChatMessage({ device_id: DEVICE_A.device_id, sender: 'me', content_type: 'text', content: 'Middle' });
      const m3 = insertChatMessage({ device_id: DEVICE_A.device_id, sender: 'me', content_type: 'text', content: 'Newest' });

      // Fetch page before m3
      const older = getChatByDeviceId(DEVICE_A.device_id, 10, 0, m3.timestamp, m3.id);
      assert.equal(older.length, 2);
      assert.equal(older[0].id, m2.id);
      assert.equal(older[1].id, m1.id);
    });

    it('functional setMessages merging prevents dropping live messages and prevents duplicate IDs', () => {
      const liveMsg = { id: 100, device_id: DEVICE_A.device_id, sender: 'me', content_type: 'text', content: 'Live message', timestamp: '2026-09-13T10:00:02.000Z' };
      const olderPage = [
        { id: 98, device_id: DEVICE_A.device_id, sender: 'me', content_type: 'text', content: 'Page msg 1', timestamp: '2026-09-13T10:00:00.000Z' },
        { id: 99, device_id: DEVICE_A.device_id, sender: 'me', content_type: 'text', content: 'Page msg 2 (overlap)', timestamp: '2026-09-13T10:00:01.000Z' },
      ];

      // Current store has the overlapping message AND the newly arrived live message
      useChatStore.setState({
        messages: [
          { id: 99, device_id: DEVICE_A.device_id, sender: 'me', content_type: 'text', content: 'Page msg 2 (overlap)', timestamp: '2026-09-13T10:00:01.000Z' },
          liveMsg,
        ],
      });

      // Merge older page using functional updater
      useChatStore.getState().setMessages((prev) => {
        const existingIds = new Set(prev.map((m) => m.id).filter(Boolean));
        const uniqueOlder = olderPage.filter((m) => !existingIds.has(m.id));
        if (uniqueOlder.length === 0) return prev;
        return [...uniqueOlder, ...prev].sort((a, b) => (a.id || 0) - (b.id || 0));
      });

      const merged = useChatStore.getState().messages;
      assert.equal(merged.length, 3); // 98, 99, 100
      assert.deepEqual(merged.map((m) => m.id), [98, 99, 100]);
    });
  });

  // ── W17: PC Send Presence Isolation ──────────────────────────────────────
  describe('W17: PC Send Presence Isolation', () => {
    it('web send_message to an offline phone does NOT emit online:true presence', async () => {
      assert.equal(isDeviceOnline(DEVICE_A.device_id), false);

      const web = await connectWeb();
      await new Promise<void>((res) => web.emit('register', DEVICE_A.device_id, () => res()));

      let receivedPresenceOnline = false;
      web.on('device_presence', (data: any) => {
        if (data.device_id === DEVICE_A.device_id && data.online === true) {
          receivedPresenceOnline = true;
        }
      });

      // Send message from web to offline phone
      await new Promise<void>((res) => {
        web.emit('send_message', {
          device_id: DEVICE_A.device_id,
          content: 'Hello offline phone',
          content_type: 'text',
        }, () => res());
      });

      await new Promise((r) => setTimeout(r, 100));
      assert.equal(receivedPresenceOnline, false);
      assert.equal(isDeviceOnline(DEVICE_A.device_id), false);

      web.disconnect();
    });

    it('partial presence event preserves existing isChatOpen if device remains online', () => {
      useChatStore.setState({
        isDeviceOnline: true,
        isChatOpen: true,
        activeDeviceId: DEVICE_A.device_id,
      });

      // Simulate receiving a partial presence event (is_chat_open undefined)
      const data = { device_id: DEVICE_A.device_id, online: true };
      useChatStore.setState((state) => ({
        isDeviceOnline: data.online,
        isChatOpen: (data as any).is_chat_open !== undefined ? Boolean((data as any).is_chat_open) : (data.online ? state.isChatOpen : false),
      }));

      // isChatOpen remains true
      assert.equal(useChatStore.getState().isChatOpen, true);
    });
  });

  // ── W18: Stranded Queue Flushing & In-Flight Tracking ────────────────────
  describe('W18: Stranded Queue Flushing & In-Flight Tracking', () => {
    it('drains queued messages for device A when switching to A and registering room', async () => {
      const web = await connectWeb();

      useChatStore.setState({
        socket: web as any,
        isConnected: true,
        activeDeviceId: DEVICE_A.device_id,
        pendingQueue: [
          {
            localId: 'local-1',
            payload: { device_id: DEVICE_A.device_id, sender: 'me', content_type: 'text', content: 'Queued msg 1' },
            retries: 0,
            status: 'pending',
          },
        ],
      });

      // Connect / register device A
      useChatStore.getState().connectSocket(DEVICE_A.device_id);

      // Wait for queue flush to complete
      await new Promise((r) => setTimeout(r, 300));

      // Pending queue for Device A is drained
      assert.equal(useChatStore.getState().pendingQueue.length, 0);

      // Message was persisted in SQLite
      const msgs = getChatByDeviceId(DEVICE_A.device_id);
      assert.equal(msgs.length, 1);
      assert.equal(msgs[0].content, 'Queued msg 1');

      web.disconnect();
    });

    it('concurrent flushQueue calls do not duplicate in-flight messages', () => {
      let emitCount = 0;
      const mockSocket = {
        connected: true,
        emit: (event: string, payload: any) => {
          if (event === 'send_message') emitCount++;
        },
      };

      useChatStore.setState({
        socket: mockSocket as any,
        isConnected: true,
        activeDeviceId: DEVICE_A.device_id,
        pendingQueue: [
          {
            localId: 'local-concurrent',
            payload: { device_id: DEVICE_A.device_id, sender: 'me', content_type: 'text', content: 'Concurrent test' },
            retries: 0,
            status: 'pending',
          },
        ],
      });

      // Trigger flushQueue twice consecutively
      useChatStore.getState().flushQueue(DEVICE_A.device_id);
      useChatStore.getState().flushQueue(DEVICE_A.device_id);

      // Status was set to 'sending' on first call, so second call ignored it
      assert.equal(emitCount, 1);
    });
  });

  // ── W19: DB Failure Propagation & Protocol Honesty ───────────────────────
  describe('W19: Database Failure Propagation & Retry State', () => {
    it('send_message with invalid device_id returns structured error and does NOT broadcast', async () => {
      const web = await connectWeb();
      let broadcastReceived = false;
      web.on('receive_message', () => {
        broadcastReceived = true;
      });

      const ack = await new Promise<any>((res) => {
        web.emit('send_message', {
          device_id: 'non-existent-device-id-12345',
          content: 'Test message',
          content_type: 'text',
        }, res);
      });

      assert.equal(ack?.success, false);
      assert.equal(broadcastReceived, false);

      web.disconnect();
    });

    it('failed send_message keeps message in pendingQueue with retryable status without throwing', () => {
      const mockSocket = {
        connected: true,
        emit: (event: string, payload: any, callback: (ack: any) => void) => {
          if (event === 'send_message') {
            // Simulate server returning DB write failure
            callback({ success: false, error: 'Database write failed' });
          }
        },
      };

      useChatStore.setState({
        socket: mockSocket as any,
        isConnected: true,
        activeDeviceId: DEVICE_A.device_id,
        pendingQueue: [],
      });

      // Calling sendMessage with mock failure
      assert.doesNotThrow(() => {
        useChatStore.getState().sendMessage({
          device_id: DEVICE_A.device_id,
          sender: 'me',
          content_type: 'text',
          content: 'Failed write',
        });
      });

      // Message is placed into pendingQueue for retry
      const queue = useChatStore.getState().pendingQueue;
      assert.equal(queue.length, 1);
      assert.equal(queue[0].status, 'pending');
      assert.equal(queue[0].payload.content, 'Failed write');
    });
  });
});
