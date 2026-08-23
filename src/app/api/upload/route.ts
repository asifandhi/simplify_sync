import { ApiError } from "@/lib/utils/ApiError";
import { ApiResponse } from "@/lib/utils/ApiResponse";
import { asyncHandler } from "@/lib/utils/asyncHandler";
import { randomUUID } from "crypto";
import { mkdir } from "fs/promises";
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

  const uniqueName = `${randomUUID()}-${fileObject.name.replace(/[^a-zA-Z0-9.-]/g, "_")}`;
  const uploadsDir = join(process.cwd(), "uploads");
  
  // 2. Ensure the uploads directory exists
  await mkdir(uploadsDir, { recursive: true });

  const path = join(uploadsDir, uniqueName);
  
  // 3. Stream the file to disk instead of loading it entirely into RAM
  const writeStream = createWriteStream(path);
  const reader = fileObject.stream().getReader();
  
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      writeStream.write(value);
    }
  } finally {
    writeStream.end();
  }

  return ApiResponse.success(
    { file_path: uniqueName, file_name: fileObject.name, file_type: fileObject.type },
    "File uploaded successfully"
  );
});