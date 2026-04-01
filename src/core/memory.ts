import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import os from "node:os";

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

  static defaultDbPath(): string {
    const home = process.env.OPENUNUM_GEMINI_HOME || join(os.homedir(), ".openunum-gemini");
    return join(home, "openunum.db");
  }

  constructor(dbPath: string = MemoryManager.defaultDbPath()) {
    mkdirSync(dirname(dbPath), { recursive: true });
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
      CREATE TABLE IF NOT EXISTS sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT UNIQUE,
        title TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
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

  // ConfigManager requires these methods
  get(key: string): string | undefined {
    const row = this.db.query("SELECT value FROM kv WHERE key = ?").get(key) as { value: string } | undefined;
    return row?.value;
  }

  set(key: string, value: string): void {
    this.db.run("INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)", [key, value]);
  }

  addMessage(session_id: string, role: string, content: string) {
    this.db.run(
      "INSERT INTO messages (session_id, role, content) VALUES (?, ?, ?)",
      [session_id, role, content]
    );
    // Ensure session exists in sessions table
    this.db.run(
      "INSERT OR IGNORE INTO sessions (session_id, title) VALUES (?, ?)",
      [session_id, "New Chat"]
    );
  }

  createSession(session_id: string, title: string = "New Chat") {
    this.db.run(
      "INSERT OR REPLACE INTO sessions (session_id, title) VALUES (?, ?)",
      [session_id, title]
    );
  }

  updateSessionTitle(session_id: string, title: string) {
    this.db.run(
      "UPDATE sessions SET title = ? WHERE session_id = ?",
      [title, session_id]
    );
  }

  getSessions() {
    return this.db.query("SELECT session_id, title, created_at FROM sessions ORDER BY created_at DESC").all() as Array<{ session_id: string, title: string, created_at: string }>;
  }

  getMessages(session_id: string, limit: number = 50): Array<{ role: string; content: string; timestamp: string }> {
    return this.db.query(
      "SELECT role, content, timestamp FROM messages WHERE session_id = ? ORDER BY id DESC LIMIT ?"
    ).all(session_id, limit) as Array<{ role: string; content: string; timestamp: string }>;
  }

  addTactic(objective: string, action: string, outcome: string, success: boolean, learning: string = "") {
    this.db.run(
      "INSERT INTO tactics (objective, action, outcome, success, learning) VALUES (?, ?, ?, ?, ?)",
      [objective, action, outcome, success ? 1 : 0, learning]
    );
  }

  getSimilarTactics(objective: string, limit: number = 3): Array<{ action: string; outcome: string; success: number; learning: string }> {
    const keywords = objective.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    if (keywords.length === 0) return [];
    const pattern = keywords.join("%");
    return this.db.query(
      `SELECT action, outcome, success, learning FROM tactics 
       WHERE objective LIKE ? ORDER BY success DESC, timestamp DESC LIMIT ?`
    ).all(`%${pattern}%`, limit) as Array<{ action: string; outcome: string; success: number; learning: string }>;
  }

  searchTactics(objective: string, limit: number = 3): Array<{ action: string; outcome: string; success: number; learning: string }> {
    return this.getSimilarTactics(objective, limit);
  }

  close() {
    this.db.close();
  }
}
