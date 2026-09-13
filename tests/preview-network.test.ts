import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import dns from "node:dns/promises";
import { syncBuiltinESMExports } from "node:module";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";

test("W08: public previews work; redirect destinations, DNS pinning, response size and body deadlines are enforced", async (t) => {
  let mode = "normal";
  let requests = 0;
  let resolutions = 0;
  t.mock.method(dns, "lookup", async () => {
    resolutions++;
    return mode === "mixed-dns" ? [{ address: "93.184.215.14", family: 4 }, { address: "127.0.0.1", family: 4 }] : [{ address: "93.184.215.14", family: 4 }];
  });
  t.mock.method(http, "request", (_url: URL, options: any, callback: (res: any) => void) => {
    requests++;
    options.lookup("public.test", {}, (error: unknown, address: string) => {
      assert.equal(error, null);
      assert.equal(address, "93.184.215.14");
    });
    const response = new PassThrough() as PassThrough & { statusCode: number; headers: Record<string, string> };
    response.statusCode = mode === "redirect" ? 302 : 200;
    response.headers = mode === "redirect" ? { location: "http://192.168.1.1/private" } : { "content-type": "text/html" };
    const request = new EventEmitter() as EventEmitter & { end: () => void };
    const abort = () => { response.destroy(new Error("aborted")); request.emit("error", new Error("aborted")); };
    options.signal.addEventListener("abort", abort, { once: true });
    response.on("close", () => options.signal.removeEventListener("abort", abort));
    request.end = () => queueMicrotask(() => {
      callback(response);
      if (mode === "stall") response.write("<title>never ends");
      else if (mode === "large") response.end(Buffer.alloc(1024 * 1024 + 1));
      else response.end('<title>Public preview</title><meta property="og:description" content="Works">');
    });
    return request;
  });
  syncBuiltinESMExports();
  try {
    const { fetchOpenGraph } = await import("../src/lib/utils/openGraph");
    const preview = JSON.parse((await fetchOpenGraph("http://public.test/article"))!);
    assert.equal(preview.title, "Public preview");
    assert.equal(preview.description, "Works");
    assert.equal(resolutions, 1, "Only the checked DNS result is used");
    for (const next of ["redirect", "mixed-dns", "large", "stall"]) {
      mode = next;
      requests = 0;
      const start = Date.now();
      assert.equal(await fetchOpenGraph("http://public.test/article"), null, next);
      if (next === "redirect") assert.equal(requests, 1, "Private redirect is never requested");
      if (next === "mixed-dns") assert.equal(requests, 0);
      if (next === "stall") assert.ok(Date.now() - start < 3000, "Deadline includes body consumption");
    }
  } finally { t.mock.restoreAll(); syncBuiltinESMExports(); }
});
