import { getAllDevices } from "@/db/sqlite";
import { ApiResponse } from "@/lib/utils/ApiResponse";
import { asyncHandler } from "@/lib/utils/asyncHandler";
import { NextResponse } from "next/server";

export const GET = asyncHandler(async () => {
  try {
    const devices = await getAllDevices();
    return ApiResponse.success(devices, "Devices retrieved successfully");
  } catch (error) {
    console.error("Error fetching devices:", error);
    return ApiResponse.error("Failed to fetch devices", 500);
  }
});
