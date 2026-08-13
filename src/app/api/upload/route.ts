import { ApiError } from "@/lib/utils/ApiError";
import { ApiResponse } from "@/lib/utils/ApiResponse";
import { asyncHandler } from "@/lib/utils/asyncHandler";
import { randomUUID } from "crypto";
import { writeFile, mkdir } from "fs/promises";
import { NextRequest } from "next/server";
import { join } from "path";

export const POST = asyncHandler(async (request: NextRequest) => {
  const data = await request.formData();
  const file = data.get("file");

  // 1. Strict File Instance Check
  if (!file || typeof file === "string" || typeof (file as File).arrayBuffer !== "function") {
    throw new ApiError(400, "No valid file uploaded");
  }

  const fileObject = file as File;
  const byte = await fileObject.arrayBuffer();
  const buffer = Buffer.from(byte);

  const uniqueName = `${randomUUID()}-${fileObject.name.replace(/[^a-zA-Z0-9.-]/g, "_")}`;
  const uploadsDir = join(process.cwd(), "uploads");
  
  // 2. Ensure the uploads directory exists
  await mkdir(uploadsDir, { recursive: true });

  const path = join(uploadsDir, uniqueName);
  await writeFile(path, buffer);

  return ApiResponse.success(
    { file_path: uniqueName, file_name: fileObject.name, file_type: fileObject.type },
    "File uploaded successfully"
  );
});