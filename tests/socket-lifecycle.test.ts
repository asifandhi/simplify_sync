import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, Server as HTTPServer } from 'node:http';
import { io as ClientIO, Socket as ClientSocket } from 'socket.io-client';
import {
  initSocket,
  disconnectDeviceSockets,
  resetIOForTesting,
  isDeviceOnline,
} from '../src/lib/socket';
import {
  connectDB,
  insertDevice,
  deleteDevice,
  insertPendingAction,
  getPendingActions,
  markActionApplied,
  isDeviceRegistered,
} from '../src/db/sqlite';

describe('Phase 2 Batch 2: W11-W13 Socket Lifecycle & Security', () => {
  let server: HTTPServer;
  let port: number;
  const DEVICE_A = {
    device_id: 'test-device-lifecycle-a',
    device_name: 'Device Alpha',
    session_token: 'token-lifecycle-a-1111',
  };
  const DEVICE_B = {
    device_id: 'test-device-lifecycle-b',
    device_name: 'Device Beta',
    session_token: 'token-lifecycle-b-2222',
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

    server = createServer();
    initSocket(server);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    port = (server.address() as any).port;
  });

  after(async () => {
    try { deleteDevice(DEVICE_A.device_id); } catch {}
    try { deleteDevice(DEVICE_B.device_id); } catch {}
    resetIOForTesting();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  // ── W11: Socket Revocation & Force Disconnect ────────────────────────────
  describe('W11: Session Revocation & Socket Teardown', () => {
    it('actively force-disconnects active socket on device revocation', async () => {
      const mobile = await connectMobile(DEVICE_A.session_token);
      assert.equal(mobile.connected, true);
      assert.equal(isDeviceOnline(DEVICE_A.device_id), true);

      // Listen for client disconnect
      const disconnectPromise = new Promise<string>((resolve) => {
        mobile.on('disconnect', (reason) => resolve(reason));
      });

      // Server-side revocation triggers force disconnect
      disconnectDeviceSockets(DEVICE_A.device_id);

      const reason = await disconnectPromise;
      assert.ok(reason, 'Socket must receive disconnect event');
      assert.equal(mobile.connected, false);
      assert.equal(isDeviceOnline(DEVICE_A.device_id), false);
    });

    it('re-pairing the same device ID does not retain old disconnected sockets in room', async () => {
      // Re-insert device A with a fresh token
      deleteDevice(DEVICE_A.device_id);
      const freshToken = 'token-lifecycle-a-fresh-9999';
      insertDevice({
        device_id: DEVICE_A.device_id,
        device_name: 'Device Alpha Re-paired',
        session_token: freshToken,
      });

      // Old socket was already disconnected. Connect new socket with fresh token
      const mobile2 = await connectMobile(freshToken);
      assert.equal(mobile2.connected, true);

      // Web client registers for device A room
      const web = await connectWeb();
      web.emit('register', DEVICE_A.device_id);
      await new Promise((r) => setTimeout(r, 50));

      // Send message to device A room
      const receivedByMobile2 = new Promise<any>((resolve) => {
        mobile2.on('receive_message', (msg) => resolve(msg));
      });

      web.emit(
        'send_message',
        {
          device_id: DEVICE_A.device_id,
          content: 'Hello re-paired device',
          content_type: 'text',
        }
      );

      const msg = await receivedByMobile2;
      assert.equal(msg.content, 'Hello re-paired device');

      mobile2.close();
      web.close();
      disconnectDeviceSockets(DEVICE_A.device_id);
    });

    it('isDeviceRegistered accurately reflects database existence', () => {
      assert.equal(isDeviceRegistered(DEVICE_B.device_id), true);
      assert.equal(isDeviceRegistered('non-existent-device-xyz'), false);
      assert.equal(isDeviceRegistered(''), false);
    });
  });

  // ── W12: Scoped Clear-Action Ack ─────────────────────────────────────────
  describe('W12: Scoped Clear-Action Acknowledgments', () => {
    it('device A cannot acknowledge or suppress a pending action queued for device B', async () => {
      // Ensure devices are inserted cleanly with expected tokens
      try { deleteDevice(DEVICE_A.device_id); } catch {}
      try { deleteDevice(DEVICE_B.device_id); } catch {}
      insertDevice(DEVICE_A);
      insertDevice(DEVICE_B);

      // Queue an action for Device B
      const insertRes = insertPendingAction(DEVICE_B.device_id, 'clear_chat', 'all');
      const actionId = Number(insertRes.lastInsertRowid);
      assert.ok(actionId > 0);

      // Verify Device B has 1 pending action
      const pendingBefore = getPendingActions(DEVICE_B.device_id);
      assert.ok(pendingBefore.some((a) => a.id === actionId && a.applied === 0));

      // Device A connects
      const mobileA = await connectMobile(DEVICE_A.session_token);

      // Device A attempts to acknowledge Device B's action
      mobileA.emit('clear_chat_ack', {
        device_id: DEVICE_B.device_id,
        action_id: actionId,
      });
      await new Promise((r) => setTimeout(r, 100));

      // Verify Device B's action was NOT marked applied
      const pendingAfter = getPendingActions(DEVICE_B.device_id);
      assert.ok(
        pendingAfter.some((a) => a.id === actionId && a.applied === 0),
        'Device B action must NOT be marked applied by Device A'
      );

      // Device B connects and acknowledges its own action
      const mobileB = await connectMobile(DEVICE_B.session_token);
      mobileB.emit('clear_chat_ack', {
        device_id: DEVICE_B.device_id,
        action_id: actionId,
      });
      await new Promise((r) => setTimeout(r, 100));

      // Verify Device B's action is now applied
      const pendingFinal = getPendingActions(DEVICE_B.device_id);
      assert.ok(
        !pendingFinal.some((a) => a.id === actionId),
        'Device B action must be marked applied after genuine acknowledgment'
      );

      mobileA.close();
      mobileB.close();
    });

    it('rejects clear_chat_ack from web client or with non-positive integer action_id', async () => {
      const insertRes = insertPendingAction(DEVICE_B.device_id, 'clear_chat', 'all');
      const actionId = Number(insertRes.lastInsertRowid);

      // Web client tries to ack
      const web = await connectWeb();
      web.emit('clear_chat_ack', { device_id: DEVICE_B.device_id, action_id: actionId });
      await new Promise((r) => setTimeout(r, 50));

      const pendingAfterWeb = getPendingActions(DEVICE_B.device_id);
      assert.ok(pendingAfterWeb.some((a) => a.id === actionId && a.applied === 0));

      // Mobile B tries invalid action IDs
      const mobileB = await connectMobile(DEVICE_B.session_token);
      for (const badId of [-1, 0, 1.5, NaN, 'abc', null, undefined]) {
        mobileB.emit('clear_chat_ack', { device_id: DEVICE_B.device_id, action_id: badId });
      }
      await new Promise((r) => setTimeout(r, 50));

      const pendingAfterBad = getPendingActions(DEVICE_B.device_id);
      assert.ok(pendingAfterBad.some((a) => a.id === actionId && a.applied === 0));

      // Cleanup
      markActionApplied(actionId, DEVICE_B.device_id);
      web.close();
      mobileB.close();
    });
  });

  // ── W13: Runtime Payload Validation & Crash Prevention ───────────────────
  describe('W13: Runtime Payload Validation & Crash Prevention', () => {
    it('survives null and malformed payloads on chat_state without throwing', async () => {
      const mobile = await connectMobile(DEVICE_B.session_token);
      for (const badPayload of [null, undefined, 123, 'yes', {}, { is_open: 'true' }, { is_open: null }]) {
        mobile.emit('chat_state', badPayload);
      }
      await new Promise((r) => setTimeout(r, 50));
      assert.equal(mobile.connected, true, 'Server process must stay alive');
      mobile.close();
    });

    it('survives malformed register payloads without throwing', async () => {
      const web = await connectWeb();
      for (const badDevice of [null, undefined, 123, '', '   ', 'a'.repeat(100), '../traversal', {}]) {
        web.emit('register', badDevice);
      }
      await new Promise((r) => setTimeout(r, 50));
      assert.equal(web.connected, true, 'Server process must stay alive');
      web.close();
    });

    it('survives malformed send_message payloads and returns error via callback', async () => {
      const web = await connectWeb();
      web.emit('register', DEVICE_B.device_id);
      await new Promise((r) => setTimeout(r, 50));

      // Malformed: null payload
      const resNull = await new Promise<any>((resolve) => {
        web.emit('send_message', null, (res: any) => resolve(res));
      });
      assert.equal(resNull.error !== undefined, true);

      // Malformed: wrong types
      const resTypes = await new Promise<any>((resolve) => {
        web.emit(
          'send_message',
          { device_id: DEVICE_B.device_id, content: 12345, content_type: 'invalid_type' },
          (res: any) => resolve(res)
        );
      });
      assert.equal(resTypes.error !== undefined, true);

      // Malformed: traversal path
      const resPath = await new Promise<any>((resolve) => {
        web.emit(
          'send_message',
          { device_id: DEVICE_B.device_id, content: 'test', file_path: '../../traversal.txt' },
          (res: any) => resolve(res)
        );
      });
      assert.equal(resPath.error !== undefined, true);

      assert.equal(web.connected, true, 'Server must remain connected and functional');
      web.close();
    });

    it('survives malformed mark_delivered payloads without throwing', async () => {
      const mobile = await connectMobile(DEVICE_B.session_token);
      for (const badPayload of [
        null,
        undefined,
        123,
        {},
        { message_ids: null },
        { message_ids: [] },
        { message_ids: [-5] },
        { message_ids: ['abc'] },
        { message_ids: [1.5] },
        { message_ids: [NaN] },
        { message_ids: new Array(1000).fill(1) },
      ]) {
        mobile.emit('mark_delivered', badPayload);
      }
      await new Promise((r) => setTimeout(r, 50));
      assert.equal(mobile.connected, true, 'Server process must stay alive');
      mobile.close();
    });

    it('survives malformed delete_messages payloads without throwing', async () => {
      const web = await connectWeb();
      web.emit('register', DEVICE_B.device_id);
      await new Promise((r) => setTimeout(r, 50));

      for (const badPayload of [
        null,
        undefined,
        123,
        {},
        { device_id: DEVICE_B.device_id, message_ids: 'not_all' },
        { device_id: DEVICE_B.device_id, message_ids: [-1] },
        { device_id: DEVICE_B.device_id, message_ids: ['foo'] },
        { device_id: DEVICE_B.device_id, message_ids: [] },
      ]) {
        web.emit('delete_messages', badPayload);
      }
      await new Promise((r) => setTimeout(r, 50));
      assert.equal(web.connected, true, 'Server process must stay alive');
      web.close();
    });
  });
});
