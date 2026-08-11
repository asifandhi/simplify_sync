import { ApiError } from "@/lib/utils/ApiError";
import { ApiResponse } from "@/lib/utils/ApiResponse";
import { asyncHandler } from "@/lib/utils/asyncHandler";
import { randomUUID } from "crypto";
import { writeFile } from "fs/promises";
import { request } from "http";
import { NextResponse } from "next/server";
import { join } from "path";

export const POST = asyncHandler(async (request: Request) => {
  const data = await request.formData();
  const file: File | null = data.get("file") as unknown as File;

  if (!file) {
    throw new ApiError(400, "No file uploaded");
  }

  const byte = await file.arrayBuffer();
  console.log(
    `File uploaded: ${file.name}, size: ${byte.byteLength} bytes full byte: ${byte}`,
  );
  const buffer = Buffer.from(byte);
  console.log(`Buffer created: ${buffer.length} bytes full buffer: ${buffer}`);

  const uniqueName = `${randomUUID()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, "_")}`;
  console.log(`Unique file name generated: ${uniqueName}`);
  console.log(process.cwd());
  const path = join(process.cwd(), "uploads", uniqueName);
  console.log(`File will be saved to: ${path}`);

  await writeFile(path, buffer);

  return ApiResponse.success(
    { file_path: uniqueName, file_name: file.name, file_type: file.type },
    "File uploaded successfully",
    200,
  );
});
