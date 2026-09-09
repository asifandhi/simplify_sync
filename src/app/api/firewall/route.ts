import { NextRequest } from "next/server";
import { ApiResponse } from "@/lib/utils/ApiResponse";
import { asyncHandler } from "@/lib/utils/asyncHandler";
import { manageFirewall } from "@/lib/firewall/firewallManager";

export const GET = asyncHandler(async () => {
  const status = await manageFirewall("check");
  return ApiResponse.success(status, "Firewall status retrieved");
});

export const POST = asyncHandler(async (req: NextRequest) => {
  const body = await req.json();
  const enable = Boolean(body.enable);

  const status = await manageFirewall(enable ? "enable" : "disable");
  if (!status.success || status.error) {
    return ApiResponse.error(status.error || "Failed to configure firewall", 400);
  }
  return ApiResponse.success(status, enable ? "Firewall rules enabled" : "Firewall rules removed");
});
