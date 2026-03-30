import { Database } from "bun:sqlite";

export interface MemoryEntry {
  id?: number;
  session_id: string;
  role: string;
  content: string;
  timestamp: number;
}

export class MemoryManager {
  private db: Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.init();
  }

  private init() {
    this.db.run(`
      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT,
        role TEXT,
        content TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    this.db.run(`
      CREATE TABLE IF NOT EXISTS kv (
        key TEXT PRIMARY KEY,
        value TEXT
      )
    `);
    this.db.run(`
      CREATE TABLE IF NOT EXISTS tactics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        objective TEXT,
        action TEXT,
        outcome TEXT,
        success BOOLEAN,
        learning TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }

  addMessage(session_id: string, role: string, content: string) {
    this.db.run(
      "INSERT INTO messages (session_id, role, content) VALUES (?, ?, ?)",
      [session_id, role, content]
    );
  }

  addTactic(objective: string, action: string, outcome: string, success: boolean, learning: string) {
    this.db.run(
      "INSERT INTO tactics (objective, action, outcome, success, learning) VALUES (?, ?, ?, ?, ?)",
      [objective, action, outcome, success ? 1 : 0, learning]
    );
  }

  getTactics(objective: string): any[] {
    return this.db.query("SELECT * FROM tactics WHERE objective LIKE ? ORDER BY timestamp DESC LIMIT 5")
      .all(`%${objective}%`);
  }

  getAllTactics(): any[] {
    return this.db.query("SELECT * FROM tactics ORDER BY timestamp DESC LIMIT 20").all();
  }

  getMessages(session_id: string): MemoryEntry[] {
    return this.db.query("SELECT * FROM messages WHERE session_id = ?").all(session_id) as MemoryEntry[];
  }

  set(key: string, value: string) {
    this.db.run("INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)", [key, value]);
  }

  get(key: string): string | null {
    const res = this.db.query("SELECT value FROM kv WHERE key = ?").get(key) as { value: string } | null;
    return res ? res.value : null;
  }
}
