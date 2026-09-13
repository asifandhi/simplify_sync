import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { middleware } from '../middleware';

// Replicate the exact server entrypoint logic from server.ts
function normalizeIp(ip: string | undefined): string {
  if (!ip) return '';
  if (ip.startsWith('::ffff:')) {
    return ip.slice(7);
  }
  return ip;
}

function isLoopbackAddress(ip: string | undefined): boolean {
  const clean = normalizeIp(ip);
  return clean === '127.0.0.1' || clean === '::1' || clean === '[::1]' || clean.startsWith('127.');
}

function processServerEntrypoint(req: { headers: Record<string, string | undefined>; socket: { remoteAddress?: string } }) {
  // Strip client-supplied proxy and identity headers
  delete req.headers['x-forwarded-for'];
  delete req.headers['x-real-ip'];
  delete req.headers['x-is-local-client'];

  const remoteAddress = req.socket.remoteAddress;
  const cleanIp = normalizeIp(remoteAddress);
  const isLocal = isLoopbackAddress(remoteAddress);

  if (cleanIp) {
    req.headers['x-forwarded-for'] = cleanIp;
  }
  if (isLocal) {
    req.headers['x-is-local-client'] = 'true';
  }

  return { cleanIp, isLocal };
}

describe('W01: Local Access Authentication & Anti-Spoofing', () => {
  describe('Server Entrypoint IP Derivation & Header Stripping', () => {
    it('strips client-supplied x-forwarded-for and x-is-local-client from remote requests', () => {
      const mockReq = {
        headers: {
          'x-forwarded-for': '127.0.0.1',
          'x-is-local-client': 'true',
          'x-real-ip': '127.0.0.1',
        },
        socket: { remoteAddress: '192.168.1.100' },
      };

      const result = processServerEntrypoint(mockReq);

      assert.equal(result.isLocal, false);
      assert.equal(result.cleanIp, '192.168.1.100');
      assert.equal(mockReq.headers['x-is-local-client'], undefined);
      assert.equal(mockReq.headers['x-forwarded-for'], '192.168.1.100');
      assert.equal(mockReq.headers['x-real-ip'], undefined);
    });

    it('correctly identifies standard IPv4 loopback (127.0.0.1)', () => {
      const mockReq: { headers: Record<string, string | undefined>; socket: { remoteAddress?: string } } = {
        headers: {},
        socket: { remoteAddress: '127.0.0.1' },
      };

      const result = processServerEntrypoint(mockReq);

      assert.equal(result.isLocal, true);
      assert.equal(mockReq.headers['x-is-local-client'], 'true');
      assert.equal(mockReq.headers['x-forwarded-for'], '127.0.0.1');
    });

    it('correctly handles IPv4-mapped loopback (::ffff:127.0.0.1)', () => {
      const mockReq: { headers: Record<string, string | undefined>; socket: { remoteAddress?: string } } = {
        headers: { 'x-forwarded-for': 'attacker-ip' },
        socket: { remoteAddress: '::ffff:127.0.0.1' },
      };

      const result = processServerEntrypoint(mockReq);

      assert.equal(result.isLocal, true);
      assert.equal(result.cleanIp, '127.0.0.1');
      assert.equal(mockReq.headers['x-is-local-client'], 'true');
      assert.equal(mockReq.headers['x-forwarded-for'], '127.0.0.1');
    });

    it('correctly identifies IPv6 loopback (::1)', () => {
      const mockReq: { headers: Record<string, string | undefined>; socket: { remoteAddress?: string } } = {
        headers: {},
        socket: { remoteAddress: '::1' },
      };

      const result = processServerEntrypoint(mockReq);

      assert.equal(result.isLocal, true);
      assert.equal(mockReq.headers['x-is-local-client'], 'true');
      assert.equal(mockReq.headers['x-forwarded-for'], '::1');
    });

    it('rejects remote IPv4-mapped addresses (e.g. ::ffff:192.168.1.50)', () => {
      const mockReq: { headers: Record<string, string | undefined>; socket: { remoteAddress?: string } } = {
        headers: { 'x-forwarded-for': '127.0.0.1' },
        socket: { remoteAddress: '::ffff:192.168.1.50' },
      };

      const result = processServerEntrypoint(mockReq);

      assert.equal(result.isLocal, false);
      assert.equal(result.cleanIp, '192.168.1.50');
      assert.equal(mockReq.headers['x-is-local-client'], undefined);
      assert.equal(mockReq.headers['x-forwarded-for'], '192.168.1.50');
    });
  });

  describe('Middleware Access Control', () => {
    it('rejects non-loopback remote request attempting to spoof x-forwarded-for: 127.0.0.1', async () => {
      const req = new NextRequest('http://localhost:3000/api/devices', {
        headers: {
          'x-forwarded-for': '127.0.0.1',
        },
      });

      const res = await middleware(req);

      assert.equal(res.status, 401);
      const json = await res.json();
      assert.equal(json.success, false);
      assert.equal(json.error, 'Unauthorized: Session token required');
    });

    it('accepts genuine loopback request with server-derived identity', async () => {
      const req = new NextRequest('http://localhost:3000/api/devices', {
        headers: {
          'x-is-local-client': 'true',
          'host': 'localhost:3000',
        },
      });

      const res = await middleware(req);

      // NextResponse.next() passes through with 200 OK
      assert.equal(res.status, 200);
    });

    it('rejects protected routes without session token or local identity', async () => {
      const routes = ['/api/chat', '/api/devices', '/api/transfer', '/api/upload', '/api/file', '/api/setting'];

      for (const route of routes) {
        const req = new NextRequest(`http://localhost:3000${route}`, {
          headers: {
            'x-forwarded-for': '127.0.0.1', // Spoofed header must be ignored
          },
        });

        const res = await middleware(req);
        assert.equal(res.status, 401, `Expected 401 for ${route}`);
      }
    });

    it('allows unprotected routes without local identity or session token', async () => {
      const req = new NextRequest('http://localhost:3000/api/discovery', {
        headers: {
          'x-forwarded-for': '192.168.1.50',
        },
      });

      const res = await middleware(req);
      assert.equal(res.status, 200);
    });
  });

  describe('Local Browser Mutation Origin Protection', () => {
    it('accepts local DELETE mutation with matching localhost origin', async () => {
      const req = new NextRequest('http://localhost:3000/api/devices/device-1', {
        method: 'DELETE',
        headers: {
          'x-is-local-client': 'true',
          'host': 'localhost:3000',
          'origin': 'http://localhost:3000',
        },
      });

      const res = await middleware(req);
      assert.equal(res.status, 200);
    });

    it('accepts local POST mutation with matching 127.0.0.1 origin', async () => {
      const req = new NextRequest('http://127.0.0.1:3000/api/chat', {
        method: 'POST',
        headers: {
          'x-is-local-client': 'true',
          'host': '127.0.0.1:3000',
          'origin': 'http://127.0.0.1:3000',
        },
      });

      const res = await middleware(req);
      assert.equal(res.status, 200);
    });

    it('rejects local DELETE mutation from malicious origin (e.g. evil.com)', async () => {
      const req = new NextRequest('http://localhost:3000/api/devices/device-1', {
        method: 'DELETE',
        headers: {
          'x-is-local-client': 'true',
          'host': 'localhost:3000',
          'origin': 'http://evil.com',
        },
      });

      const res = await middleware(req);
      assert.equal(res.status, 403);
      const json = await res.json();
      assert.equal(json.success, false);
      assert.equal(json.error, 'Forbidden: Invalid origin');
    });

    it('rejects local POST mutation from malicious origin (e.g. attacker.com)', async () => {
      const req = new NextRequest('http://localhost:3000/api/chat', {
        method: 'POST',
        headers: {
          'x-is-local-client': 'true',
          'host': 'localhost:3000',
          'origin': 'http://attacker.com',
        },
      });

      const res = await middleware(req);
      assert.equal(res.status, 403);
      const json = await res.json();
      assert.equal(json.success, false);
      assert.equal(json.error, 'Forbidden: Invalid origin');
    });

    it('rejects local mutation with DNS-rebound host/origin', async () => {
      const req = new NextRequest('http://rebound-domain.com:3000/api/devices', {
        method: 'DELETE',
        headers: {
          'x-is-local-client': 'true',
          'host': 'rebound-domain.com:3000',
          'origin': 'http://rebound-domain.com:3000',
        },
      });

      const res = await middleware(req);
      assert.equal(res.status, 403);
    });

    it('rejects local mutation without origin or referer header', async () => {
      const req = new NextRequest('http://localhost:3000/api/devices/device-1', {
        method: 'DELETE',
        headers: {
          'x-is-local-client': 'true',
          'host': 'localhost:3000',
        },
      });

      const res = await middleware(req);
      assert.equal(res.status, 403);
      const json = await res.json();
      assert.equal(json.success, false);
      assert.match(json.error, /Forbidden/);
    });

    it('accepts local mutation with valid local referer when origin is omitted', async () => {
      const req = new NextRequest('http://localhost:3000/api/devices/device-1', {
        method: 'DELETE',
        headers: {
          'x-is-local-client': 'true',
          'host': 'localhost:3000',
          'referer': 'http://localhost:3000/devices',
        },
      });

      const res = await middleware(req);
      assert.equal(res.status, 200);
    });
  });

  describe('End-to-End Entrypoint to Middleware Pipeline', () => {
    it('simulates remote attack: spoofed x-forwarded-for + x-is-local-client -> stripped -> rejected 401', async () => {
      // 1. Client connects remotely with spoofed headers
      const rawReq = {
        headers: {
          'x-forwarded-for': '127.0.0.1',
          'x-is-local-client': 'true',
        },
        socket: { remoteAddress: '192.168.1.88' },
      };

      // 2. Server entrypoint processes request
      processServerEntrypoint(rawReq);

      // 3. Next.js receives sanitized headers
      const nextReq = new NextRequest('http://localhost:3000/api/devices', {
        headers: rawReq.headers as Record<string, string>,
      });

      // 4. Middleware handles request
      const res = await middleware(nextReq);

      assert.equal(res.status, 401);
      const json = await res.json();
      assert.equal(json.success, false);
    });

    it('simulates genuine loopback: TCP remoteAddress 127.0.0.1 -> local marked -> accepted 200', async () => {
      // 1. Client connects via loopback
      const rawReq = {
        headers: {
          host: 'localhost:3000',
        },
        socket: { remoteAddress: '127.0.0.1' },
      };

      // 2. Server entrypoint processes request
      processServerEntrypoint(rawReq);

      // 3. Next.js receives sanitized headers
      const nextReq = new NextRequest('http://localhost:3000/api/devices', {
        headers: rawReq.headers as Record<string, string>,
      });

      // 4. Middleware handles request
      const res = await middleware(nextReq);

      assert.equal(res.status, 200);
    });
  });
});
