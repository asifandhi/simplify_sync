import { ApiError } from "@/lib/utils/ApiError";
import { asyncHandler } from "@/lib/utils/asyncHandler";
import { createReadStream } from "fs";
import { stat } from "fs/promises";
import { Readable } from "stream";
import { NextResponse } from "next/server";
import { join, basename } from "path";

export const GET = asyncHandler(async (request: Request) => {
  const { searchParams } = new URL(request.url);
  const inputPath = searchParams.get("path");

  if (!inputPath) {
    throw new ApiError(400, "Path is required");
  }

  // Use basename to securely strip any directory paths (including Windows backslashes)
  const safeFilename = basename(inputPath);

  try {
    const fullPath = join(process.cwd(), "uploads", safeFilename);
    const fileStat = await stat(fullPath);
    if (!fileStat.isFile()) {
      throw new ApiError(404, "File not found");
    }

    const ext = safeFilename.split(".").pop()?.toLowerCase();
    let contentType = "application/octet-stream";
    if (ext === "png") contentType = "image/png";
    else if (ext === "jpg" || ext === "jpeg") contentType = "image/jpeg";
    else if (ext === "gif") contentType = "image/gif";
    else if (ext === "webp") contentType = "image/webp";
    else if (ext === "pdf") contentType = "application/pdf";

    if (contentType === "application/octet-stream") {
      try {
        const { open } = await import("fs/promises");
        const handle = await open(fullPath, "r");
        const buf = Buffer.alloc(16);
        await handle.read(buf, 0, 16, 0);
        await handle.close();
        if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
          contentType = "image/jpeg";
        } else if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
          contentType = "image/png";
        } else if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) {
          contentType = "image/gif";
        } else if (buf.toString("utf8", 0, 4) === "RIFF" && buf.toString("utf8", 8, 12) === "WEBP") {
          contentType = "image/webp";
        } else if (buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46) {
          contentType = "application/pdf";
        }
      } catch (_) {}
    }

    const isDownload = searchParams.get("download") === "1" || searchParams.get("download") === "true";
    const dispositionType = isDownload ? "attachment" : "inline";

    const nodeStream = createReadStream(fullPath);
    const webStream = Readable.toWeb(nodeStream) as ReadableStream;

    return new NextResponse(webStream, {
      headers: {
        "Content-Type": contentType,
        "Content-Length": fileStat.size.toString(),
        "Content-Disposition": `${dispositionType}; filename="${safeFilename}"`,
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (error) {
    throw new ApiError(404, "File not found");
  }
});
