import path from "path";
import fs from "fs";

/**
 * Validates that a user-supplied filename is an opaque upload identifier
 * and cannot escape the upload directory.
 */
export function isValidUploadFilename(filename: unknown): boolean {
  if (typeof filename !== "string") {
    return false;
  }
  if (filename.length === 0 || filename.length > 255) {
    return false;
  }
  if (!/^[a-zA-Z0-9._-]+$/.test(filename)) {
    return false;
  }
  if (filename === "." || filename === "..") {
    return false;
  }
  if (filename.includes("/") || filename.includes("\\") || filename.includes("..")) {
    return false;
  }
  if (path.basename(filename) !== filename) {
    return false;
  }
  if (path.posix.basename(filename) !== filename || path.win32.basename(filename) !== filename) {
    return false;
  }
  return true;
}

/**
 * Resolves and verifies that a path strictly stays within the uploads directory.
 * Returns the fully-resolved path if safe, or null if unsafe/invalid.
 */
export function getSafeUploadPath(userPath: string, uploadsDir?: string): string | null {
  if (typeof userPath !== "string") {
    return null;
  }
  if (!isValidUploadFilename(userPath)) {
    return null;
  }
  if (userPath.includes("/") || userPath.includes("\\") || userPath.includes("..")) {
    return null;
  }

  const resolvedRoot = path.resolve(uploadsDir || path.join(process.cwd(), "uploads"));
  const resolvedTarget = path.resolve(resolvedRoot, userPath);

  const rootWithSep = resolvedRoot.endsWith(path.sep) ? resolvedRoot : resolvedRoot + path.sep;
  if (
    path.dirname(resolvedTarget) === resolvedRoot &&
    resolvedTarget.startsWith(rootWithSep)
  ) {
    return resolvedTarget;
  }

  return null;
}

/**
 * Safely unlinks a file from the uploads directory only if verified safe.
 * Returns true if safe (and unlinked if existing), false if blocked.
 */
export function safeUnlinkUpload(userPath: string, uploadsDir?: string): boolean {
  const safePath = getSafeUploadPath(userPath, uploadsDir);
  if (!safePath) {
    console.warn(`[pathSafety] Blocked unsafe file unlink attempt: ${userPath}`);
    return false;
  }

  try {
    if (fs.existsSync(safePath)) {
      fs.unlinkSync(safePath);
    }
    return true;
  } catch (err) {
    console.error(`[pathSafety] Failed to unlink safe path: ${safePath}`, err);
    return false;
  }
}
