import { getAllDevices } from "@/db/sqlite";
import { isDeviceOnline } from "@/lib/socket";
import { ApiResponse } from "@/lib/utils/ApiResponse";
import { asyncHandler } from "@/lib/utils/asyncHandler";

export const GET = asyncHandler(async () => {
  try {
    const devices = (await getAllDevices()) as any[];
    const enriched = devices.map((d) => ({
      ...d,
      is_online: isDeviceOnline(d.device_id),
    }));
    return ApiResponse.success(enriched, "Devices retrieved successfully");
  } catch (error) {
    console.error("Error fetching devices:", error);
    return ApiResponse.error("Failed to fetch devices", 500);
  }
});
