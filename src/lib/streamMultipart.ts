import { createRequire } from "node:module";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createWriteStream } from "node:fs";
import { mkdir, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { getSafeUploadPath } from "@/lib/pathSafety";
import { ApiError } from "@/lib/utils/ApiError";

const busboy = createRequire(import.meta.url)("busboy");
export const MAX_FILE_BYTES = 100 * 1024 * 1024;
const MAX_BODY_BYTES = MAX_FILE_BYTES + 64 * 1024;

export async function streamMultipart(request: Request) {
  if (!request.body) throw new ApiError(400, "Missing multipart body");
  if (Number(request.headers.get("content-length")) > MAX_BODY_BYTES) throw new ApiError(413, "Upload too large");
  let parser: ReturnType<typeof busboy>;
  try {
    parser = busboy({ headers: Object.fromEntries(request.headers), limits: {
      fileSize: MAX_FILE_BYTES + 1, files: 1, fields: 4, parts: 6, fieldSize: 1024, fieldNameSize: 64,
    } });
  } catch { throw new ApiError(400, "Invalid multipart body"); }
  const directory = path.join(process.cwd(), "uploads");
  await mkdir(directory, { recursive: true });
  const source = Readable.fromWeb(request.body as any);
  let size = 0;
  let failure: Error | undefined;
  let destination: string | undefined;
  let file: { file_path: string; file_name: string; file_type: string } | undefined;
  const fields: Record<string, string> = Object.create(null);
  const writes: Promise<void>[] = [];
  const controller = new AbortController();
  const fail = (error: Error) => {
    failure ??= error;
    controller.abort();
  };
  const timer = setTimeout(() => fail(new ApiError(408, "Upload timed out")), 120_000);
  const counter = new Transform({ transform(chunk, _encoding, callback) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) failure ??= new ApiError(413, "Multipart body exceeds limit");
    callback(failure, chunk);
  } });
  for (const event of ["filesLimit", "fieldsLimit", "partsLimit"]) parser.on(event, () => fail(new ApiError(413, "Too many multipart parts")));
  parser.on("field", (name: string, value: string, info: { nameTruncated: boolean; valueTruncated: boolean }) => {
    if (name.length > 64 || info.nameTruncated || info.valueTruncated || Object.hasOwn(fields, name)) {
      fail(new ApiError(413, "Multipart field exceeds limits"));
    } else fields[name] = value;
  });
  parser.on("file", (name: string, stream: Readable, info: { filename: string; mimeType: string }) => {
    if (name !== "file" || file) { stream.resume(); fail(new ApiError(400, "Exactly one file is required")); return; }
    const sanitized = info.filename.replace(/[^a-zA-Z0-9.-]/g, "_").replace(/\.{2,}/g, "_").slice(0, 100);
    const filename = `${randomUUID()}-${sanitized}`;
    destination = getSafeUploadPath(filename, directory) ?? undefined;
    if (!destination) { stream.resume(); fail(new ApiError(400, "Invalid filename")); return; }
    file = { file_path: filename, file_name: info.filename, file_type: info.mimeType };
    let fileBytes = 0;
    stream.on("limit", () => fail(new ApiError(413, "File exceeds 100MB")));
    const fileCounter = new Transform({ transform(chunk, _encoding, callback) {
      fileBytes += chunk.length;
      if (fileBytes > MAX_FILE_BYTES) failure ??= new ApiError(413, "File exceeds 100MB");
      callback(failure, chunk);
    } });
    writes.push(pipeline(stream, fileCounter, createWriteStream(destination, { flags: "wx" }), { signal: controller.signal }).catch(fail));
  });
  try {
    await pipeline(source, counter, parser, { signal: controller.signal });
    await Promise.all(writes);
    if (failure) throw failure;
    if (!file) throw new ApiError(400, "Exactly one file is required");
    return { file, fields, cleanup: () => unlink(destination!).catch(() => {}) };
  } catch (error) {
    controller.abort();
    await Promise.all(writes);
    if (destination) await unlink(destination).catch(() => {});
    throw failure ?? (error instanceof ApiError ? error : new ApiError(400, "Invalid or interrupted multipart upload"));
  } finally { clearTimeout(timer); }
}
