import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { NextRequest } from "next/server";
import { saveProfileImage } from "../src/lib/socket/profileImage";
import { streamMultipart, MAX_FILE_BYTES } from "../src/lib/streamMultipart";
import { fetchOpenGraph, isPublicPreviewAddress } from "../src/lib/utils/openGraph";

test("W06: active content is rejected and a real photo is re-encoded to an opaque PNG", async () => {
  for (const input of ["data:text/html;base64,PHNjcmlwdD4=", "data:image/png;base64,PHNjcmlwdD4=", "data:image/svg+xml;base64,PHN2Zz4=", "A".repeat(3_000_000)]) {
    await assert.rejects(saveProfileImage(input));
  }
  const jpeg = await sharp({ create: { width: 16, height: 16, channels: 3, background: "red" } }).jpeg().toBuffer();
  for (const input of [jpeg.toString("base64"), `data:image/jpeg;base64,${jpeg.toString("base64")}`]) {
    const url = await saveProfileImage(input);
    assert.match(url, /^\/uploads\/profiles\/[0-9a-f-]{36}\.png$/);
    const destination = path.join(process.cwd(), "public", url);
    const metadata = await sharp(await fs.readFile(destination)).metadata();
    assert.equal(metadata.format, "png");
    assert.equal(metadata.width, 16);
    await fs.unlink(destination);
  }
});

test("W07: firewall rejects remote, mobile, cross-origin and coerced booleans without spawning", async () => {
  const { GET, POST } = await import("../src/app/api/firewall/route");
  const local = { host: "localhost:3000", origin: "http://localhost:3000", "x-is-local-client": "true" };
  for (const headers of [{}, { ...local, "x-session-token": "mobile" }, { ...local, origin: "http://evil.test" }]) {
    assert.equal((await GET(new NextRequest("http://localhost:3000/api/firewall", { headers }))).status, 403);
    assert.equal((await POST(new NextRequest("http://localhost:3000/api/firewall", { method: "POST", headers, body: '{"enable":true}' }))).status, 403);
  }
  for (const enable of ["false", 1, null, {}, []]) {
    assert.equal((await POST(new NextRequest("http://localhost:3000/api/firewall", { method: "POST", headers: local, body: JSON.stringify({ enable }) }))).status, 400);
  }
  const state = globalThis as typeof globalThis & { firewallBusy?: boolean };
  state.firewallBusy = true;
  try {
    for (const enable of [true, false]) {
      assert.equal((await POST(new NextRequest("http://localhost:3000/api/firewall", { method: "POST", headers: local, body: JSON.stringify({ enable }) }))).status, 429);
    }
  } finally { state.firewallBusy = false; }
});

test("W08: local, private and alternate IP representations cannot be fetched", async () => {
  for (const ip of ["127.0.0.1", "10.0.0.2", "172.16.0.1", "192.168.1.1", "169.254.169.254", "::1", "fc00::1", "fe80::1", "::ffff:127.0.0.1", "0.0.0.0"]) assert.equal(isPublicPreviewAddress(ip), false, ip);
  assert.equal(isPublicPreviewAddress("93.184.215.14"), true);
  assert.equal(isPublicPreviewAddress("2606:4700::1111"), true);
  for (const url of ["http://127.0.0.1", "http://192.168.1.1", "http://2130706433", "http://[::ffff:127.0.0.1]"]) assert.equal(await fetchOpenGraph(url), null);
});

test("W09: multipart streams enforce file/field limits and cancel oversized chunked input", async () => {
  const normal = new FormData();
  normal.append("file", new Blob(["hello"]), "photo.txt");
  normal.append("device_id", "phone-a");
  const saved = await streamMultipart(new Request("http://localhost/api/upload", { method: "POST", body: normal }));
  assert.equal(await fs.readFile(path.join("uploads", saved.file.file_path), "utf8"), "hello");
  assert.equal(saved.fields.device_id, "phone-a");
  await saved.cleanup();
  for (const variant of ["files", "fields", "fieldSize"]) {
    const form = new FormData();
    form.append("file", new Blob(["small"]), "a.txt");
    if (variant === "files") form.append("file", new Blob(["small"]), "b.txt");
    if (variant === "fields") for (let i = 0; i < 5; i++) form.append(`field${i}`, "x");
    if (variant === "fieldSize") form.append("device_id", "x".repeat(1025));
    await assert.rejects(streamMultipart(new Request("http://localhost/api/upload", { method: "POST", body: form })), (e: any) => e.statusCode === 413);
  }
  const initialUploads = new Set(await fs.readdir("uploads"));
  let produced = 0;
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>({
    start(controller) { controller.enqueue(Buffer.from('--limit\r\nContent-Disposition: form-data; name="file"; filename="huge.bin"\r\nContent-Type: application/octet-stream\r\n\r\n')); },
    pull(controller) { produced += 64 * 1024; controller.enqueue(new Uint8Array(64 * 1024)); },
    cancel() { cancelled = true; },
  });
  const req = new Request("http://localhost/api/upload", { method: "POST", headers: { "content-type": "multipart/form-data; boundary=limit" }, body, duplex: "half" } as RequestInit);
  await assert.rejects(streamMultipart(req), (e: any) => e.statusCode === 413);
  assert.ok(cancelled);
  assert.ok(produced < MAX_FILE_BYTES + 1024 * 1024, `read ${produced} bytes`);
  const finalUploads = await fs.readdir("uploads");
  const leftoverFiles = finalUploads.filter(f => !initialUploads.has(f));
  assert.deepEqual(leftoverFiles, [], "Aborted oversized upload left orphaned file on disk");
});

test("W10: web/mobile creation records ownership; own downloads work and cross-device access fails", async () => {
  const db = await import("../src/db/sqlite");
  db.connectDB();
  for (const id of ["owner-a", "owner-b"]) db.insertDevice({ device_id: id, device_name: id, session_token: id });
  const { POST } = await import("../src/app/api/upload/route");
  const { POST: transfer } = await import("../src/app/api/transfer/route");
  const { GET } = await import("../src/app/api/file/route");
  for (const [upload, headers] of [[POST, { "x-is-local-client": "true" }], [transfer, { "x-device-id": "owner-a" }]] as const) {
    const form = new FormData();
    form.append("file", new Blob(["owned bytes"]), "owned.txt");
    form.append("device_id", "owner-a");
    const response = await upload(new NextRequest("http://localhost:3000/api/upload", { method: "POST", headers, body: form }));
    assert.equal(response.status, 200);
    const { data } = await response.json();
    assert.equal(db.getUploadOwner(data.file_path), "owner-a");
    const url = `http://localhost:3000/api/file?path=${data.file_path}`;
    assert.equal((await GET(new NextRequest(url, { headers: { "x-device-id": "owner-b" } }))).status, 403);
    assert.equal((await GET(new NextRequest(url))).status, 403);
    for (const auth of [{ "x-device-id": "owner-a" }, { "x-is-local-client": "true" }] as Record<string, string>[]) {
      const download = await GET(new NextRequest(url, { headers: auth }));
      assert.equal(download.status, 200);
      assert.equal(download.headers.get("access-control-allow-origin"), null);
      assert.equal(await download.text(), "owned bytes");
    }
    await fs.unlink(path.join("uploads", data.file_path));
  }
  for (const id of ["owner-a", "owner-b"]) db.deleteDevice(id);
});
