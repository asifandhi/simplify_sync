import test, { describe, it, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { createServer, Server as HTTPServer } from 'node:http';
import { io as ClientIO, Socket as ClientSocket } from 'socket.io-client';
import { NextRequest } from 'next/server';
import Database from 'better-sqlite3';

import { isValidUploadFilename, getSafeUploadPath, safeUnlinkUpload } from '../src/lib/pathSafety';
import {
  connectDB,
  insertDevice,
  deleteDevice,
  insertChatMessage,
  getChatByDeviceId,
} from '../src/db/sqlite';
import { initSocket } from '../src/lib/socket';
import { POST as postChat } from '../src/app/api/chat/route';

describe('W05: Path Traversal & Unsafe Deletion Prevention', () => {
  const uploadsDir = path.join(process.cwd(), 'uploads');
  const dbPath = path.join(process.cwd(), 'database', 'Simplify-Sync.db');

  before(() => {
    connectDB();
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }
  });

  // ══════════════════════════════════════════════════════════════════════════
  // Case 1: Rejection of traversal paths in chat messages
  // ══════════════════════════════════════════════════════════════════════════
  describe('Case 1: Rejection of traversal paths in chat messages', () => {
    let server: HTTPServer;
    let ioServer: any;
    let serverPort: number;
    const socketDeviceId = 'test-device-w05-socket-traversal';
    const socketSessionToken = 'tok-w05-socket-traversal-session-1234';

    before(async () => {
      deleteDevice(socketDeviceId);
      insertDevice({
        device_id: socketDeviceId,
        device_name: 'Socket Traversal Test Device',
        session_token: socketSessionToken,
      });

      server = createServer();
      ioServer = initSocket(server);
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
      const addr = server.address() as any;
      serverPort = addr.port;
    });

    after(() => {
      if (ioServer) ioServer.close();
      if (server) server.close();
      deleteDevice(socketDeviceId);
    });

    it('Socket SEND_MESSAGE with file_path: "../package.json" -> rejected, error callback fired, message NOT stored in DB', async () => {
      const client = ClientIO(`http://127.0.0.1:${serverPort}`, {
        transports: ['polling'],
        extraHeaders: {
          host: `127.0.0.1:${serverPort}`,
          referer: `http://127.0.0.1:${serverPort}/`,
        },
      });

      await new Promise<void>((resolve, reject) => {
        client.on('connect', () => resolve());
        client.on('connect_error', (e) => reject(e));
      });

      client.emit('register', socketDeviceId);
      await new Promise((r) => setTimeout(r, 80));

      const traversalPath = '../package.json';
      const ack = await new Promise<any>((resolve) => {
        client.emit(
          'send_message',
          {
            device_id: socketDeviceId,
            content: 'Attempted socket traversal',
            content_type: 'file',
            file_path: traversalPath,
          },
          (res: any) => resolve(res)
        );
      });

      // Verify rejection error callback
      assert.ok(ack, 'Callback must be called with response');
      assert.ok(ack.error, 'Callback must return an error property');
      assert.match(ack.error, /Invalid file_path/i);

      // Verify message NOT stored in DB
      const db = new Database(dbPath);
      const row = db
        .prepare('SELECT * FROM chat_history WHERE device_id = ? AND file_path = ?')
        .get(socketDeviceId, traversalPath);
      assert.equal(row, undefined, 'Traversal message must NOT be stored in DB');
      db.close();

      client.close();
    });

    it('Socket SEND_MESSAGE rejects backslash traversals, absolute paths, and null bytes without DB storage', async () => {
      const client = ClientIO(`http://127.0.0.1:${serverPort}`, {
        transports: ['polling'],
        auth: { session_token: socketSessionToken },
      });

      await new Promise<void>((resolve, reject) => {
        client.on('connect', () => resolve());
        client.on('connect_error', (e) => reject(e));
      });

      const attackPayloads = [
        '..\\package.json',
        '..\\..\\something',
        'C:\\Windows\\System32\\cmd.exe',
        '/etc/passwd',
        'test\0file.png',
        'sub/folder/file.png',
        'sub\\folder\\file.png',
      ];

      const db = new Database(dbPath);

      for (const attackPath of attackPayloads) {
        const ack = await new Promise<any>((resolve) => {
          client.emit(
            'send_message',
            {
              device_id: socketDeviceId,
              content: `Attack: ${attackPath}`,
              content_type: 'file',
              file_path: attackPath,
            },
            (res: any) => resolve(res)
          );
        });

        assert.ok(ack && ack.error, `Must reject attack payload: ${attackPath}`);
        assert.match(ack.error, /Invalid file_path/i);

        const row = db
          .prepare('SELECT * FROM chat_history WHERE device_id = ? AND file_path = ?')
          .get(socketDeviceId, attackPath);
        assert.equal(row, undefined, `Attack payload ${attackPath} must NOT be stored in DB`);
      }

      db.close();
      client.close();
    });

    it('POST /api/chat with file_path: "../../package.json" -> rejected with 400', async () => {
      const attackPath = '../../package.json';
      const req = new NextRequest('http://127.0.0.1:3000/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          device_id: socketDeviceId,
          content_type: 'file',
          content: 'HTTP traversal attempt',
          file_path: attackPath,
        }),
      });

      const res = await postChat(req);
      assert.equal(res.status, 400, 'Must return 400 Bad Request');
      const body = await res.json();
      assert.match(body.error || body.message, /Invalid file_path/i);

      // Verify NOT stored in DB
      const db = new Database(dbPath);
      const row = db
        .prepare('SELECT * FROM chat_history WHERE device_id = ? AND file_path = ?')
        .get(socketDeviceId, attackPath);
      assert.equal(row, undefined, 'Path traversal must not be saved to DB via HTTP route');
      db.close();
    });

    it('POST /api/chat rejects backslash traversals, absolute paths, and null bytes with 400', async () => {
      const attackPaths = [
        '..\\..\\something',
        '..\\something.txt',
        'C:\\Windows\\win.ini',
        '/etc/passwd',
        'image\0evil.jpg',
        'uploads/image.png',
        'uploads\\image.png',
      ];

      const db = new Database(dbPath);

      for (const attackPath of attackPaths) {
        const req = new NextRequest('http://127.0.0.1:3000/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            device_id: socketDeviceId,
            content_type: 'file',
            file_path: attackPath,
          }),
        });

        const res = await postChat(req);
        assert.equal(res.status, 400, `Must reject ${attackPath} with 400`);
        const body = await res.json();
        assert.match(body.error || body.message, /Invalid file_path/i);

        const row = db
          .prepare('SELECT * FROM chat_history WHERE device_id = ? AND file_path = ?')
          .get(socketDeviceId, attackPath);
        assert.equal(row, undefined, `Attack path ${attackPath} must NOT be stored in DB`);
      }

      db.close();
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // Case 2: Legitimate file upload and cleanup
  // ══════════════════════════════════════════════════════════════════════════
  describe('Case 2: Legitimate file upload and cleanup', () => {
    const legitDeviceId = 'test-device-w05-legit-cleanup';

    beforeEach(() => {
      deleteDevice(legitDeviceId);
      insertDevice({
        device_id: legitDeviceId,
        device_name: 'Legit File Device',
        session_token: 'tok-w05-legit-1234',
      });
    });

    afterEach(() => {
      deleteDevice(legitDeviceId);
    });

    it('creates dummy file in uploads/, references in chat, and deletes on deleteDevice(deviceId)', () => {
      const validFilename = `testfile-${crypto.randomUUID()}.png`;
      const fullDiskPath = path.join(uploadsDir, validFilename);

      // Create dummy file on disk
      fs.writeFileSync(fullDiskPath, 'LEGIT_UPLOAD_CONTENT');
      assert.equal(fs.existsSync(fullDiskPath), true, 'File must exist on disk before deletion');

      // Insert chat message referencing the legitimate file
      const savedMsg = insertChatMessage({
        device_id: legitDeviceId,
        sender: 'me',
        content_type: 'file',
        content: 'Legit upload',
        file_path: validFilename,
        status: 'SENT',
      });
      assert.ok(savedMsg && savedMsg.id, 'Chat message must be inserted');
      assert.equal(savedMsg.file_path, validFilename);

      // Trigger deleteDevice(deviceId)
      deleteDevice(legitDeviceId);

      // Verify the uploaded file is cleanly deleted from disk
      assert.equal(fs.existsSync(fullDiskPath), false, 'Uploaded file must be unlinked from disk');

      // Verify chat history and device are cleaned up in DB
      const messages = getChatByDeviceId(legitDeviceId);
      assert.deepEqual(messages, [], 'Chat messages must be removed from DB');
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // Case 3: Retroactive containment against pre-existing planted database rows
  // ══════════════════════════════════════════════════════════════════════════
  describe('Case 3: Retroactive containment against pre-existing planted database rows', () => {
    const plantedDeviceId = 'test-device-w05-planted-containment';

    beforeEach(() => {
      deleteDevice(plantedDeviceId);
      insertDevice({
        device_id: plantedDeviceId,
        device_name: 'Planted Traversal Device',
        session_token: 'tok-w05-planted-5678',
      });
    });

    afterEach(() => {
      deleteDevice(plantedDeviceId);
    });

    it('planted traversal path (../canary-file.txt) in DB does NOT delete canary file on deleteDevice', () => {
      const canaryFileName = `canary-file-${crypto.randomUUID()}.txt`;
      // Canary file placed in project root (parent of uploads/)
      const canaryFullPath = path.join(process.cwd(), canaryFileName);
      fs.writeFileSync(canaryFullPath, 'CONFIDENTIAL_CANARY_DATA');
      assert.equal(fs.existsSync(canaryFullPath), true, 'Canary file must exist initially');

      try {
        // Directly plant traversal row in SQLite chat_history
        const db = new Database(dbPath);
        db.prepare(
          `INSERT INTO chat_history (device_id, sender, content_type, content, file_path, status)
           VALUES (?, ?, ?, ?, ?, ?)`
        ).run(plantedDeviceId, 'attacker', 'file', 'Planted exploit', `../${canaryFileName}`, 'SENT');
        db.close();

        // Trigger device deletion
        deleteDevice(plantedDeviceId);

        // Crucial check: canary file must STILL exist!
        assert.equal(
          fs.existsSync(canaryFullPath),
          true,
          'Canary file in parent directory MUST NOT be deleted by deleteDevice!'
        );
      } finally {
        // Safe test cleanup
        if (fs.existsSync(canaryFullPath)) {
          fs.unlinkSync(canaryFullPath);
        }
      }
    });

    it('planted backslash traversal (..\\canary-win.txt) in DB does NOT delete canary file on deleteDevice', () => {
      const canaryWinName = `canary-win-${crypto.randomUUID()}.txt`;
      const canaryWinFullPath = path.join(process.cwd(), canaryWinName);
      fs.writeFileSync(canaryWinFullPath, 'CONFIDENTIAL_WIN_CANARY_DATA');
      assert.equal(fs.existsSync(canaryWinFullPath), true, 'Windows canary must exist initially');

      try {
        const db = new Database(dbPath);
        db.prepare(
          `INSERT INTO chat_history (device_id, sender, content_type, content, file_path, status)
           VALUES (?, ?, ?, ?, ?, ?)`
        ).run(plantedDeviceId, 'attacker', 'file', 'Planted backslash exploit', `..\\${canaryWinName}`, 'SENT');
        db.close();

        deleteDevice(plantedDeviceId);

        assert.equal(
          fs.existsSync(canaryWinFullPath),
          true,
          'Windows backslash canary MUST NOT be deleted by deleteDevice!'
        );
      } finally {
        if (fs.existsSync(canaryWinFullPath)) {
          fs.unlinkSync(canaryWinFullPath);
        }
      }
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // Case 4: Multi-file transfer scenario
  // ══════════════════════════════════════════════════════════════════════════
  describe('Case 4: Multi-file transfer scenario', () => {
    const multiDeviceId = 'test-device-w05-multi-transfer';

    beforeEach(() => {
      deleteDevice(multiDeviceId);
      insertDevice({
        device_id: multiDeviceId,
        device_name: 'Multi File Device',
        session_token: 'tok-w05-multi-9999',
      });
    });

    afterEach(() => {
      deleteDevice(multiDeviceId);
    });

    it('mixed message types (text, file, view-once) stay functional and are cleanly unlinked on revocation', () => {
      const file1 = `file1-${crypto.randomUUID()}.jpg`;
      const file2 = `file2-${crypto.randomUUID()}.pdf`;
      const fileViewOnce = `viewonce-${crypto.randomUUID()}.png`;

      const path1 = path.join(uploadsDir, file1);
      const path2 = path.join(uploadsDir, file2);
      const pathViewOnce = path.join(uploadsDir, fileViewOnce);

      fs.writeFileSync(path1, 'IMAGE_DATA_1');
      fs.writeFileSync(path2, 'PDF_DATA_2');
      fs.writeFileSync(pathViewOnce, 'VIEW_ONCE_IMAGE_DATA_3');

      // 1. Text message
      const msgText = insertChatMessage({
        device_id: multiDeviceId,
        sender: 'me',
        content_type: 'text',
        content: 'Hey, sending files!',
      });

      // 2. Standard image file
      const msgFile1 = insertChatMessage({
        device_id: multiDeviceId,
        sender: 'me',
        content_type: 'file',
        content: 'Vacation Photo',
        file_path: file1,
      });

      // 3. Document file
      const msgFile2 = insertChatMessage({
        device_id: multiDeviceId,
        sender: multiDeviceId,
        content_type: 'file',
        content: 'Report Document',
        file_path: file2,
      });

      // 4. View-once file
      const msgViewOnce = insertChatMessage({
        device_id: multiDeviceId,
        sender: 'me',
        content_type: 'file',
        content: 'Secret Photo',
        file_path: fileViewOnce,
        is_view_once: true,
      });

      // Verify all inserted
      assert.ok(msgText?.id);
      assert.ok(msgFile1?.id);
      assert.ok(msgFile2?.id);
      assert.ok(msgViewOnce?.id);

      // Verify messages are retrievable and functional
      const chatHistory = getChatByDeviceId(multiDeviceId);
      assert.equal(chatHistory.length, 4, 'All 4 messages must be present');

      // Verify files exist prior to revocation
      assert.equal(fs.existsSync(path1), true);
      assert.equal(fs.existsSync(path2), true);
      assert.equal(fs.existsSync(pathViewOnce), true);

      // Revoke device
      deleteDevice(multiDeviceId);

      // Verify all files are cleanly removed from disk
      assert.equal(fs.existsSync(path1), false, 'File 1 must be unlinked');
      assert.equal(fs.existsSync(path2), false, 'File 2 must be unlinked');
      assert.equal(fs.existsSync(pathViewOnce), false, 'View-once file must be unlinked');

      // Verify chat history is cleared
      assert.deepEqual(getChatByDeviceId(multiDeviceId), [], 'Chat history must be empty');
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // Case 5: Path safety unit tests
  // ══════════════════════════════════════════════════════════════════════════
  describe('Case 5: Path safety unit tests', () => {
    describe('isValidUploadFilename', () => {
      it('accepts valid opaque filenames', () => {
        assert.equal(isValidUploadFilename('uuid-1234.png'), true);
        assert.equal(isValidUploadFilename('file_name-2026.tar.gz'), true);
        assert.equal(isValidUploadFilename('photo.JPG'), true);
        assert.equal(isValidUploadFilename('a'), true);
        assert.equal(isValidUploadFilename('A'.repeat(255)), true);
      });

      it('rejects traversal tokens (.. , ../ , ..\\ , etc.)', () => {
        assert.equal(isValidUploadFilename('..'), false);
        assert.equal(isValidUploadFilename('.'), false);
        assert.equal(isValidUploadFilename('../'), false);
        assert.equal(isValidUploadFilename('..\\'), false);
        assert.equal(isValidUploadFilename('../foo.txt'), false);
        assert.equal(isValidUploadFilename('..\\foo.txt'), false);
        assert.equal(isValidUploadFilename('../../package.json'), false);
        assert.equal(isValidUploadFilename('..\\..\\package.json'), false);
        assert.equal(isValidUploadFilename('foo/../bar'), false);
        assert.equal(isValidUploadFilename('foo\\..\\bar'), false);
      });

      it('rejects nested directories and path separators', () => {
        assert.equal(isValidUploadFilename('foo/bar'), false);
        assert.equal(isValidUploadFilename('foo/bar.png'), false);
        assert.equal(isValidUploadFilename('foo\\bar'), false);
        assert.equal(isValidUploadFilename('foo\\bar.png'), false);
        assert.equal(isValidUploadFilename('/'), false);
        assert.equal(isValidUploadFilename('\\'), false);
      });

      it('rejects absolute paths and drive letters', () => {
        assert.equal(isValidUploadFilename('/etc/passwd'), false);
        assert.equal(isValidUploadFilename('\\etc\\passwd'), false);
        assert.equal(isValidUploadFilename('C:\\Windows\\System32'), false);
        assert.equal(isValidUploadFilename('C:/Windows/System32'), false);
        assert.equal(isValidUploadFilename('D:file.txt'), false);
      });

      it('rejects empty strings, whitespace, and non-strings', () => {
        assert.equal(isValidUploadFilename(''), false);
        assert.equal(isValidUploadFilename('   '), false);
        assert.equal(isValidUploadFilename('hello world.png'), false);
        assert.equal(isValidUploadFilename(null), false);
        assert.equal(isValidUploadFilename(undefined), false);
        assert.equal(isValidUploadFilename(12345), false);
        assert.equal(isValidUploadFilename({}), false);
        assert.equal(isValidUploadFilename([]), false);
      });

      it('rejects special characters, command injection, and oversized names', () => {
        assert.equal(isValidUploadFilename('file;rm -rf.png'), false);
        assert.equal(isValidUploadFilename('file|calc.png'), false);
        assert.equal(isValidUploadFilename('file`id`.png'), false);
        assert.equal(isValidUploadFilename('file\0bad.png'), false);
        assert.equal(isValidUploadFilename('file<script>.png'), false);
        assert.equal(isValidUploadFilename('A'.repeat(256)), false);
      });
    });

    describe('getSafeUploadPath', () => {
      it('resolves valid filenames strictly within the uploads directory', () => {
        const safe = getSafeUploadPath('my-safe-photo.png', uploadsDir);
        assert.ok(safe);
        assert.equal(safe, path.resolve(uploadsDir, 'my-safe-photo.png'));
        assert.equal(path.dirname(safe!), path.resolve(uploadsDir));
      });

      it('uses default uploads directory if omitted', () => {
        const safe = getSafeUploadPath('my-safe-photo.png');
        assert.ok(safe);
        assert.equal(safe, path.resolve(process.cwd(), 'uploads', 'my-safe-photo.png'));
      });

      it('returns null for any traversal or escaping paths', () => {
        assert.equal(getSafeUploadPath('../package.json', uploadsDir), null);
        assert.equal(getSafeUploadPath('..\\package.json', uploadsDir), null);
        assert.equal(getSafeUploadPath('../../etc/passwd', uploadsDir), null);
        assert.equal(getSafeUploadPath('/etc/passwd', uploadsDir), null);
        assert.equal(getSafeUploadPath('C:\\Windows\\win.ini', uploadsDir), null);
        assert.equal(getSafeUploadPath('foo/bar.png', uploadsDir), null);
        assert.equal(getSafeUploadPath('foo\\bar.png', uploadsDir), null);
        assert.equal(getSafeUploadPath('.', uploadsDir), null);
        assert.equal(getSafeUploadPath('..', uploadsDir), null);
        assert.equal(getSafeUploadPath('', uploadsDir), null);
        assert.equal(getSafeUploadPath('   ', uploadsDir), null);
        assert.equal(getSafeUploadPath(null as any, uploadsDir), null);
      });
    });

    describe('safeUnlinkUpload', () => {
      it('unlinks an existing legitimate file and returns true', () => {
        const validName = `temp-unlink-${crypto.randomUUID()}.txt`;
        const fullPath = path.join(uploadsDir, validName);
        fs.writeFileSync(fullPath, 'TO_BE_UNLINKED');
        assert.equal(fs.existsSync(fullPath), true);

        const result = safeUnlinkUpload(validName, uploadsDir);
        assert.equal(result, true, 'safeUnlinkUpload must return true for valid path');
        assert.equal(fs.existsSync(fullPath), false, 'File must be unlinked');
      });

      it('returns true for a legitimate non-existent file without error', () => {
        const nonExistent = `non-existent-${crypto.randomUUID()}.txt`;
        const result = safeUnlinkUpload(nonExistent, uploadsDir);
        assert.equal(result, true);
      });

      it('blocks traversal attempt and returns false, preserving external file', () => {
        const canaryName = `unit-canary-${crypto.randomUUID()}.txt`;
        const canaryPath = path.join(process.cwd(), canaryName);
        fs.writeFileSync(canaryPath, 'DO_NOT_DELETE');

        try {
          const resultSlash = safeUnlinkUpload(`../${canaryName}`, uploadsDir);
          assert.equal(resultSlash, false, 'Must block ../ traversal and return false');
          assert.equal(fs.existsSync(canaryPath), true, 'Canary file must NOT be deleted');

          const resultBackslash = safeUnlinkUpload(`..\\${canaryName}`, uploadsDir);
          assert.equal(resultBackslash, false, 'Must block ..\\ traversal and return false');
          assert.equal(fs.existsSync(canaryPath), true, 'Canary file must NOT be deleted');
        } finally {
          if (fs.existsSync(canaryPath)) {
            fs.unlinkSync(canaryPath);
          }
        }
      });

      it('blocks absolute paths and invalid inputs', () => {
        assert.equal(safeUnlinkUpload('/etc/passwd', uploadsDir), false);
        assert.equal(safeUnlinkUpload('C:\\Windows\\win.ini', uploadsDir), false);
        assert.equal(safeUnlinkUpload('', uploadsDir), false);
        assert.equal(safeUnlinkUpload(null as any, uploadsDir), false);
      });
    });
  });
});
