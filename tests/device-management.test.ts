import test, { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { GET as getDevices } from '../src/app/api/devices/route';
import { DELETE as deleteDeviceRoute } from '../src/app/api/devices/[id]/route';
import {
  connectDB,
  insertDevice,
  deleteDevice,
  getAllDevices,
  getAllDevicesPublic,
  getDeviceByIdPublic,
  getDeviceBySessionToken,
  updateDeviceProfileImage,
} from '../src/db/sqlite';

// Helper to create mock NextRequest instances
function createGetRequest(url: string, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest(url, {
    method: 'GET',
    headers,
  });
}

function createDeleteRequest(url: string, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest(url, {
    method: 'DELETE',
    headers,
  });
}

describe('W04: Device Management & Token Leakage Prevention', () => {
  const TEST_PHONE_A = {
    device_id: 'test-device-phone-a-w04',
    device_name: 'Google Pixel 8 Pro',
    session_token: 'tok-secret-phone-a-session-key-1111',
  };

  const TEST_PHONE_B = {
    device_id: 'test-device-phone-b-w04',
    device_name: 'Samsung Galaxy S24 Ultra',
    session_token: 'tok-secret-phone-b-session-key-2222',
  };

  const TEST_PHONE_C = {
    device_id: 'test-device-phone-c-w04',
    device_name: 'Apple iPhone 15 Pro Max',
    session_token: 'tok-secret-phone-c-session-key-3333',
  };

  function cleanupTestDevices() {
    try { deleteDevice(TEST_PHONE_A.device_id); } catch {}
    try { deleteDevice(TEST_PHONE_B.device_id); } catch {}
    try { deleteDevice(TEST_PHONE_C.device_id); } catch {}
  }

  beforeEach(() => {
    connectDB();
    cleanupTestDevices();
  });

  afterEach(() => {
    cleanupTestDevices();
  });

  // ── CASE 1: Authenticated Phone A calls GET /api/devices ──────────────────
  describe('Case 1: Authenticated Phone Scoped Device List (GET /api/devices)', () => {
    beforeEach(() => {
      insertDevice(TEST_PHONE_A);
      insertDevice(TEST_PHONE_B);
    });

    it('response ONLY contains Phone A own record and hides Phone B', async () => {
      const req = createGetRequest('http://192.168.1.50:3000/api/devices', {
        'x-device-id': TEST_PHONE_A.device_id,
      });

      const res = await getDevices(req);
      assert.equal(res.status, 200);

      const json = await res.json();
      assert.equal(json.success, true);
      assert.equal(Array.isArray(json.data), true);
      assert.equal(json.data.length, 1);

      const device = json.data[0];
      assert.equal(device.device_id, TEST_PHONE_A.device_id);
      assert.equal(device.device_name, TEST_PHONE_A.device_name);

      // Verify Phone B is strictly NOT visible to Phone A
      const hasPhoneB = json.data.some((d: any) => d.device_id === TEST_PHONE_B.device_id);
      assert.equal(hasPhoneB, false);
    });

    it('response must NOT contain session_token for Phone A own record', async () => {
      const req = createGetRequest('http://192.168.1.50:3000/api/devices', {
        'x-device-id': TEST_PHONE_A.device_id,
      });

      const res = await getDevices(req);
      assert.equal(res.status, 200);

      const json = await res.json();
      const device = json.data[0];

      // Property must not exist on the returned object
      assert.equal('session_token' in device, false);
      assert.equal(Object.prototype.hasOwnProperty.call(device, 'session_token'), false);
      assert.equal(device.session_token, undefined);

      // Complete payload serialization must not contain token key or secret value
      const serialized = JSON.stringify(json);
      assert.equal(serialized.includes('session_token'), false);
      assert.equal(serialized.includes(TEST_PHONE_A.session_token), false);
    });

    it('returns empty array when authenticated device ID is not found in database', async () => {
      const req = createGetRequest('http://192.168.1.50:3000/api/devices', {
        'x-device-id': 'non-existent-device-id-999',
      });

      const res = await getDevices(req);
      assert.equal(res.status, 200);

      const json = await res.json();
      assert.equal(json.success, true);
      assert.deepEqual(json.data, []);
    });

    it('rejects unauthenticated caller with 401 Unauthorized when no role headers present', async () => {
      const req = createGetRequest('http://192.168.1.50:3000/api/devices', {});

      const res = await getDevices(req);
      assert.equal(res.status, 401);

      const json = await res.json();
      assert.equal(json.success, false);
      assert.match(json.error, /Unauthorized/i);
    });
  });

  // ── CASE 2: Phone A calls DELETE /api/devices/[Phone B id] ─────────────────
  describe('Case 2: Cross-Device Revocation Prevention (DELETE /api/devices/[other_id])', () => {
    beforeEach(() => {
      insertDevice(TEST_PHONE_A);
      insertDevice(TEST_PHONE_B);
    });

    it('rejects Phone A attempting to revoke Phone B with 403 Forbidden', async () => {
      const req = createDeleteRequest(`http://192.168.1.50:3000/api/devices/${TEST_PHONE_B.device_id}`, {
        'x-device-id': TEST_PHONE_A.device_id,
      });

      const res = await deleteDeviceRoute(req, {
        params: Promise.resolve({ id: TEST_PHONE_B.device_id }),
      });

      assert.equal(res.status, 403);
      const json = await res.json();
      assert.equal(json.success, false);
      assert.match(json.error, /Forbidden: Cannot revoke other devices/i);
    });

    it('verifies Phone B remains in database and paired after rejection', async () => {
      // Ensure Phone B is in DB
      const beforeB = getDeviceByIdPublic(TEST_PHONE_B.device_id);
      assert.ok(beforeB);

      // Attempt unauthorized delete
      const req = createDeleteRequest(`http://192.168.1.50:3000/api/devices/${TEST_PHONE_B.device_id}`, {
        'x-device-id': TEST_PHONE_A.device_id,
      });
      await deleteDeviceRoute(req, {
        params: Promise.resolve({ id: TEST_PHONE_B.device_id }),
      });

      // Phone B must still exist in DB
      const afterB = getDeviceByIdPublic(TEST_PHONE_B.device_id);
      assert.ok(afterB);
      assert.equal(afterB.device_id, TEST_PHONE_B.device_id);
      assert.equal(afterB.device_name, TEST_PHONE_B.device_name);

      // Phone B session token must still be paired and valid
      const sessionB = getDeviceBySessionToken(TEST_PHONE_B.session_token);
      assert.ok(sessionB);
      assert.equal(sessionB.device_id, TEST_PHONE_B.device_id);
    });

    it('bidirectional enforcement: rejects Phone B attempting to revoke Phone A (403 Forbidden)', async () => {
      const req = createDeleteRequest(`http://192.168.1.50:3000/api/devices/${TEST_PHONE_A.device_id}`, {
        'x-device-id': TEST_PHONE_B.device_id,
      });

      const res = await deleteDeviceRoute(req, {
        params: Promise.resolve({ id: TEST_PHONE_A.device_id }),
      });

      assert.equal(res.status, 403);
      const json = await res.json();
      assert.equal(json.success, false);
      assert.match(json.error, /Forbidden: Cannot revoke other devices/i);

      // Phone A must remain untouched
      const afterA = getDeviceByIdPublic(TEST_PHONE_A.device_id);
      assert.ok(afterA);
      assert.equal(afterA.device_id, TEST_PHONE_A.device_id);
    });

    it('rejects remote caller without x-device-id with 403 Forbidden', async () => {
      const req = createDeleteRequest(`http://192.168.1.50:3000/api/devices/${TEST_PHONE_B.device_id}`, {});

      const res = await deleteDeviceRoute(req, {
        params: Promise.resolve({ id: TEST_PHONE_B.device_id }),
      });

      assert.equal(res.status, 403);
      const json = await res.json();
      assert.equal(json.success, false);
      assert.match(json.error, /Forbidden/i);
    });
  });

  // ── CASE 3: Phone A calls DELETE /api/devices/[own id] ──────────────────────
  describe('Case 3: Phone Self-Revocation (DELETE /api/devices/[own_id])', () => {
    beforeEach(() => {
      insertDevice(TEST_PHONE_A);
      insertDevice(TEST_PHONE_B);
    });

    it('allows Phone A to revoke its own pairing (200 OK)', async () => {
      const req = createDeleteRequest(`http://192.168.1.50:3000/api/devices/${TEST_PHONE_A.device_id}`, {
        'x-device-id': TEST_PHONE_A.device_id,
      });

      const res = await deleteDeviceRoute(req, {
        params: Promise.resolve({ id: TEST_PHONE_A.device_id }),
      });

      assert.equal(res.status, 200);
      const json = await res.json();
      assert.equal(json.success, true);
      assert.match(json.message, /Device revoked successfully/i);
    });

    it('confirms Phone A is completely removed from database after self-revocation', async () => {
      const req = createDeleteRequest(`http://192.168.1.50:3000/api/devices/${TEST_PHONE_A.device_id}`, {
        'x-device-id': TEST_PHONE_A.device_id,
      });

      await deleteDeviceRoute(req, {
        params: Promise.resolve({ id: TEST_PHONE_A.device_id }),
      });

      // Phone A must be gone
      const publicRow = getDeviceByIdPublic(TEST_PHONE_A.device_id);
      assert.equal(publicRow, undefined);

      const sessionRow = getDeviceBySessionToken(TEST_PHONE_A.session_token);
      assert.equal(sessionRow, undefined);
    });

    it('confirms Phone B remains intact and active when Phone A self-revokes', async () => {
      const req = createDeleteRequest(`http://192.168.1.50:3000/api/devices/${TEST_PHONE_A.device_id}`, {
        'x-device-id': TEST_PHONE_A.device_id,
      });

      await deleteDeviceRoute(req, {
        params: Promise.resolve({ id: TEST_PHONE_A.device_id }),
      });

      // Phone B must remain intact
      const phoneB = getDeviceByIdPublic(TEST_PHONE_B.device_id);
      assert.ok(phoneB);
      assert.equal(phoneB.device_id, TEST_PHONE_B.device_id);

      const phoneBSession = getDeviceBySessionToken(TEST_PHONE_B.session_token);
      assert.ok(phoneBSession);
      assert.equal(phoneBSession.session_token, TEST_PHONE_B.session_token);
    });
  });

  // ── CASE 4: Web Role calls GET and DELETE /api/devices ─────────────────────
  describe('Case 4: Web Role Device Management Privileges', () => {
    beforeEach(() => {
      insertDevice(TEST_PHONE_A);
      insertDevice(TEST_PHONE_B);
      insertDevice(TEST_PHONE_C);
    });

    it('web role gets full device list containing all paired devices (Phone A, B, and C)', async () => {
      const req = createGetRequest('http://localhost:3000/api/devices', {
        'x-is-local-client': 'true',
      });

      const res = await getDevices(req);
      assert.equal(res.status, 200);

      const json = await res.json();
      assert.equal(json.success, true);
      assert.equal(Array.isArray(json.data), true);
      assert.ok(json.data.length >= 3);

      const deviceIds = json.data.map((d: any) => d.device_id);
      assert.ok(deviceIds.includes(TEST_PHONE_A.device_id));
      assert.ok(deviceIds.includes(TEST_PHONE_B.device_id));
      assert.ok(deviceIds.includes(TEST_PHONE_C.device_id));
    });

    it('web role device list strictly excludes session_token from all returned devices', async () => {
      const req = createGetRequest('http://localhost:3000/api/devices', {
        'x-is-local-client': 'true',
      });

      const res = await getDevices(req);
      assert.equal(res.status, 200);

      const json = await res.json();
      for (const dev of json.data) {
        assert.equal('session_token' in dev, false, `Device ${dev.device_id} contained session_token!`);
        assert.equal(dev.session_token, undefined);
      }

      const serialized = JSON.stringify(json);
      assert.equal(serialized.includes('session_token'), false);
      assert.equal(serialized.includes(TEST_PHONE_A.session_token), false);
      assert.equal(serialized.includes(TEST_PHONE_B.session_token), false);
      assert.equal(serialized.includes(TEST_PHONE_C.session_token), false);
    });

    it('web role can revoke any device by ID (can revoke Phone A)', async () => {
      const req = createDeleteRequest(`http://localhost:3000/api/devices/${TEST_PHONE_A.device_id}`, {
        'x-is-local-client': 'true',
      });

      const res = await deleteDeviceRoute(req, {
        params: Promise.resolve({ id: TEST_PHONE_A.device_id }),
      });

      assert.equal(res.status, 200);
      const json = await res.json();
      assert.equal(json.success, true);

      // Verify Phone A is gone from DB
      const phoneA = getDeviceByIdPublic(TEST_PHONE_A.device_id);
      assert.equal(phoneA, undefined);
    });

    it('web role can revoke another device by ID (can revoke Phone B)', async () => {
      const req = createDeleteRequest(`http://localhost:3000/api/devices/${TEST_PHONE_B.device_id}`, {
        'x-is-local-client': 'true',
      });

      const res = await deleteDeviceRoute(req, {
        params: Promise.resolve({ id: TEST_PHONE_B.device_id }),
      });

      assert.equal(res.status, 200);
      const json = await res.json();
      assert.equal(json.success, true);

      // Verify Phone B is gone from DB
      const phoneB = getDeviceByIdPublic(TEST_PHONE_B.device_id);
      assert.equal(phoneB, undefined);

      // Phone C must remain
      const phoneC = getDeviceByIdPublic(TEST_PHONE_C.device_id);
      assert.ok(phoneC);
    });
  });

  // ── CASE 5: Public Fields Verification against UI ─────────────────────────
  describe('Case 5: Public Fields Verification against UI Device Interface', () => {
    beforeEach(() => {
      insertDevice(TEST_PHONE_A);
      updateDeviceProfileImage(TEST_PHONE_A.device_id, '/uploads/avatars/phone-a-avatar.png');
    });

    it('returned device object in web role response satisfies all UI Device fields', async () => {
      const req = createGetRequest('http://localhost:3000/api/devices', {
        'x-is-local-client': 'true',
      });

      const res = await getDevices(req);
      assert.equal(res.status, 200);

      const json = await res.json();
      const dev = json.data.find((d: any) => d.device_id === TEST_PHONE_A.device_id);
      assert.ok(dev, 'Phone A should be in response');

      // Check required UI fields (per store/deviceStore.ts Device interface):
      // - device_id: string
      // - device_name: string
      // - last_active: string
      // - is_trusted: number
      // - profile_image: string | undefined
      // - is_online: boolean | undefined
      assert.equal(typeof dev.device_id, 'string');
      assert.equal(dev.device_id, TEST_PHONE_A.device_id);

      assert.equal(typeof dev.device_name, 'string');
      assert.equal(dev.device_name, TEST_PHONE_A.device_name);

      assert.ok(dev.last_active !== null && dev.last_active !== undefined);
      assert.equal(typeof dev.last_active, 'string');

      assert.equal(typeof dev.is_trusted, 'number');

      assert.ok('profile_image' in dev);
      assert.equal(dev.profile_image, '/uploads/avatars/phone-a-avatar.png');

      assert.ok('is_online' in dev);
      assert.equal(typeof dev.is_online, 'boolean');

      // Strict absence of session_token
      assert.equal('session_token' in dev, false);
      assert.equal(dev.session_token, undefined);
    });

    it('returned device object in mobile role response satisfies all UI Device fields', async () => {
      const req = createGetRequest('http://192.168.1.50:3000/api/devices', {
        'x-device-id': TEST_PHONE_A.device_id,
      });

      const res = await getDevices(req);
      assert.equal(res.status, 200);

      const json = await res.json();
      assert.equal(json.data.length, 1);
      const dev = json.data[0];

      assert.equal(dev.device_id, TEST_PHONE_A.device_id);
      assert.equal(dev.device_name, TEST_PHONE_A.device_name);
      assert.equal(typeof dev.last_active, 'string');
      assert.equal(typeof dev.is_trusted, 'number');
      assert.equal(dev.profile_image, '/uploads/avatars/phone-a-avatar.png');
      assert.equal(typeof dev.is_online, 'boolean');

      // Strict absence of session_token
      assert.equal('session_token' in dev, false);
      assert.equal(dev.session_token, undefined);
    });

    it('confirms session_token is completely absent across all reflection checks and raw JSON', async () => {
      const req = createGetRequest('http://localhost:3000/api/devices', {
        'x-is-local-client': 'true',
      });

      const res = await getDevices(req);
      const rawText = await res.text();

      // Zero occurrences of "session_token" in raw JSON body
      assert.equal(rawText.includes('session_token'), false);
      assert.equal(rawText.includes(TEST_PHONE_A.session_token), false);

      const parsed = JSON.parse(rawText);
      const dev = parsed.data.find((d: any) => d.device_id === TEST_PHONE_A.device_id);

      assert.equal(Object.keys(dev).includes('session_token'), false);
      assert.equal(Object.getOwnPropertyNames(dev).includes('session_token'), false);
      assert.equal(Reflect.has(dev, 'session_token'), false);
    });
  });

  // ── CASE 6: Dedicated SQLite Query Verification ───────────────────────────
  describe('Case 6: Dedicated SQLite Query Verification (getAllDevicesPublic & getDeviceByIdPublic)', () => {
    beforeEach(() => {
      insertDevice(TEST_PHONE_A);
      insertDevice(TEST_PHONE_B);
    });

    it('getAllDevicesPublic() returns objects without session_token property', () => {
      const rows = getAllDevicesPublic() as any[];
      assert.ok(rows.length >= 2);

      const phoneARow = rows.find((r) => r.device_id === TEST_PHONE_A.device_id);
      assert.ok(phoneARow);
      assert.equal(phoneARow.device_id, TEST_PHONE_A.device_id);
      assert.equal(phoneARow.device_name, TEST_PHONE_A.device_name);

      // Verify session_token is not in projection
      assert.equal('session_token' in phoneARow, false);
      assert.equal(phoneARow.session_token, undefined);
      assert.equal(Object.keys(phoneARow).includes('session_token'), false);

      // Verify all public schema columns are present
      assert.ok('device_id' in phoneARow);
      assert.ok('device_name' in phoneARow);
      assert.ok('trust_level' in phoneARow);
      assert.ok('last_active' in phoneARow);
      assert.ok('is_trusted' in phoneARow);
      assert.ok('created_at' in phoneARow);
      assert.ok('profile_image' in phoneARow);
    });

    it('getDeviceByIdPublic() returns single device without session_token property', () => {
      const row = getDeviceByIdPublic(TEST_PHONE_A.device_id);
      assert.ok(row);
      assert.equal(row.device_id, TEST_PHONE_A.device_id);
      assert.equal(row.device_name, TEST_PHONE_A.device_name);

      // Verify session_token is omitted
      assert.equal('session_token' in row, false);
      assert.equal(row.session_token, undefined);
      assert.equal(Object.keys(row).includes('session_token'), false);
    });

    it('getDeviceByIdPublic() returns undefined for non-existent device ID', () => {
      const row = getDeviceByIdPublic('non-existent-device-id-12345');
      assert.equal(row, undefined);
    });

    it('contrasts public queries with internal queries that DO contain session_token', () => {
      // Internal query getAllDevices() includes session_token
      const internalRows = getAllDevices() as any[];
      const phoneAInternal = internalRows.find((r) => r.device_id === TEST_PHONE_A.device_id);
      assert.ok(phoneAInternal);
      assert.ok('session_token' in phoneAInternal);
      assert.equal(phoneAInternal.session_token, TEST_PHONE_A.session_token);

      // Internal query getDeviceBySessionToken() includes session_token
      const tokenRow = getDeviceBySessionToken(TEST_PHONE_A.session_token);
      assert.ok(tokenRow);
      assert.equal(tokenRow.device_id, TEST_PHONE_A.device_id);
      assert.equal(tokenRow.session_token, TEST_PHONE_A.session_token);
    });
  });
});
