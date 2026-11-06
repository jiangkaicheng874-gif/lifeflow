import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

export function openDatabase(path: string) {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");
  const version = db.pragma("user_version", { simple: true }) as number;
  if (version > 1) {
    db.close();
    throw new Error("Database schema is newer than this application.");
  }
  db.transaction(() => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS profiles (
        id TEXT PRIMARY KEY, name TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS events (
        id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES profiles(id),
        title TEXT NOT NULL, starts_at TEXT NOT NULL, ends_at TEXT NOT NULL,
        version INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
        CHECK (starts_at < ends_at)
      );
      CREATE INDEX IF NOT EXISTS events_owner_time ON events(owner_id, starts_at, ends_at);
      PRAGMA user_version = 1;
    `);
    if (!db.prepare("SELECT id FROM profiles LIMIT 1").get()) {
      db.prepare("INSERT INTO profiles (id, name) VALUES (?, ?)").run(
        randomUUID(),
        "本地用户",
      );
    }
  })();
  return db;
}
