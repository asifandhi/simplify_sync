import test, { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { GET as getQR } from '../src/app/api/discovery/qr/route';
import { POST as postDiscovery } from '../src/app/api/discovery/route';
import { middleware } from '../middleware';
import { tokenStore } from '../src/lib/discovery/tokenStore';
import { connectDB, getDeviceBySessionToken, deleteDevice, getAllDevices } from '../src/db/sqlite';

function createGetRequest(url: string, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest(url, {
    method: 'GET',
    headers,
  });
}

function createJsonPostRequest(url: string, body: any, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

describe('W03: Discovery & Pairing Authentication & Validation', () => {
  beforeEach(() => {
    connectDB();
    tokenStore.clear();
  });

  afterEach(() => {
    tokenStore.clear();
  });

  // ── CASE 1: Direct GET to discovery/qr/route.ts without local identity ────────
  describe('Case 1: Direct GET to /api/discovery/qr Non-Local Rejection', () => {
    it('rejects direct call from remote LAN caller without x-is-local-client header (401)', async () => {
      const req = createGetRequest('http://192.168.1.100:3000/api/discovery/qr', {
        host: '192.168.1.100:3000',
      });

      const res = await getQR(req);

      assert.equal(res.status, 401);
      const json = await res.json();
      assert.equal(json.success, false);
      assert.match(json.error, /Unauthorized: Local web access required/i);
      // Ensure no token was generated into the store
      assert.equal(tokenStore.isValid('any-token'), false);
    });

    it('rejects direct call with spoofed or invalid x-is-local-client values (401)', async () => {
      const invalidValues = ['false', '0', 'yes', 'null', 'TRUE', '1'];

      for (const val of invalidValues) {
        const req = createGetRequest('http://192.168.1.100:3000/api/discovery/qr', {
          'x-is-local-client': val,
        });

        const res = await getQR(req);
        assert.equal(res.status, 401, `Expected 401 for x-is-local-client: ${val}`);
        const json = await res.json();
        assert.equal(json.success, false);
      }
    });

    it('rejects direct call attempting to spoof x-forwarded-for without x-is-local-client (401)', async () => {
      const req = createGetRequest('http://localhost:3000/api/discovery/qr', {
        'x-forwarded-for': '127.0.0.1',
        host: 'localhost:3000',
      });

      const res = await getQR(req);
      assert.equal(res.status, 401);
      const json = await res.json();
      assert.equal(json.success, false);
      assert.match(json.error, /Unauthorized: Local web access required/i);
    });
  });

  // ── CASE 2: Direct GET to discovery/qr/route.ts with invalid origin ───────────
  describe('Case 2: Direct GET to /api/discovery/qr Origin Validation', () => {
    it('rejects direct call with external untrusted origin http://evil.com (403)', async () => {
      const req = createGetRequest('http://localhost:3000/api/discovery/qr', {
        'x-is-local-client': 'true',
        host: 'localhost:3000',
        origin: 'http://evil.com',
      });

      const res = await getQR(req);
      assert.equal(res.status, 403);
      const json = await res.json();
      assert.equal(json.success, false);
      assert.match(json.error, /Forbidden: Invalid origin/i);
    });

    it('rejects direct call with substring attack origin (403)', async () => {
      const req = createGetRequest('http://localhost:3000/api/discovery/qr', {
        'x-is-local-client': 'true',
        host: 'localhost:3000',
        origin: 'http://localhost:3000.evil.com',
      });

      const res = await getQR(req);
      assert.equal(res.status, 403);
      const json = await res.json();
      assert.equal(json.success, false);
      assert.match(json.error, /Forbidden: Invalid origin/i);
    });

    it('rejects direct call with mismatched port origin (403)', async () => {
      const req = createGetRequest('http://localhost:3000/api/discovery/qr', {
        'x-is-local-client': 'true',
        host: 'localhost:3000',
        origin: 'http://localhost:8080',
      });

      const res = await getQR(req);
      assert.equal(res.status, 403);
      const json = await res.json();
      assert.equal(json.success, false);
      assert.match(json.error, /Forbidden: Invalid origin/i);
    });
  });

  // ── CASE 3: Real local web UI requesting a QR token (200, 60s TTL) ────────────
  describe('Case 3: Genuine Local Web QR Token Issuance (200, 60s TTL)', () => {
    it('accepts genuine local web request via localhost:3000 and issues 60s TTL token', async () => {
      const beforeTime = Date.now();
      const req = createGetRequest('http://localhost:3000/api/discovery/qr', {
        'x-is-local-client': 'true',
        host: 'localhost:3000',
        origin: 'http://localhost:3000',
      });

      const res = await getQR(req);
      assert.equal(res.status, 200);

      const json = await res.json();
      assert.equal(json.success, true);
      assert.equal(json.message, 'QR payload generated');

      const data = json.data;
      assert.ok(data, 'Payload data must be defined');
      assert.match(data.temp_token, /^[0-9a-f]{12}$/i, 'Token must be 12-char hex string (6 bytes)');
      assert.ok(typeof data.ip === 'string' && data.ip.length > 0, 'IP must be non-empty string');
      assert.ok(typeof data.port === 'number', 'Port must be a number');

      // Verify TTL: exactly 60 seconds (with tolerance for execution delta)
      const expectedExpiresAtMin = beforeTime + 58_000;
      const expectedExpiresAtMax = Date.now() + 62_000;
      assert.ok(
        data.expires_at >= expectedExpiresAtMin && data.expires_at <= expectedExpiresAtMax,
        `expires_at (${data.expires_at}) should be approximately +60s from now (range ${expectedExpiresAtMin} - ${expectedExpiresAtMax})`
      );

      // Verify token is active in tokenStore
      assert.equal(tokenStore.isValid(data.temp_token), true);
    });

    it('accepts genuine local web request via 127.0.0.1:3000', async () => {
      const req = createGetRequest('http://127.0.0.1:3000/api/discovery/qr', {
        'x-is-local-client': 'true',
        host: '127.0.0.1:3000',
        origin: 'http://127.0.0.1:3000',
      });

      const res = await getQR(req);
      assert.equal(res.status, 200);
      const json = await res.json();
      assert.equal(json.success, true);
      assert.equal(tokenStore.isValid(json.data.temp_token), true);
    });

    it('accepts genuine local web request when origin header is omitted (same-origin GET)', async () => {
      const req = createGetRequest('http://localhost:3000/api/discovery/qr', {
        'x-is-local-client': 'true',
        host: 'localhost:3000',
      });

      const res = await getQR(req);
      assert.equal(res.status, 200);
      const json = await res.json();
      assert.equal(json.success, true);
      assert.equal(tokenStore.isValid(json.data.temp_token), true);
    });
  });

  // ── CASE 4: Legitimate phone redeeming valid token at discovery/route.ts ──────
  describe('Case 4: Legitimate LAN Phone Token Redemption (200, Session Issued)', () => {
    const testDeviceId = 'test-phone-pixel8-valid';

    afterEach(() => {
      deleteDevice(testDeviceId);
    });

    it('allows legitimate phone to redeem token over LAN without x-is-local-client', async () => {
      deleteDevice(testDeviceId);

      // Pre-seed a valid temporary token in the store
      const tempToken = 'aabbccddeeff';
      tokenStore.setToken(tempToken, 60_000);
      assert.equal(tokenStore.isValid(tempToken), true);

      // Phone submits redemption POST over LAN (no x-is-local-client header)
      const req = createJsonPostRequest('http://192.168.1.50:3000/api/discovery', {
        device_id: testDeviceId,
        device_name: 'Google Pixel 8 Pro',
        temp_token: tempToken,
      }, {
        host: '192.168.1.50:3000',
        'x-forwarded-for': '192.168.1.88',
      });

      const res = await postDiscovery(req);
      assert.equal(res.status, 200);

      const json = await res.json();
      assert.equal(json.success, true);
      assert.equal(json.message, 'Pairing successful');
      assert.equal(json.data.device_id, 'pc-host');
      assert.match(
        json.data.session_token,
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
        'Must issue a valid UUID v4 session token'
      );

      // Verify device was inserted into SQLite
      const registered = getDeviceBySessionToken(json.data.session_token);
      assert.ok(registered, 'Device must be found in DB by session token');
      assert.equal(registered.device_id, testDeviceId);
      assert.equal(registered.device_name, 'Google Pixel 8 Pro');

      // Verify temporary token is consumed and no longer valid
      assert.equal(tokenStore.isValid(tempToken), false);
    });
  });

  // ── CASE 5: Token reuse / replay attack ───────────────────────────────────────
  describe('Case 5: Token Reuse / Replay Attack Prevention (Single-Use Enforced)', () => {
    const testDeviceId1 = 'test-phone-replay-1';
    const testDeviceId2 = 'test-phone-replay-2';

    afterEach(() => {
      deleteDevice(testDeviceId1);
      deleteDevice(testDeviceId2);
    });

    it('rejects replay of already-consumed token on second redemption with 401', async () => {
      deleteDevice(testDeviceId1);
      deleteDevice(testDeviceId2);

      const tempToken = 'reusetoken123';
      tokenStore.setToken(tempToken, 60_000);

      // 1. First redemption: succeeds
      const req1 = createJsonPostRequest('http://192.168.1.50:3000/api/discovery', {
        device_id: testDeviceId1,
        device_name: 'Device First',
        temp_token: tempToken,
      });
      const res1 = await postDiscovery(req1);
      assert.equal(res1.status, 200);

      // 2. Second redemption attempt with identical token: rejected
      const req2 = createJsonPostRequest('http://192.168.1.50:3000/api/discovery', {
        device_id: testDeviceId2,
        device_name: 'Attacker Impersonator',
        temp_token: tempToken,
      });
      const res2 = await postDiscovery(req2);
      assert.equal(res2.status, 401);

      const json2 = await res2.json();
      assert.equal(json2.success, false);
      assert.match(json2.error, /Invalid or expired token/i);

      // Ensure second device was never registered
      const allDevices = getAllDevices() as any[];
      assert.equal(allDevices.some((d) => d.device_id === testDeviceId2), false);
    });

    it('rejects redemption of completely fabricated token with 401', async () => {
      const req = createJsonPostRequest('http://192.168.1.50:3000/api/discovery', {
        device_id: testDeviceId1,
        device_name: 'Device Unknown',
        temp_token: 'completely-bogus-token-never-issued',
      });

      const res = await postDiscovery(req);
      assert.equal(res.status, 401);
      const json = await res.json();
      assert.equal(json.success, false);
      assert.match(json.error, /Invalid or expired token/i);
    });
  });

  // ── CASE 6: Expired token past TTL ────────────────────────────────────────────
  describe('Case 6: Expired Token Rejection Past TTL (401)', () => {
    const testDeviceId = 'test-phone-expired';

    afterEach(() => {
      deleteDevice(testDeviceId);
    });

    it('rejects token past TTL with 401', async () => {
      deleteDevice(testDeviceId);

      // Pre-seed an expired token (negative TTL)
      const tempToken = 'expiredtok123';
      tokenStore.setToken(tempToken, -1000);

      const req = createJsonPostRequest('http://192.168.1.50:3000/api/discovery', {
        device_id: testDeviceId,
        device_name: 'Device Expired',
        temp_token: tempToken,
      });

      const res = await postDiscovery(req);
      assert.equal(res.status, 401);

      const json = await res.json();
      assert.equal(json.success, false);
      assert.match(json.error, /Invalid or expired token/i);

      // Ensure device was not registered
      const allDevices = getAllDevices() as any[];
      assert.equal(allDevices.some((d) => d.device_id === testDeviceId), false);
    });

    it('rejects token after natural expiration elapsed (401)', async () => {
      deleteDevice(testDeviceId);

      // Set short TTL: 20ms
      const tempToken = 'quickexpiretok';
      tokenStore.setToken(tempToken, 20);

      // Wait for expiration
      await new Promise((resolve) => setTimeout(resolve, 35));

      const req = createJsonPostRequest('http://192.168.1.50:3000/api/discovery', {
        device_id: testDeviceId,
        device_name: 'Device Quick Expire',
        temp_token: tempToken,
      });

      const res = await postDiscovery(req);
      assert.equal(res.status, 401);
      const json = await res.json();
      assert.equal(json.success, false);
      assert.match(json.error, /Invalid or expired token/i);
    });
  });

  // ── CASE 7: Malformed / oversized device_id ───────────────────────────────────
  describe('Case 7: Malformed and Oversized device_id Validation (400)', () => {
    const validToken = 'valid-tok-case7';

    beforeEach(() => {
      tokenStore.setToken(validToken, 60_000);
    });

    it('rejects empty string device_id and does NOT consume token (400)', async () => {
      const req = createJsonPostRequest('http://192.168.1.50:3000/api/discovery', {
        device_id: '',
        device_name: 'My Phone',
        temp_token: validToken,
      });

      const res = await postDiscovery(req);
      assert.equal(res.status, 400);
      const json = await res.json();
      assert.equal(json.success, false);
      assert.match(json.error, /Invalid device_id, device_name, or token/i);

      // Token must remain unconsumed
      assert.equal(tokenStore.isValid(validToken), true);
    });

    it('rejects whitespace-only device_id (400)', async () => {
      const req = createJsonPostRequest('http://192.168.1.50:3000/api/discovery', {
        device_id: '     ',
        device_name: 'My Phone',
        temp_token: validToken,
      });

      const res = await postDiscovery(req);
      assert.equal(res.status, 400);
      assert.equal(tokenStore.isValid(validToken), true);
    });

    it('rejects oversized device_id (>64 characters) (400)', async () => {
      const req = createJsonPostRequest('http://192.168.1.50:3000/api/discovery', {
        device_id: 'a'.repeat(65),
        device_name: 'My Phone',
        temp_token: validToken,
      });

      const res = await postDiscovery(req);
      assert.equal(res.status, 400);
      assert.equal(tokenStore.isValid(validToken), true);
    });

    it('rejects malicious characters in device_id (XSS, SQLi, path traversal) (400)', async () => {
      const maliciousIds = [
        'dev<script>alert(1)</script>',
        'dev; DROP TABLE devices;--',
        'dev/../../etc/passwd',
        'dev\\win\\system32',
        'dev with spaces',
        'dev@domain!#$',
      ];

      for (const badId of maliciousIds) {
        const req = createJsonPostRequest('http://192.168.1.50:3000/api/discovery', {
          device_id: badId,
          device_name: 'My Phone',
          temp_token: validToken,
        });

        const res = await postDiscovery(req);
        assert.equal(res.status, 400, `Expected 400 for malicious device_id: ${badId}`);
        assert.equal(tokenStore.isValid(validToken), true);
      }
    });

    it('rejects non-string device_id (number, object, null, undefined) (400)', async () => {
      const nonStringIds = [12345, { id: 'device' }, [1, 2], null, undefined];

      for (const badId of nonStringIds) {
        const req = createJsonPostRequest('http://192.168.1.50:3000/api/discovery', {
          device_id: badId,
          device_name: 'My Phone',
          temp_token: validToken,
        });

        const res = await postDiscovery(req);
        assert.equal(res.status, 400);
        assert.equal(tokenStore.isValid(validToken), true);
      }
    });
  });

  // ── CASE 8: Malformed / oversized device_name ─────────────────────────────────
  describe('Case 8: Malformed and Oversized device_name Validation (400)', () => {
    const validToken = 'valid-tok-case8';

    beforeEach(() => {
      tokenStore.setToken(validToken, 60_000);
    });

    it('rejects empty string device_name (400)', async () => {
      const req = createJsonPostRequest('http://192.168.1.50:3000/api/discovery', {
        device_id: 'valid-device-1',
        device_name: '',
        temp_token: validToken,
      });

      const res = await postDiscovery(req);
      assert.equal(res.status, 400);
      assert.equal(tokenStore.isValid(validToken), true);
    });

    it('rejects whitespace-only device_name (400)', async () => {
      const req = createJsonPostRequest('http://192.168.1.50:3000/api/discovery', {
        device_id: 'valid-device-1',
        device_name: '    ',
        temp_token: validToken,
      });

      const res = await postDiscovery(req);
      assert.equal(res.status, 400);
      assert.equal(tokenStore.isValid(validToken), true);
    });

    it('rejects oversized device_name (>64 characters) (400)', async () => {
      const req = createJsonPostRequest('http://192.168.1.50:3000/api/discovery', {
        device_id: 'valid-device-1',
        device_name: 'b'.repeat(65),
        temp_token: validToken,
      });

      const res = await postDiscovery(req);
      assert.equal(res.status, 400);
      assert.equal(tokenStore.isValid(validToken), true);
    });

    it('rejects non-string device_name (number, boolean, null, undefined) (400)', async () => {
      const nonStringNames = [99999, true, false, null, undefined, { name: 'phone' }];

      for (const badName of nonStringNames) {
        const req = createJsonPostRequest('http://192.168.1.50:3000/api/discovery', {
          device_id: 'valid-device-1',
          device_name: badName,
          temp_token: validToken,
        });

        const res = await postDiscovery(req);
        assert.equal(res.status, 400);
        assert.equal(tokenStore.isValid(validToken), true);
      }
    });

    it('rejects malformed temp_token (empty, oversized, non-string) (400)', async () => {
      const badTokens = ['', '   ', 't'.repeat(65), 12345, null, undefined];

      for (const badTok of badTokens) {
        const req = createJsonPostRequest('http://192.168.1.50:3000/api/discovery', {
          device_id: 'valid-device-1',
          device_name: 'Valid Name',
          temp_token: badTok,
        });

        const res = await postDiscovery(req);
        assert.equal(res.status, 400);
      }
    });
  });

  // ── CASE 9: Middleware routing for QR vs discovery ────────────────────────────
  describe('Case 9: Middleware Routing (/api/discovery/qr vs /api/discovery)', () => {
    it('middleware blocks remote LAN request to /api/discovery/qr with 401', async () => {
      const req = new NextRequest('http://192.168.1.100:3000/api/discovery/qr', {
        headers: {
          host: '192.168.1.100:3000',
        },
      });

      const res = await middleware(req);
      assert.equal(res.status, 401);
      const json = await res.json();
      assert.equal(json.success, false);
      assert.equal(json.error, 'Unauthorized: Session token required');
    });

    it('middleware blocks spoofed x-forwarded-for: 127.0.0.1 to /api/discovery/qr with 401', async () => {
      const req = new NextRequest('http://localhost:3000/api/discovery/qr', {
        headers: {
          'x-forwarded-for': '127.0.0.1',
          host: 'localhost:3000',
        },
      });

      const res = await middleware(req);
      assert.equal(res.status, 401);
      const json = await res.json();
      assert.equal(json.success, false);
      assert.equal(json.error, 'Unauthorized: Session token required');
    });

    it('middleware blocks /api/discovery/qr with invalid origin even with x-is-local-client: true (403)', async () => {
      const req = new NextRequest('http://localhost:3000/api/discovery/qr', {
        headers: {
          'x-is-local-client': 'true',
          host: 'localhost:3000',
          origin: 'http://evil.com',
        },
      });

      const res = await middleware(req);
      assert.equal(res.status, 403);
      const json = await res.json();
      assert.equal(json.success, false);
      assert.equal(json.error, 'Forbidden: Invalid origin');
    });

    it('middleware allows genuine local request to /api/discovery/qr (200 pass-through)', async () => {
      const req = new NextRequest('http://localhost:3000/api/discovery/qr', {
        headers: {
          'x-is-local-client': 'true',
          host: 'localhost:3000',
        },
      });

      const res = await middleware(req);
      assert.equal(res.status, 200);
    });

    it('middleware allows unauthenticated LAN request to /api/discovery (200 pass-through for phone redemption)', async () => {
      const req = new NextRequest('http://192.168.1.50:3000/api/discovery', {
        method: 'POST',
        headers: {
          host: '192.168.1.50:3000',
          'x-forwarded-for': '192.168.1.88',
        },
      });

      const res = await middleware(req);
      assert.equal(res.status, 200, 'Unauthenticated LAN discovery redemption must pass through middleware');
    });
  });
});
