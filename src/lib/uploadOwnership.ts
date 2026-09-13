import { getDeviceByIdPublic, recordUploadOwner } from "@/db/sqlite";
import { ApiError } from "@/lib/utils/ApiError";
import { streamMultipart } from "@/lib/streamMultipart";

export async function receiveOwnedUpload(request: Request) {
  const mobileId = request.headers.get("x-device-id");
  const localWeb = request.headers.get("x-is-local-client") === "true" && !request.headers.has("x-session-token");
  if (!mobileId && !localWeb) throw new ApiError(401, "Upload authentication required");
  const upload = await streamMultipart(request);
  try {
    const deviceId = mobileId || upload.fields.device_id;
    if (!deviceId || !getDeviceByIdPublic(deviceId)) throw new ApiError(400, "Valid conversation device_id required");
    recordUploadOwner(upload.file.file_path, deviceId);
    return upload.file;
  } catch (error) { await upload.cleanup(); throw error; }
}
