import Database from "better-sqlite3";

const db_path = process.env.DB_PATH;

const db = new Database(db_path);

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
        );
            
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
            FOREIGN KEY (device_id) REFERENCES devices(device_id) 
        );

        CREATE TABLE IF NOT EXISTS settings (
            key   TEXT PRIMARY KEY,
            value TEXT            
        );`,
    );
  } catch (error) {
    console.error("Error connecting to the database:", error);
  }
}

export function getChatByDeviceId(device_id: string) {
  try {
    const stmt = db.prepare(
      `SELECT * FROM chat_history WHERE device_id = ? ORDER BY timestamp DESC`,
    );
    const rows = stmt.all(device_id);
    return rows;
  } catch (error) {
    console.error("Error fetching chat history:", error);
    return [];
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
}

export function insertChatMessage(data: chatMessageInput) {
  try {
    const stmt = db.prepare(
      `INSERT INTO chat_history (device_id, sender, content_type, content, file_path, preview_data, is_view_once) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );
    const result = stmt.run(
      data.device_id,
      data.sender,
      data.content_type,
      data.content || null,
      data.file_path || null,
      data.preview_data || null,
      data.is_view_once ? 1 : 0,
    );
    if (process.env.NODE_ENV === "development") {
      console.log("Inserted chat message with ID:", result.lastInsertRowid);
      console.log("This is the result ");
      console.table(result);
    }
    return { id: result.lastInsertRowid, ...data };
  } catch (error) {
    console.error("Error inserting chat message:", error);
  }
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

export function deleteChatMessage(id: number, device_id: string) {
  try {
    const stmt = db.prepare(
      `DELETE FROM chat_history WHERE id = ? AND device_id = ?`,
    );
    const result = stmt.run(id, device_id);
    if (process.env.NODE_ENV === "development") {
      console.log(`Deleted chat message with ID: ${id}`);
      console.table(result);
    }
    return result.changes > 0;
  } catch (error) {
    console.error("Error deleting chat message:", error);
    return false;
  }
}

export function deleteMultipleChatMessages(ids: number[], device_id: string) {
  try {
    const placeholders = ids.map(() => '?').join(',');
    const stmt = db.prepare(
      `DELETE FROM chat_history WHERE id IN (${placeholders}) AND device_id = ?`,
    );
    const result = stmt.run(...ids, device_id);
    if (process.env.NODE_ENV === "development") {
      console.log(`Deleted chat messages with IDs: ${ids.join(', ')}`);
      console.table(result);
    }
    return result.changes > 0;
  } catch (error) {
    console.error("Error deleting multiple chat messages:", error);
    return false;
  }
}


export function getAllDevices() {
  const stmt = db.prepare('SELECT * FROM devices');
  return stmt.all();
}
interface DeviceInput {
  device_id: string;
  device_name: string;
  session_token: string;
}
export function insertDevice(data:DeviceInput) {
  const stmt = db.prepare(`
    INSERT INTO devices (device_id, device_name, session_token, trust_level, last_active, is_trusted)
    VALUES (@device_id, @device_name, @session_token, 1, CURRENT_TIMESTAMP, 0)
  `);
  return stmt.run(data);
}

export function deleteDevice(deviceId: string) {
  const stmt = db.prepare('DELETE FROM devices WHERE device_id = ?');
  return stmt.run(deviceId);
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