import { ApiError } from "@/lib/utils/ApiError";
import { asyncHandler } from "@/lib/utils/asyncHandler";
import { readFile } from "fs/promises";
import { NextRequest, NextResponse } from "next/server";
import { join } from "path";

export const GET = asyncHandler(async (request: Request) => {
  const { searchParams } = new URL(request.url);
  const path = searchParams.get("path");

  if (!path || path.includes("..") || path?.includes("/")) {
    throw new ApiError(400, "Invalid path");
  }
  try {
    const fullPath = join(process.cwd(), "uploads", path);
    const fileBuffer = await readFile(fullPath);
    const ext = path.split(".").pop()?.toLowerCase();
    let contentType = "application/octet-stream";
    if (ext === "png") contentType = "image/png";
    else if (ext === "jpg" || ext === "jpeg") contentType = "image/jpeg";
    else if (ext === "gif") contentType = "image/gif";
    else if (ext === "pdf") contentType = "application/pdf";
    return new NextResponse(fileBuffer, {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `inline; filename="${path}"`,
      },
    });
  } catch (error) {
    throw new ApiError(404,"File not found" );
  }
});
