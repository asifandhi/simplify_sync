import { getAllDevices } from "@/db/sqlite";
import { ApiResponse } from "@/lib/utils/ApiResponse";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const devices = await getAllDevices();
    return ApiResponse.success(devices, "Devices retrieved successfully");
  } catch (error) {
    console.error("Error fetching devices:", error);
    return ApiResponse.error("Failed to fetch devices", 500);
  }
}
