import { ApiError } from "@/lib/utils/ApiError";
import { asyncHandler } from "@/lib/utils/asyncHandler";
import { readFile } from "fs/promises";
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
    const fileBuffer = await readFile(fullPath);
    const ext = safeFilename.split(".").pop()?.toLowerCase();
    let contentType = "application/octet-stream";
    if (ext === "png") contentType = "image/png";
    else if (ext === "jpg" || ext === "jpeg") contentType = "image/jpeg";
    else if (ext === "gif") contentType = "image/gif";
    else if (ext === "pdf") contentType = "application/pdf";
    return new NextResponse(fileBuffer, {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `inline; filename="${safeFilename}"`,
      },
    });
  } catch (error) {
    throw new ApiError(404,"File not found" );
  }
});
