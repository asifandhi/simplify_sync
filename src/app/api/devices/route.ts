import { getAllDevicesPublic, getDeviceByIdPublic } from "@/db/sqlite";
import { isDeviceOnline } from "@/lib/socket";
import { ApiResponse } from "@/lib/utils/ApiResponse";
import { asyncHandler } from "@/lib/utils/asyncHandler";
import { NextRequest } from "next/server";

export const GET = asyncHandler(async (request: NextRequest) => {
  try {
    const authenticatedDeviceId = request.headers.get("x-device-id");
    const isLocalWeb = request.headers.get("x-is-local-client") === "true";

    // 1. Mobile-originated requests (authenticated via device session token)
    if (authenticatedDeviceId) {
      const ownDevice = getDeviceByIdPublic(authenticatedDeviceId);
      if (!ownDevice) {
        return ApiResponse.success([], "Devices retrieved successfully");
      }
      const enriched = [
        {
          ...ownDevice,
          is_online: isDeviceOnline(ownDevice.device_id),
        },
      ];
      return ApiResponse.success(enriched, "Devices retrieved successfully");
    }

    // 2. Local web UI requests (authenticated via local loopback client, no device session token)
    if (isLocalWeb) {
      const devices = getAllDevicesPublic() as any[];
      const enriched = devices.map((d) => ({
        ...d,
        is_online: isDeviceOnline(d.device_id),
      }));
      return ApiResponse.success(enriched, "Devices retrieved successfully");
    }

    return ApiResponse.error("Unauthorized", 401);
  } catch (error) {
    console.error("Error fetching devices:", error);
    return ApiResponse.error("Failed to fetch devices", 500);
  }
});
