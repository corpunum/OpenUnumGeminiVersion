import { Database } from "bun:sqlite";

export interface MemoryEntry {
  id?: number;
  session_id: string;
  role: string;
  content: string;
  timestamp: number;
}

export interface Tactic {
  id?: number;
  objective: string;
  action: string;
  outcome: string;
  success: boolean;
  learning: string;
  timestamp: number;
}

export class MemoryManager {
  private db: Database;

  constructor(dbPath: string = "openunum.db") {
    this.db = new Database(dbPath);
    this.init();
  }

  getDatabase(): Database {
    return this.db;
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
    // Wisdom table for long-term pattern storage
    this.db.run(`
      CREATE TABLE IF NOT EXISTS wisdom (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        pattern TEXT,
        solution TEXT,
        score INTEGER DEFAULT 1,
        last_used DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }

  addMessage(session_id: string, role: string, content: string) {
    this.db.run(
      "INSERT INTO messages (session_id, role, content) VALUES (?, ?, ?)",
      [session_id, role, content]
    );
  }

  addTactic(objective: string, action: string, outcome: string, success: boolean, learning: string = "") {
    this.db.run(
      "INSERT INTO tactics (objective, action, outcome, success, learning) VALUES (?, ?, ?, ?, ?)",
      [objective, action, outcome, success ? 1 : 0, learning]
    );
  }

  /**
   * Smart Retrieval: Find tactics that match keywords in the objective.
   */
  searchTactics(query: string, limit: number = 5): Tactic[] {
    const keywords = query.toLowerCase().split(/\s+/).filter(k => k.length > 3);
    if (keywords.length === 0) return this.getAllTactics().slice(0, limit);

    const conditions = keywords.map(() => "objective LIKE ?").join(" OR ");
    const params = keywords.map(k => `%${k}%`);

    const rows = this.db.query(`SELECT * FROM tactics WHERE ${conditions} ORDER BY success DESC, timestamp DESC LIMIT ?`).all(...params, limit);
    return rows.map((r: any) => ({
      ...r,
      success: !!r.success,
      timestamp: new Date(r.timestamp).getTime()
    }));
  }

  getAllTactics(): Tactic[] {
    const rows = this.db.query("SELECT * FROM tactics ORDER BY timestamp DESC LIMIT 100").all();
    return rows.map((r: any) => ({
      ...r,
      success: !!r.success,
      timestamp: new Date(r.timestamp).getTime()
    }));
  }

  getMessages(session_id: string, limit: number = 50): MemoryEntry[] {
    return this.db.query("SELECT * FROM messages WHERE session_id = ? ORDER BY timestamp DESC LIMIT ?").all(session_id, limit).reverse() as MemoryEntry[];
  }

  clearMessages(session_id: string) {
    this.db.run("DELETE FROM messages WHERE session_id = ?", [session_id]);
  }

  set(key: string, value: string) {
    this.db.run("INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)", [key, value]);
  }

  get(key: string): string | null {
    const res = this.db.query("SELECT value FROM kv WHERE key = ?").get(key) as { value: string } | null;
    return res ? res.value : null;
  }
}
