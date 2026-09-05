import { getSetting, setSetting } from "@/db/sqlite";
import { ApiError } from "@/lib/utils/ApiError";
import { ApiResponse } from "@/lib/utils/ApiResponse";
import { asyncHandler } from "@/lib/utils/asyncHandler";

export const GET = asyncHandler(async (request: Request) => {
  // getSetting returns a string or null directly, so no need for .value
  const folderMirror = getSetting("folderMirrorEnabled");
  const webProfileImage = getSetting("web_profile_image");

  const settingsData = {
    // Fallback to "false" if the setting hasn't been saved in DB yet
    folderMirrorEnabled: folderMirror || "false",
    web_profile_image: webProfileImage || null,
  };

  // Use the static method, it already wraps everything in NextResponse.json
  return ApiResponse.success(settingsData, "Settings retrieved successfully", 200);
});

export const POST = asyncHandler(async (request: Request) => {
  const body = await request.json();
  const { key, value } = body;

  if (!key || value === undefined) {
    throw new ApiError(400, "Missing 'key' or 'value' in request body");
  }

  const allowedKeys = ['clipboardSyncEnabled', 'folderMirrorEnabled', 'web_profile_image'];
  if (!allowedKeys.includes(key)) {
    throw new ApiError(400, "Invalid key");
  }

  // Persist to database
  setSetting(key, value.toString());

  return ApiResponse.success({ key, value }, "Setting updated successfully", 200);
});