import { ApiResponse } from "@/lib/utils/ApiResponse";
import { asyncHandler } from "@/lib/utils/asyncHandler";
import { receiveOwnedUpload } from "@/lib/uploadOwnership";
import { NextRequest } from "next/server";

export const POST = asyncHandler(async (request: NextRequest) => {
  const file = await receiveOwnedUpload(request);
  return ApiResponse.success(file, "File uploaded successfully");
});
