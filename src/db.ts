import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import type { AppConfig } from './config.js';
import type { IdentityAnchorType } from './types.js';
import { ALL_AXES } from './axes.js';

export type Db = DatabaseSync;

// 约定 3：标准 SQL，schema 可平迁 Postgres；node:sqlite 零原生编译，Windows/Linux 通吃
const schema = `
CREATE TABLE IF NOT EXISTS identities (
  id TEXT PRIMARY KEY,
  anchor_type TEXT NOT NULL CHECK (anchor_type IN ('account','nfc_uid','device')),
  anchor_value TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (anchor_type, anchor_value)
);

CREATE TABLE IF NOT EXISTS relationships (
  id TEXT PRIMARY KEY,
  identity_id TEXT NOT NULL REFERENCES identities(id),
  character_id TEXT NOT NULL,
  persona_version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (identity_id, character_id)
);

CREATE TABLE IF NOT EXISTS episodes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  relationship_id TEXT NOT NULL REFERENCES relationships(id),
  turn_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user','assistant')),
  content TEXT NOT NULL,
  routing TEXT NOT NULL DEFAULT 'pending' CHECK (routing IN ('skip','new','update','pending')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_episodes_rel ON episodes (relationship_id, id);

CREATE TABLE IF NOT EXISTS summaries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  relationship_id TEXT NOT NULL REFERENCES relationships(id),
  content TEXT NOT NULL,
  source_from TEXT,
  source_to TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_summaries_rel ON summaries (relationship_id, id);

-- 成长轴：选项待定（docs/schema-design.md A/B/C），通用轴表对三个选项都兼容
CREATE TABLE IF NOT EXISTS growth_axes (
  relationship_id TEXT NOT NULL REFERENCES relationships(id),
  axis_key TEXT NOT NULL,
  label TEXT NOT NULL,
  value REAL NOT NULL DEFAULT 0.5,
  floor REAL NOT NULL DEFAULT 0,
  ceiling REAL NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (relationship_id, axis_key)
);

-- persona_lora → base_model_version 外键（决策 11）
CREATE TABLE IF NOT EXISTS persona_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  relationship_id TEXT NOT NULL REFERENCES relationships(id),
  version INTEGER NOT NULL,
  lora_path TEXT,
  base_model_version TEXT NOT NULL,
  source_summary_ids TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (relationship_id, version)
);
`;

export function openDb(cfg: AppConfig): Db {
  const db = new DatabaseSync(cfg.dbPath);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec(schema);
  return db;
}

function rowId(db: Db, sql: string, ...args: (string | number)[]): string {
  const row = db.prepare(sql).get(...args) as { id: string } | undefined;
  if (!row) throw new Error(`row not found: ${sql}`);
  return row.id;
}

/** M1 便捷入口：account 锚点幂等获取或创建关系 */
export function getOrCreateRelationship(
  db: Db,
  characterId: string,
  anchorValue = 'dev',
  anchorType: IdentityAnchorType = 'account',
): { identityId: string; relationshipId: string } {
  db.prepare(
    `INSERT INTO identities (id, anchor_type, anchor_value) VALUES (?, ?, ?)
     ON CONFLICT (anchor_type, anchor_value) DO NOTHING`,
  ).run(randomUUID(), anchorType, anchorValue);
  const identityId = rowId(
    db,
    `SELECT id FROM identities WHERE anchor_type = ? AND anchor_value = ?`,
    anchorType,
    anchorValue,
  );

  db.prepare(
    `INSERT INTO relationships (id, identity_id, character_id) VALUES (?, ?, ?)
     ON CONFLICT (identity_id, character_id) DO NOTHING`,
  ).run(randomUUID(), identityId, characterId);
  const relationshipId = rowId(
    db,
    `SELECT id FROM relationships WHERE identity_id = ? AND character_id = ?`,
    identityId,
    characterId,
  );

  return { identityId, relationshipId };
}

/** 新关系首次建立时写入成长轴初始值（C 方案：5 底子轴 + 3 关系轴） */
export function seedAxes(db: Db, relationshipId: string): void {
  const ins = db.prepare(
    `INSERT INTO growth_axes (relationship_id, axis_key, label, value, floor, ceiling)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (relationship_id, axis_key) DO NOTHING`,
  );
  for (const a of ALL_AXES) ins.run(relationshipId, a.key, a.label, a.init, a.floor, a.ceiling);
}
