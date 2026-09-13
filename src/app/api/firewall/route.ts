import { NextRequest } from "next/server";
import { ApiResponse } from "@/lib/utils/ApiResponse";
import { asyncHandler } from "@/lib/utils/asyncHandler";
import { manageFirewall } from "@/lib/firewall/firewallManager";
import { isValidLocalOrigin } from "@/lib/localAccess";
import { ApiError } from "@/lib/utils/ApiError";

function requireLocalWeb(req: NextRequest) {
  if (req.headers.get("x-is-local-client") !== "true" || req.headers.has("x-session-token")) {
    throw new ApiError(403, "Local web access required");
  }
  let origin = req.headers.get("origin");
  if (!origin && req.method === "GET") {
    try { origin = new URL(req.headers.get("referer") ?? "").origin; } catch { /* Deny below. */ }
  }
  if (!origin || !isValidLocalOrigin(origin, req.headers.get("host")) || new URL(origin).origin !== origin) {
    throw new ApiError(403, "Exact local origin required");
  }
}

export const GET = asyncHandler(async (req: NextRequest) => {
  requireLocalWeb(req);
  const status = await manageFirewall("check");
  return ApiResponse.success(status, "Firewall status retrieved");
});

export const POST = asyncHandler(async (req: NextRequest) => {
  requireLocalWeb(req);
  const body = await req.json().catch(() => null);
  if (typeof body?.enable !== "boolean") throw new ApiError(400, "enable must be a boolean");
  const enable = body.enable;

  const status = await manageFirewall(enable ? "enable" : "disable");
  if (!status.success || status.error) {
    return ApiResponse.error(status.error || "Failed to configure firewall", 400);
  }
  return ApiResponse.success(status, enable ? "Firewall rules enabled" : "Firewall rules removed");
});
