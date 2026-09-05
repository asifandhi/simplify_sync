import { ApiError } from "@/lib/utils/ApiError";
import { ApiResponse } from "@/lib/utils/ApiResponse";
import { asyncHandler } from "@/lib/utils/asyncHandler";
import { randomUUID } from "crypto";
import { mkdir, unlink } from "fs/promises";
import { createWriteStream } from "fs";
import { NextRequest } from "next/server";
import { join } from "path";

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB

export const POST = asyncHandler(async (request: NextRequest) => {
  const contentLength = parseInt(request.headers.get("content-length") || "0", 10);
  if (contentLength > MAX_FILE_SIZE) {
    throw new ApiError(413, "Payload too large. Maximum file size is 100MB.");
  }

  const data = await request.formData();
  const file = data.get("file");

  // 1. Strict File Instance Check
  if (!file || typeof file === "string" || typeof (file as File).arrayBuffer !== "function") {
    throw new ApiError(400, "No valid file uploaded");
  }

  const fileObject = file as File;
  
  if (fileObject.size > MAX_FILE_SIZE) {
    throw new ApiError(413, "File size exceeds the 100MB limit.");
  }

  const sanitizedName = fileObject.name.replace(/[^a-zA-Z0-9.-]/g, "_").slice(0, 100);
  const uniqueName = `${randomUUID()}-${sanitizedName}`;
  const uploadsDir = join(process.cwd(), "uploads");
  
  // 2. Ensure the uploads directory exists
  await mkdir(uploadsDir, { recursive: true });

  const path = join(uploadsDir, uniqueName);
  
  // 3. Stream the file to disk instead of loading it entirely into RAM
  const writeStream = createWriteStream(path);
  const reader = fileObject.stream().getReader();
  
  let streamError: any = null;
  writeStream.on("error", (err) => {
    streamError = err;
  });

  try {
    while (true) {
      if (streamError) throw streamError;
      const { done, value } = await reader.read();
      if (done) break;
      const canContinue = writeStream.write(value);
      if (!canContinue) {
        await new Promise<void>((resolve, reject) => {
          writeStream.once("drain", resolve);
          writeStream.once("error", reject);
        });
      }
    }
    await new Promise<void>((resolve, reject) => {
      writeStream.once("finish", resolve);
      writeStream.once("error", reject);
      writeStream.end();
    });
  } catch (err: any) {
    writeStream.destroy();
    try {
      await unlink(path);
    } catch (_) {}
    throw new ApiError(500, `File write failed: ${err?.message || err}`);
  }

  return ApiResponse.success(
    { file_path: uniqueName, file_name: fileObject.name, file_type: fileObject.type },
    "File uploaded successfully"
  );
});
