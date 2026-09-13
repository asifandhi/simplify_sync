import sharp from "sharp";
import { randomUUID } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { getSafeUploadPath } from "@/lib/pathSafety";

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

export async function saveProfileImage(input: unknown): Promise<string> {
  if (typeof input !== "string" || input.length > Math.ceil(MAX_IMAGE_BYTES / 3) * 4 + 64) {
    throw new Error("Profile image exceeds limit");
  }
  const match = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]*={0,2})$/.exec(input);
  // Android may send raw Base64 JPEG; actual raster decoding remains mandatory.
  const encoded = match?.[2] ?? input;
  if ((!match && input.startsWith("data:")) || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) {
    throw new Error("Unsupported profile image");
  }
  const bytes = Buffer.from(encoded, "base64");
  if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) throw new Error("Invalid image size");
  const image = sharp(bytes, { limitInputPixels: 16_000_000, failOn: "warning" });
  const metadata = await image.metadata();
  if (!["jpeg", "png", "webp"].includes(metadata.format ?? "") || (metadata.pages ?? 1) !== 1) {
    throw new Error("Only static raster photos are supported");
  }
  const raster = await image.rotate().resize(512, 512, { fit: "inside", withoutEnlargement: true }).png().toBuffer();
  const filename = `${randomUUID()}.png`;
  const directory = path.join(process.cwd(), "public", "uploads", "profiles");
  const destination = getSafeUploadPath(filename, directory);
  if (!destination) throw new Error("Unsafe profile destination");
  await mkdir(directory, { recursive: true });
  await writeFile(destination, raster, { flag: "wx" });
  return `/uploads/profiles/${filename}`;
}
