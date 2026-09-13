import Database from "better-sqlite3";
import path from "path";
import { isValidUploadFilename, safeUnlinkUpload } from "@/lib/pathSafety";


// Ensure we have a default path in case process.env is not fully loaded by Next.js yet
const db_path = process.env.DB_PATH || path.join(process.cwd(), "database", "Simplify-Sync.db");

const db = new Database(db_path);

// connectDB() is called from server.ts — not at module level

export function connectDB() {
  try {
    db.exec(
      `CREATE TABLE IF NOT EXISTS devices(
            device_id     TEXT PRIMARY KEY,
            device_name   TEXT NOT NULL,
            session_token TEXT NOT NULL,
            trust_level   INTEGER DEFAULT 1,
            last_active   DATETIME,
            is_trusted    INTEGER DEFAULT 0,
            created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
        );`
    );
    db.exec(`CREATE TABLE IF NOT EXISTS upload_ownership (
      file_id TEXT PRIMARY KEY,
      device_id TEXT NOT NULL REFERENCES devices(device_id) ON DELETE CASCADE
    )`);

    // Migration for profile_image
    try {
      db.exec(`ALTER TABLE devices ADD COLUMN profile_image TEXT;`);
    } catch (e) {
      // Ignore if already exists
    }

    // Migration for chat_history status
    try {
      db.exec(`ALTER TABLE chat_history ADD COLUMN status TEXT DEFAULT 'SENT';`);
      db.exec(`UPDATE chat_history SET status = 'DELIVERED' WHERE status IS NULL;`);
    } catch (e) {
      // Ignore if already exists
    }

    db.exec(`
       CREATE TABLE IF NOT EXISTS chat_history (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            device_id     TEXT NOT NULL,
            sender        TEXT NOT NULL,
            content_type  TEXT NOT NULL,
            content       TEXT,
            file_path     TEXT,
            preview_data  TEXT,
            timestamp     DATETIME DEFAULT CURRENT_TIMESTAMP,
            is_view_once  INTEGER DEFAULT 0,
            is_viewed     INTEGER DEFAULT 0,
            status        TEXT DEFAULT 'SENT',
            FOREIGN KEY (device_id) REFERENCES devices(device_id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS settings (
            key   TEXT PRIMARY KEY,
            value TEXT            
        );`,
    );
    // Only unambiguous legacy conversation references can establish ownership.
    const legacy = db.prepare(`SELECT file_path, MIN(device_id) AS device_id FROM chat_history
      WHERE file_path IS NOT NULL AND file_path != '' GROUP BY file_path HAVING COUNT(DISTINCT device_id) = 1`).all() as { file_path: string; device_id: string }[];
    const migrate = db.prepare("INSERT OR IGNORE INTO upload_ownership (file_id, device_id) VALUES (?, ?)");
    for (const row of legacy) if (isValidUploadFilename(row.file_path)) migrate.run(row.file_path, row.device_id);
  } catch (error) {
    console.error("Error connecting to the database:", error);
  }
}

export function getChatByDeviceId(device_id: string, limit: number = 50, offset: number = 0, beforeTimestamp?: string, beforeId?: number) {
  try {
    if (beforeTimestamp && beforeId !== undefined) {
      const stmt = db.prepare(
        `SELECT * FROM chat_history 
         WHERE device_id = ? AND (timestamp < ? OR (timestamp = ? AND id < ?))
         ORDER BY timestamp DESC, id DESC LIMIT ?`
      );
      const rows = stmt.all(device_id, beforeTimestamp, beforeTimestamp, beforeId, limit);
      return rows as any[];
    }
    if (beforeId !== undefined) {
      const stmt = db.prepare(
        `SELECT * FROM chat_history 
         WHERE device_id = ? AND id < ?
         ORDER BY timestamp DESC, id DESC LIMIT ?`
      );
      const rows = stmt.all(device_id, beforeId, limit);
      return rows as any[];
    }
    const stmt = db.prepare(
      `SELECT * FROM chat_history WHERE device_id = ? ORDER BY timestamp DESC, id DESC LIMIT ? OFFSET ?`,
    );
    const rows = stmt.all(device_id, limit, offset);
    return rows as any[];
  } catch (error) {
    console.error("Error fetching chat history:", error);
    return [];
  }
}

export function getPendingChatMessages(device_id: string) {
  try {
    const stmt = db.prepare(
      `SELECT * FROM chat_history WHERE device_id = ? AND status = 'SENT' AND sender NOT LIKE 'android-%' ORDER BY timestamp ASC, id ASC`,
    );
    const rows = stmt.all(device_id);
    return rows as any[];
  } catch (error) {
    console.error("Error fetching pending chat messages:", error);
    return [];
  }
}

export function markMessagesDelivered(ids: number[], device_id: string) {
  try {
    if (!ids || ids.length === 0) return false;
    const placeholders = ids.map(() => '?').join(',');
    const stmt = db.prepare(
      `UPDATE chat_history SET status = 'DELIVERED' WHERE id IN (${placeholders}) AND device_id = ?`,
    );
    const result = stmt.run(...ids, device_id);
    return result.changes > 0;
  } catch (error) {
    console.error("Error marking messages delivered:", error);
    return false;
  }
}

export function getChatByFileType(file_type: string, device_id: string) {
  try {
    const stmt = db.prepare(
      `SELECT * FROM chat_history WHERE content_type = ? AND device_id = ? ORDER BY timestamp DESC`,
    );
    const rows = stmt.all(file_type, device_id);
    return rows;
  } catch (error) {
    console.error("Error fetching chat history by file type:", error);
  }
}

interface chatMessageInput {
  device_id: string;
  sender: string;
  content_type: string;
  content?: string;
  file_path?: string;
  preview_data?: string;
  is_view_once?: boolean;
  status?: string;
}

export function insertChatMessage(data: chatMessageInput) {
  if (data.file_path && !isValidUploadFilename(data.file_path)) {
    data.file_path = undefined;
  }
  const stmt = db.prepare(
    `INSERT INTO chat_history (device_id, sender, content_type, content, file_path, preview_data, is_view_once, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const result = stmt.run(
    data.device_id,
    data.sender,
    data.content_type,
    data.content || null,
    data.file_path || null,
    data.preview_data || null,
    data.is_view_once ? 1 : 0,
    data.status || 'SENT',
  );
  if (process.env.NODE_ENV === "development") {
    console.log("Inserted chat message with ID:", result.lastInsertRowid);
  }
  const row = db.prepare('SELECT * FROM chat_history WHERE id = ?').get(result.lastInsertRowid);
  if (!row) {
    throw new Error("Failed to retrieve inserted chat message");
  }
  return row as any;
}

export function updateChatMessageStatus(id: number, is_viewed: boolean,device_id: string) {
  try {
    const stmt = db.prepare(
      `UPDATE chat_history SET is_viewed = ? WHERE id = ? AND device_id = ?`,
    );
    const result = stmt.run(is_viewed ? 1 : 0, id, device_id);
    if (process.env.NODE_ENV === "development") {
      console.log(`Updated chat message with ID: ${id} to is_viewed: ${is_viewed}`);
      console.table(result);
    }
    return result.changes > 0;
  } catch (error) {
    console.error("Error updating chat message status:", error);
    return false;
  }
}

export function deleteChatMessage(id: number, device_id: string): boolean {
  try {
    const stmt = db.prepare(
      `DELETE FROM chat_history WHERE id = ? AND device_id = ?`,
    );
    const result = stmt.run(id, device_id);
    if (process.env.NODE_ENV === "development") {
      console.log(`Deleted chat message with ID: ${id}`);
      console.table(result);
    }
    return result.changes >= 0;
  } catch (error) {
    console.error("Error deleting chat message:", error);
    return false;
  }
}

export function deleteMultipleChatMessages(ids: number[], device_id: string): boolean {
  try {
    if (!ids || ids.length === 0) return true;
    const placeholders = ids.map(() => '?').join(',');
    const stmt = db.prepare(
      `DELETE FROM chat_history WHERE id IN (${placeholders}) AND device_id = ?`,
    );
    const result = stmt.run(...ids, device_id);
    if (process.env.NODE_ENV === "development") {
      console.log(`Deleted chat messages with IDs: ${ids.join(', ')}`);
      console.table(result);
    }
    return result.changes >= 0;
  } catch (error) {
    console.error("Error deleting multiple chat messages:", error);
    return false;
  }
}

export function deleteAllChatMessages(device_id: string): boolean {
  try {
    const stmt = db.prepare(
      `DELETE FROM chat_history WHERE device_id = ?`,
    );
    const result = stmt.run(device_id);
    if (process.env.NODE_ENV === "development") {
      console.log(`Deleted all chat messages for device: ${device_id}`);
    }
    return result.changes >= 0;
  } catch (error) {
    console.error("Error deleting all chat messages:", error);
    return false;
  }
}


export function getAllDevices() {
  const stmt = db.prepare('SELECT * FROM devices ORDER BY last_active DESC');
  return stmt.all();
}


export function getAllDevicesPublic() {
  const stmt = db.prepare('SELECT device_id, device_name, trust_level, last_active, is_trusted, created_at, profile_image FROM devices ORDER BY last_active DESC');
  return stmt.all();
}

export function getDeviceByIdPublic(device_id: string) {
  const stmt = db.prepare('SELECT device_id, device_name, trust_level, last_active, is_trusted, created_at, profile_image FROM devices WHERE device_id = ?');
  return stmt.get(device_id) as any;
}
export function getDeviceBySessionToken(session_token: string) {
  const stmt = db.prepare('SELECT * FROM devices WHERE session_token = ?');
  const result = stmt.get(session_token) as any;
  return result;
}

interface DeviceInput {
  device_id: string;
  device_name: string;
  session_token: string;
}
export function insertDevice(data: DeviceInput) {
  const now = new Date().toISOString();
  const stmt = db.prepare(`
    INSERT INTO devices (device_id, device_name, session_token, trust_level, last_active, is_trusted)
    VALUES (?, ?, ?, 1, ?, 0)
  `);
  return stmt.run(data.device_id, data.device_name, data.session_token, now);
}

export function updateDeviceLastActive(device_id: string, timestamp?: string) {
  const ts = timestamp || new Date().toISOString();
  try {
    const stmt = db.prepare(`UPDATE devices SET last_active = ? WHERE device_id = ?`);
    return stmt.run(ts, device_id);
  } catch (err) {
    console.error("[DB] Failed to update device last_active:", err);
  }
}

export function updateDeviceProfileImage(device_id: string, profile_image: string) {
  const stmt = db.prepare(`UPDATE devices SET profile_image = ? WHERE device_id = ?`);
  return stmt.run(profile_image, device_id);
}


export function updateDeviceName(device_id: string, device_name: string) {
  const stmt = db.prepare(`UPDATE devices SET device_name = ? WHERE device_id = ?`);
  return stmt.run(device_name, device_id);
}

export function updateDeviceProfile(device_id: string, updates: { device_name?: string; profile_image?: string }) {
  if (updates.device_name && updates.profile_image) {
    const stmt = db.prepare(`UPDATE devices SET device_name = ?, profile_image = ? WHERE device_id = ?`);
    return stmt.run(updates.device_name, updates.profile_image, device_id);
  } else if (updates.device_name) {
    const stmt = db.prepare(`UPDATE devices SET device_name = ? WHERE device_id = ?`);
    return stmt.run(updates.device_name, device_id);
  } else if (updates.profile_image) {
    const stmt = db.prepare(`UPDATE devices SET profile_image = ? WHERE device_id = ?`);
    return stmt.run(updates.profile_image, device_id);
  }
}

export function deleteDevice(deviceId: string) {
  try {
    // 1. Find all files associated with this device to clean them up from disk
    const findFilesStmt = db.prepare("SELECT file_path FROM chat_history WHERE device_id = ? AND file_path IS NOT NULL AND file_path != ''");
    const files = findFilesStmt.all(deviceId) as { file_path: string }[];
    
    files.forEach(row => {
      try {
        safeUnlinkUpload(row.file_path);
      } catch (err) {
        console.error("Failed to delete orphaned file:", row.file_path, err);
      }
    });

    // 2. Delete associated chat history
    const delChat = db.prepare('DELETE FROM chat_history WHERE device_id = ?');
    delChat.run(deviceId);

    // 3. Delete the device
    const stmt = db.prepare('DELETE FROM devices WHERE device_id = ?');
    return stmt.run(deviceId);
  } catch (err) {
    console.error("Error in deleteDevice:", err);
    throw err;
  }
}

// ── Pending Actions (clear-chat queue) ────────────────────────────────────

function ensurePendingActionsTable() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS pending_actions (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id   TEXT    NOT NULL,
      action_type TEXT    NOT NULL,
      payload     TEXT,
      created_at  INTEGER NOT NULL,
      applied     INTEGER DEFAULT 0
    );
  `);
}

export function insertPendingAction(device_id: string, action_type: string, payload: string) {
  ensurePendingActionsTable();
  const stmt = db.prepare(
    `INSERT INTO pending_actions (device_id, action_type, payload, created_at) VALUES (?, ?, ?, ?)`
  );
  return stmt.run(device_id, action_type, payload, Date.now());
}

export function getPendingActions(device_id: string) {
  ensurePendingActionsTable();
  const stmt = db.prepare(
    `SELECT * FROM pending_actions WHERE device_id = ? AND applied = 0 ORDER BY created_at ASC`
  );
  return stmt.all(device_id) as any[];
}

export function markActionApplied(action_id: number, device_id: string): { changes: number } {
  ensurePendingActionsTable();
  if (!Number.isSafeInteger(action_id) || action_id <= 0 || !device_id || typeof device_id !== "string") {
    return { changes: 0 };
  }
  const stmt = db.prepare(`UPDATE pending_actions SET applied = 1 WHERE id = ? AND device_id = ? AND applied = 0`);
  return stmt.run(action_id, device_id);
}

export function clearPendingActionsForDevice(device_id: string): void {
  ensurePendingActionsTable();
  db.prepare(`DELETE FROM pending_actions WHERE device_id = ?`).run(device_id);
}

export function isDeviceRegistered(deviceId: string): boolean {
  if (!deviceId || typeof deviceId !== "string") return false;
  const row = db.prepare(`SELECT 1 FROM devices WHERE device_id = ?`).get(deviceId);
  return !!row;
}

export function getSetting(key: string) {
  const stmt = db.prepare('SELECT value FROM settings WHERE key = ?');
  const result = stmt.get(key) as { value: string } | undefined;
  return result ? result.value : null;
}

export function setSetting(key: string, value: string) {
  const stmt = db.prepare(`
    INSERT INTO settings (key, value) 
    VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `);
  return stmt.run(key, value);
}

export function recordUploadOwner(fileId: string, deviceId: string) {
  if (!isValidUploadFilename(fileId) || !getDeviceByIdPublic(deviceId)) throw new Error("Invalid upload owner");
  db.prepare("INSERT INTO upload_ownership (file_id, device_id) VALUES (?, ?)").run(fileId, deviceId);
}

export function getUploadOwner(fileId: string): string | undefined {
  const row = db.prepare(`SELECT u.device_id FROM upload_ownership u
    JOIN devices d ON d.device_id = u.device_id WHERE u.file_id = ?`).get(fileId) as { device_id: string } | undefined;
  return row?.device_id;
}
