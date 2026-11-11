import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

/**
 * Workbox read model. The database is a cache, never a record: every row
 * is derivable from verified signed events carried by Git. Deleting the
 * DB and re-indexing is a supported, expected operation.
 */
export function dbPath(): string {
  return process.env.WORKBOX_DB_PATH ?? resolve(process.cwd(), ".workbox/index.db");
}

export interface IndexOutcome {
  events: number;
  verified: number;
  unverified: number;
  issues: number;
  errors: string[];
}

export function openDb(path = dbPath()): DatabaseSync {
  mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA synchronous = NORMAL");
  db.exec("PRAGMA foreign_keys = ON");
  migrate(db);
  return db;
}

function migrate(db: DatabaseSync): void {
  db.exec(`
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  repo_path TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  last_indexed_at TEXT,
  snapshot TEXT
);
CREATE TABLE IF NOT EXISTS actors (
  project_id TEXT NOT NULL REFERENCES projects(id),
  fingerprint TEXT NOT NULL,
  display_name TEXT NOT NULL DEFAULT '',
  public_key TEXT NOT NULL DEFAULT '',
  chain_head TEXT NOT NULL DEFAULT '',
  event_count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (project_id, fingerprint)
);
CREATE TABLE IF NOT EXISTS events (
  project_id TEXT NOT NULL REFERENCES projects(id),
  event_id TEXT NOT NULL,
  commit_sha TEXT NOT NULL,
  actor TEXT NOT NULL,
  kind TEXT NOT NULL,
  sequence INTEGER,
  timestamp TEXT,
  subject TEXT,
  intent TEXT,
  parents_json TEXT NOT NULL DEFAULT '[]',
  verified INTEGER NOT NULL DEFAULT 0,
  verify_error TEXT,
  payload_json TEXT NOT NULL,
  protocol TEXT NOT NULL DEFAULT 'collab',
  PRIMARY KEY (project_id, event_id)
);
CREATE INDEX IF NOT EXISTS idx_events_subject ON events(project_id, subject);
CREATE INDEX IF NOT EXISTS idx_events_time ON events(project_id, timestamp DESC);
CREATE TABLE IF NOT EXISTS issues (
  project_id TEXT NOT NULL REFERENCES projects(id),
  issue_id TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open',
  creator TEXT NOT NULL,
  created_at TEXT,
  updated_at TEXT,
  conflict INTEGER NOT NULL DEFAULT 0,
  labels_json TEXT NOT NULL DEFAULT '[]',
  assignees_json TEXT NOT NULL DEFAULT '[]',
  number INTEGER,
  PRIMARY KEY (project_id, issue_id)
);
CREATE TABLE IF NOT EXISTS issue_comments (
  project_id TEXT NOT NULL REFERENCES projects(id),
  issue_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  actor TEXT NOT NULL,
  body TEXT NOT NULL,
  timestamp TEXT,
  verified INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (project_id, event_id)
);
CREATE TABLE IF NOT EXISTS memories (
  project_id TEXT NOT NULL REFERENCES projects(id),
  memory_id TEXT NOT NULL,
  actor TEXT NOT NULL,
  stream TEXT NOT NULL,
  sequence INTEGER,
  timestamp TEXT,
  kind TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  anchor_commit TEXT,
  applicability TEXT NOT NULL DEFAULT '',
  lifecycle TEXT NOT NULL DEFAULT 'active',
  handoff_json TEXT,
  verified INTEGER NOT NULL DEFAULT 0,
  payload_json TEXT NOT NULL,
  PRIMARY KEY (project_id, memory_id)
);
CREATE INDEX IF NOT EXISTS idx_memories_stream ON memories(project_id, stream, sequence);
CREATE TABLE IF NOT EXISTS activity (
  project_id TEXT NOT NULL REFERENCES projects(id),
  event_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  actor TEXT NOT NULL,
  actor_name TEXT NOT NULL DEFAULT '',
  timestamp TEXT,
  subject TEXT,
  summary TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (project_id, event_id)
);
CREATE INDEX IF NOT EXISTS idx_activity_time ON activity(timestamp DESC);
`);
}
