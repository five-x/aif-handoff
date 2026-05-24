import { mkdirSync } from "fs";
import { dirname, resolve } from "path";
import Database from "better-sqlite3";
import { drizzle, BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema.js";
import { logger } from "./logger.js";
import { findMonorepoRootFromUrl } from "./monorepoRoot.js";

const log = logger("db");

let _db: BetterSQLite3Database<typeof schema> | null = null;
let _sqlite: Database.Database | null = null;

const MONOREPO_ROOT = findMonorepoRootFromUrl(import.meta.url);

/** Resolve DB path relative to the monorepo root. */
function resolveDbPath(raw: string): string {
  if (raw === ":memory:" || raw.startsWith("/")) return raw;
  return resolve(MONOREPO_ROOT, raw);
}

export function getDb(url?: string): BetterSQLite3Database<typeof schema> {
  if (_db) return _db;

  const dbPath = resolveDbPath(url ?? process.env.DATABASE_URL ?? "./data/aif.sqlite");
  mkdirSync(dirname(dbPath), { recursive: true });
  log.debug({ dbPath }, "Opening database connection");

  _sqlite = new Database(dbPath);
  _sqlite.pragma("journal_mode = WAL");
  _sqlite.pragma("foreign_keys = ON");
  ensureTables(_sqlite);

  _db = drizzle(_sqlite, { schema });
  log.info({ dbPath }, "Database connected");

  return _db;
}

/** Create tables if they don't exist. */
function ensureTables(sqlite: Database.Database): void {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      root_path TEXT NOT NULL,
      planner_max_budget_usd REAL,
      plan_checker_max_budget_usd REAL,
      implementer_max_budget_usd REAL,
      review_sidecar_max_budget_usd REAL,
      parallel_enabled INTEGER NOT NULL DEFAULT 0,
      auto_queue_mode INTEGER NOT NULL DEFAULT 0,
      default_task_runtime_profile_id TEXT,
      default_plan_runtime_profile_id TEXT,
      default_review_runtime_profile_id TEXT,
      default_chat_runtime_profile_id TEXT,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    )
  `);
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS app_settings (
      id INTEGER PRIMARY KEY NOT NULL DEFAULT 1,
      default_task_runtime_profile_id TEXT,
      default_plan_runtime_profile_id TEXT,
      default_review_runtime_profile_id TEXT,
      default_chat_runtime_profile_id TEXT,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    )
  `);
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      attachments TEXT NOT NULL DEFAULT '[]',
      auto_mode INTEGER NOT NULL DEFAULT 1,
      task_intent TEXT NOT NULL DEFAULT 'general',
      is_fix INTEGER NOT NULL DEFAULT 0,
      planner_mode TEXT NOT NULL DEFAULT 'fast',
      plan_path TEXT NOT NULL DEFAULT '.ai-factory/PLAN.md',
      source_ref TEXT,
      plan_docs INTEGER NOT NULL DEFAULT 0,
      plan_tests INTEGER NOT NULL DEFAULT 0,
      skip_review INTEGER NOT NULL DEFAULT 0,
      use_subagents INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'backlog',
      priority INTEGER NOT NULL DEFAULT 0,
      position REAL NOT NULL DEFAULT 1000.0,
      parent_task_id TEXT,
      root_task_id TEXT,
      hierarchy_depth INTEGER NOT NULL DEFAULT 0,
      hierarchy_role TEXT NOT NULL DEFAULT 'executable',
      hierarchy_position REAL NOT NULL DEFAULT 1000.0,
      parent_closeout_policy TEXT,
      plan TEXT,
      implementation_log TEXT,
      implementation_manifest_json TEXT,
      review_comments TEXT,
      agent_activity_log TEXT,
      blocked_reason TEXT,
      blocked_from_status TEXT,
      retry_after TEXT,
      retry_count INTEGER NOT NULL DEFAULT 0,
      token_input INTEGER NOT NULL DEFAULT 0,
      token_output INTEGER NOT NULL DEFAULT 0,
      token_total INTEGER NOT NULL DEFAULT 0,
      cost_usd REAL NOT NULL DEFAULT 0,
      roadmap_alias TEXT,
      tags TEXT NOT NULL DEFAULT '[]',
      rework_requested INTEGER NOT NULL DEFAULT 0,
      review_iteration_count INTEGER NOT NULL DEFAULT 0,
      max_review_iterations INTEGER NOT NULL DEFAULT 100,
      manual_review_required INTEGER NOT NULL DEFAULT 0,
      auto_review_state_json TEXT,
      paused INTEGER NOT NULL DEFAULT 0,
      last_heartbeat_at TEXT,
      last_synced_at TEXT,
      runtime_profile_id TEXT,
      model_override TEXT,
      runtime_options_json TEXT,
      session_id TEXT,
      runtime_limit_snapshot_json TEXT,
      runtime_limit_updated_at TEXT,
      locked_by TEXT,
      locked_until TEXT,
      lock_stage TEXT,
      coordinator_id TEXT,
      scheduled_at TEXT,
      branch_name TEXT,
      worktree_path TEXT,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    )
  `);
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS task_comments (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      author TEXT NOT NULL DEFAULT 'human',
      message TEXT NOT NULL,
      attachments TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS roadmap_batches (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      roadmap_alias TEXT NOT NULL,
      task_intent TEXT NOT NULL DEFAULT 'general',
      status TEXT NOT NULL DEFAULT 'expected',
      execution_policy TEXT NOT NULL DEFAULT 'serialized_shared_checkout',
      synthesis_task_id TEXT,
      expected_artifact_count INTEGER NOT NULL DEFAULT 0,
      valid_artifact_count INTEGER NOT NULL DEFAULT 0,
      invalid_artifact_count INTEGER NOT NULL DEFAULT 0,
      missing_artifact_count INTEGER NOT NULL DEFAULT 0,
      external_blocked_artifact_count INTEGER NOT NULL DEFAULT 0,
      synthesis_ready INTEGER NOT NULL DEFAULT 0,
      failure_family TEXT,
      summary_json TEXT,
      created_task_ids_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    )
  `);
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS roadmap_batch_artifacts (
      id TEXT PRIMARY KEY,
      batch_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      roadmap_alias TEXT NOT NULL,
      task_id TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'report',
      artifact_path TEXT NOT NULL,
      state TEXT NOT NULL DEFAULT 'expected',
      failure_family TEXT,
      validation_details_json TEXT,
      branch_name TEXT,
      worktree_path TEXT,
      project_root TEXT,
      content_sha TEXT,
      attempt_number INTEGER NOT NULL DEFAULT 0,
      attempt_boundary_id TEXT,
      failure_signature TEXT,
      validated_at TEXT,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    )
  `);
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS roadmap_batch_artifact_attempts (
      id TEXT PRIMARY KEY,
      artifact_id TEXT NOT NULL,
      batch_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      roadmap_alias TEXT NOT NULL,
      task_id TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'report',
      artifact_path TEXT NOT NULL,
      attempt_number INTEGER NOT NULL,
      attempt_boundary_id TEXT,
      state TEXT NOT NULL,
      classification TEXT,
      failure_family TEXT,
      failure_signature TEXT,
      content_sha TEXT,
      rework_status TEXT NOT NULL DEFAULT 'not_applicable',
      validation_details_json TEXT,
      source_snapshot_id TEXT,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    )
  `);
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS audit_evidence_events (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      audit_plan_id TEXT NOT NULL,
      source_snapshot_id TEXT NOT NULL,
      tool_name TEXT NOT NULL,
      evidence_kind TEXT NOT NULL,
      evidence_grade TEXT NOT NULL,
      scope_ids_json TEXT NOT NULL DEFAULT '[]',
      risk_hypothesis_ids_json TEXT NOT NULL DEFAULT '[]',
      path_hashes_json TEXT NOT NULL DEFAULT '[]',
      path_range_hashes_json TEXT NOT NULL DEFAULT '[]',
      command_json TEXT,
      exit_code INTEGER,
      output_sha256 TEXT,
      output_preview TEXT,
      output_preview_truncated INTEGER NOT NULL DEFAULT 0,
      parsed_summary_json TEXT,
      redaction_status TEXT NOT NULL DEFAULT 'clean',
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    )
  `);
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS config_audit_events (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      task_id TEXT,
      runtime_profile_id TEXT,
      action TEXT NOT NULL,
      source_kind TEXT NOT NULL,
      actor TEXT,
      reason_codes_json TEXT NOT NULL DEFAULT '[]',
      before_json TEXT,
      after_json TEXT,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    )
  `);
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS runtime_profiles (
      id TEXT PRIMARY KEY,
      project_id TEXT,
      name TEXT NOT NULL,
      runtime_id TEXT NOT NULL,
      provider_id TEXT NOT NULL,
      transport TEXT,
      base_url TEXT,
      api_key_env_var TEXT,
      default_model TEXT,
      headers_json TEXT NOT NULL DEFAULT '{}',
      options_json TEXT NOT NULL DEFAULT '{}',
      enabled INTEGER NOT NULL DEFAULT 1,
      runtime_limit_snapshot_json TEXT,
      runtime_limit_updated_at TEXT,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    )
  `);
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS chat_sessions (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT 'New Chat',
      agent_session_id TEXT,
      runtime_profile_id TEXT,
      runtime_session_id TEXT,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    )
  `);
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS chat_messages (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      attachments TEXT,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    )
  `);
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS usage_events (
      id TEXT PRIMARY KEY,
      source TEXT NOT NULL,
      project_id TEXT,
      task_id TEXT,
      chat_session_id TEXT,
      runtime_id TEXT NOT NULL,
      provider_id TEXT NOT NULL,
      profile_id TEXT,
      transport TEXT,
      workflow_kind TEXT,
      usage_reporting TEXT NOT NULL,
      outcome TEXT NOT NULL DEFAULT 'success',
      error_category TEXT,
      input_tokens INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0,
      total_tokens INTEGER NOT NULL DEFAULT 0,
      cost_usd REAL,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    )
  `);
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS memory_items (
      id TEXT PRIMARY KEY,
      project_id TEXT,
      scope TEXT NOT NULL DEFAULT 'project',
      source_task_id TEXT,
      source_kind TEXT NOT NULL DEFAULT 'task',
      source_ref TEXT,
      item_type TEXT NOT NULL DEFAULT 'architecture_note',
      failure_family TEXT,
      claims_json TEXT NOT NULL DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'pending',
      redaction_status TEXT NOT NULL DEFAULT 'clean',
      publish_block_reason TEXT,
      review_note TEXT,
      title TEXT NOT NULL,
      summary TEXT NOT NULL,
      content TEXT NOT NULL,
      tags_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      approved_at TEXT,
      rejected_at TEXT,
      expired_at TEXT,
      expires_at TEXT
    )
  `);
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS memory_usage_events (
      id TEXT PRIMARY KEY,
      memory_item_id TEXT NOT NULL,
      project_id TEXT,
      task_id TEXT,
      chat_session_id TEXT,
      workflow_kind TEXT NOT NULL,
      source TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    )
  `);
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS memory_lifecycle_events (
      id TEXT PRIMARY KEY,
      memory_item_id TEXT NOT NULL,
      action TEXT NOT NULL,
      actor TEXT,
      note TEXT,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    )
  `);
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS runtime_warmup_sessions (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      runtime_profile_id TEXT,
      runtime_id TEXT NOT NULL,
      provider_id TEXT NOT NULL,
      transport TEXT,
      model TEXT,
      stage TEXT,
      source_session_id TEXT,
      status TEXT NOT NULL DEFAULT 'creating',
      ttl_seconds INTEGER NOT NULL,
      expires_at TEXT NOT NULL,
      summary TEXT,
      error_message TEXT,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    )
  `);
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS codex_sessions (
      session_id TEXT PRIMARY KEY,
      file_path TEXT NOT NULL UNIQUE,
      title TEXT,
      project_root TEXT,
      account_fingerprint TEXT,
      source_created_at TEXT,
      source_updated_at TEXT,
      message_count INTEGER NOT NULL DEFAULT 0,
      preview_text TEXT,
      size_bytes INTEGER NOT NULL DEFAULT 0,
      mtime_ms INTEGER NOT NULL DEFAULT 0,
      last_indexed_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    )
  `);
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS codex_session_files (
      file_path TEXT PRIMARY KEY,
      session_id TEXT,
      size_bytes INTEGER NOT NULL DEFAULT 0,
      mtime_ms INTEGER NOT NULL DEFAULT 0,
      parsed_offset INTEGER NOT NULL DEFAULT 0,
      pending_tail TEXT NOT NULL DEFAULT '',
      missing INTEGER NOT NULL DEFAULT 0,
      import_version INTEGER NOT NULL DEFAULT 1,
      last_seen_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    )
  `);
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS codex_limit_heads (
      head_key TEXT PRIMARY KEY,
      account_fingerprint TEXT NOT NULL,
      project_root TEXT,
      limit_id TEXT NOT NULL,
      model TEXT,
      source TEXT NOT NULL DEFAULT 'codex',
      snapshot_json TEXT NOT NULL,
      observed_at TEXT NOT NULL,
      session_id TEXT,
      file_path TEXT,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    )
  `);
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS codex_limit_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      head_key TEXT NOT NULL,
      account_fingerprint TEXT NOT NULL,
      project_root TEXT,
      limit_id TEXT NOT NULL,
      model TEXT,
      snapshot_json TEXT NOT NULL,
      observed_at TEXT NOT NULL,
      session_id TEXT,
      file_path TEXT,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    )
  `);
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS codex_index_cursors (
      cursor_key TEXT PRIMARY KEY,
      cursor_value TEXT,
      cursor_json TEXT,
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    )
  `);

  runMigrations(sqlite);
  ensureMemoryFts(sqlite);
  ensureTriggers(sqlite);
  runRuntimeBackfills(sqlite);
  ensureIndexes(sqlite);
}

/**
 * Versioned migration system using SQLite's PRAGMA user_version.
 * Each migration runs once, in order, inside a transaction.
 * Add new migrations to the end of the array — never reorder or remove existing entries.
 */
interface Migration {
  version: number;
  description: string;
  sql: string;
  skipIfMissingColumns?: Array<{
    statementContains: string;
    tableName: string;
    columnName: string;
  }>;
  /** Trigger DDL statements that contain internal semicolons and must be executed whole. */
  triggers?: string[];
}

const MIGRATIONS: Migration[] = [
  // Legacy columns that were added via ensureColumn — consolidated into migrations.
  // These use ensureColumn-style idempotent checks since existing DBs already have them.
  {
    version: 1,
    description: "Add session_id column to tasks for agent session resume",
    sql: "ALTER TABLE tasks ADD COLUMN session_id TEXT",
  },
  {
    version: 2,
    description: "Add chat_sessions and chat_messages tables",
    sql: `
      CREATE TABLE IF NOT EXISTS chat_sessions (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        title TEXT NOT NULL DEFAULT 'New Chat',
        agent_session_id TEXT,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      );
      CREATE TABLE IF NOT EXISTS chat_messages (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      );
    `,
  },
  {
    version: 3,
    description: "Add attachments column to chat_messages",
    sql: "ALTER TABLE chat_messages ADD COLUMN attachments TEXT",
  },
  {
    version: 4,
    description: "Add parallel_enabled column to projects",
    sql: "ALTER TABLE projects ADD COLUMN parallel_enabled INTEGER NOT NULL DEFAULT 0",
  },
  {
    version: 5,
    description: "Add task locking columns for parallel execution",
    sql: `
      ALTER TABLE tasks ADD COLUMN locked_by TEXT;
      ALTER TABLE tasks ADD COLUMN locked_until TEXT;
    `,
  },
  {
    version: 6,
    description: "Add runtime profile persistence and runtime-neutral session columns",
    sql: `
      CREATE TABLE IF NOT EXISTS runtime_profiles (
        id TEXT PRIMARY KEY,
        project_id TEXT,
        name TEXT NOT NULL,
        runtime_id TEXT NOT NULL,
        provider_id TEXT NOT NULL,
        transport TEXT,
        base_url TEXT,
        api_key_env_var TEXT,
        default_model TEXT,
        headers_json TEXT NOT NULL DEFAULT '{}',
        options_json TEXT NOT NULL DEFAULT '{}',
        enabled INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      );
      ALTER TABLE projects ADD COLUMN default_task_runtime_profile_id TEXT;
      ALTER TABLE projects ADD COLUMN default_chat_runtime_profile_id TEXT;
      ALTER TABLE tasks ADD COLUMN runtime_profile_id TEXT;
      ALTER TABLE tasks ADD COLUMN model_override TEXT;
      ALTER TABLE tasks ADD COLUMN runtime_options_json TEXT;
      ALTER TABLE chat_sessions ADD COLUMN runtime_profile_id TEXT;
      ALTER TABLE chat_sessions ADD COLUMN runtime_session_id TEXT;
    `,
  },
  {
    version: 7,
    description: "Add cascade cleanup triggers for runtime_profiles deletion",
    sql: "",
    triggers: [
      `CREATE TRIGGER IF NOT EXISTS trg_runtime_profiles_delete
       AFTER DELETE ON runtime_profiles
       FOR EACH ROW
       BEGIN
         UPDATE tasks SET runtime_profile_id = NULL WHERE runtime_profile_id = OLD.id;
         UPDATE projects SET default_task_runtime_profile_id = NULL WHERE default_task_runtime_profile_id = OLD.id;
         UPDATE projects SET default_chat_runtime_profile_id = NULL WHERE default_chat_runtime_profile_id = OLD.id;
         UPDATE chat_sessions SET runtime_profile_id = NULL WHERE runtime_profile_id = OLD.id;
       END`,
      `CREATE TRIGGER IF NOT EXISTS trg_projects_delete_profiles
       AFTER DELETE ON projects
       FOR EACH ROW
       BEGIN
         DELETE FROM runtime_profiles WHERE project_id = OLD.id;
       END`,
    ],
  },
  {
    version: 8,
    description: "Add per-stage runtime profile columns to projects",
    sql: `
      ALTER TABLE projects ADD COLUMN default_plan_runtime_profile_id TEXT;
      ALTER TABLE projects ADD COLUMN default_review_runtime_profile_id TEXT;
    `,
  },
  {
    version: 9,
    description: "Add usage_events table and per-entity token aggregates (projects, chat_sessions)",
    sql: `
      CREATE TABLE IF NOT EXISTS usage_events (
        id TEXT PRIMARY KEY,
        source TEXT NOT NULL,
        project_id TEXT,
        task_id TEXT,
        chat_session_id TEXT,
        runtime_id TEXT NOT NULL,
        provider_id TEXT NOT NULL,
        profile_id TEXT,
        transport TEXT,
      workflow_kind TEXT,
      usage_reporting TEXT NOT NULL,
      outcome TEXT NOT NULL DEFAULT 'success',
      error_category TEXT,
      input_tokens INTEGER NOT NULL DEFAULT 0,
        output_tokens INTEGER NOT NULL DEFAULT 0,
        total_tokens INTEGER NOT NULL DEFAULT 0,
        cost_usd REAL,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      );
      ALTER TABLE projects ADD COLUMN token_input INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE projects ADD COLUMN token_output INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE projects ADD COLUMN token_total INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE projects ADD COLUMN cost_usd REAL NOT NULL DEFAULT 0;
      ALTER TABLE chat_sessions ADD COLUMN token_input INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE chat_sessions ADD COLUMN token_output INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE chat_sessions ADD COLUMN token_total INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE chat_sessions ADD COLUMN cost_usd REAL NOT NULL DEFAULT 0;
    `,
  },
  // IMPORTANT: version 10 intentionally rewrites upstream's old "backfill-only"
  // migration because a diverged feature branch previously used version 9 for
  // the manual-review schema. DBs that already ran upstream v9/v10 are safe:
  // they already have usage_events and token aggregate columns, so skipping
  // this rewritten v10 is harmless. DBs that reached the diverged feature
  // branch v9 need this reconciliation step before version 11 can land
  // cleanly after the histories merge.
  {
    version: 10,
    description:
      "Reconcile usage-event schema for diverged version-9 histories and backfill project token aggregates",
    sql: `
      CREATE TABLE IF NOT EXISTS usage_events (
        id TEXT PRIMARY KEY,
        source TEXT NOT NULL,
        project_id TEXT,
        task_id TEXT,
        chat_session_id TEXT,
        runtime_id TEXT NOT NULL,
        provider_id TEXT NOT NULL,
        profile_id TEXT,
        transport TEXT,
        workflow_kind TEXT,
        usage_reporting TEXT NOT NULL,
        outcome TEXT NOT NULL DEFAULT 'success',
        error_category TEXT,
        input_tokens INTEGER NOT NULL DEFAULT 0,
        output_tokens INTEGER NOT NULL DEFAULT 0,
        total_tokens INTEGER NOT NULL DEFAULT 0,
        cost_usd REAL,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      );
      ALTER TABLE projects ADD COLUMN token_input INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE projects ADD COLUMN token_output INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE projects ADD COLUMN token_total INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE projects ADD COLUMN cost_usd REAL NOT NULL DEFAULT 0;
      ALTER TABLE chat_sessions ADD COLUMN token_input INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE chat_sessions ADD COLUMN token_output INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE chat_sessions ADD COLUMN token_total INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE chat_sessions ADD COLUMN cost_usd REAL NOT NULL DEFAULT 0;
      UPDATE projects
      SET
        token_input  = token_input  + coalesce((SELECT sum(token_input)  FROM tasks WHERE tasks.project_id = projects.id), 0),
        token_output = token_output + coalesce((SELECT sum(token_output) FROM tasks WHERE tasks.project_id = projects.id), 0),
        token_total  = token_total  + coalesce((SELECT sum(token_total)  FROM tasks WHERE tasks.project_id = projects.id), 0),
        cost_usd     = cost_usd     + coalesce((SELECT sum(cost_usd)     FROM tasks WHERE tasks.project_id = projects.id), 0)
      WHERE EXISTS (SELECT 1 FROM tasks WHERE tasks.project_id = projects.id AND tasks.token_total > 0)
    `,
  },
  {
    version: 11,
    description: "Add auto review manual handoff and state snapshot columns to tasks",
    sql: `
      ALTER TABLE tasks ADD COLUMN manual_review_required INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE tasks ADD COLUMN auto_review_state_json TEXT;
    `,
  },
  {
    version: 12,
    description:
      "Add scheduled_at (tasks) and auto_queue_mode (projects) for scheduled execution and auto-queue",
    sql: `
      ALTER TABLE tasks ADD COLUMN scheduled_at TEXT;
      ALTER TABLE projects ADD COLUMN auto_queue_mode INTEGER NOT NULL DEFAULT 0;
    `,
  },
  {
    version: 13,
    description: "Persist runtime limit snapshots on runtime_profiles and tasks",
    sql: `
      ALTER TABLE runtime_profiles ADD COLUMN runtime_limit_snapshot_json TEXT;
      ALTER TABLE runtime_profiles ADD COLUMN runtime_limit_updated_at TEXT;
      ALTER TABLE tasks ADD COLUMN runtime_limit_snapshot_json TEXT;
      ALTER TABLE tasks ADD COLUMN runtime_limit_updated_at TEXT;
    `,
  },
  {
    version: 14,
    description: "Add app_settings singleton table and extend runtime-profile cleanup coverage",
    sql: `
      CREATE TABLE IF NOT EXISTS app_settings (
        id INTEGER PRIMARY KEY NOT NULL DEFAULT 1,
        default_task_runtime_profile_id TEXT,
        default_plan_runtime_profile_id TEXT,
        default_review_runtime_profile_id TEXT,
        default_chat_runtime_profile_id TEXT,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      );
      INSERT OR IGNORE INTO app_settings (id) VALUES (1);
      DROP TRIGGER IF EXISTS trg_runtime_profiles_delete;
    `,
    triggers: [
      `CREATE TRIGGER IF NOT EXISTS trg_runtime_profiles_delete
       AFTER DELETE ON runtime_profiles
       FOR EACH ROW
       BEGIN
         UPDATE tasks SET runtime_profile_id = NULL WHERE runtime_profile_id = OLD.id;
         UPDATE projects SET default_task_runtime_profile_id = NULL WHERE default_task_runtime_profile_id = OLD.id;
         UPDATE projects SET default_plan_runtime_profile_id = NULL WHERE default_plan_runtime_profile_id = OLD.id;
         UPDATE projects SET default_review_runtime_profile_id = NULL WHERE default_review_runtime_profile_id = OLD.id;
         UPDATE projects SET default_chat_runtime_profile_id = NULL WHERE default_chat_runtime_profile_id = OLD.id;
         UPDATE chat_sessions SET runtime_profile_id = NULL WHERE runtime_profile_id = OLD.id;
         UPDATE app_settings
         SET
           default_task_runtime_profile_id = CASE
             WHEN default_task_runtime_profile_id = OLD.id THEN NULL
             ELSE default_task_runtime_profile_id
           END,
           default_plan_runtime_profile_id = CASE
             WHEN default_plan_runtime_profile_id = OLD.id THEN NULL
             ELSE default_plan_runtime_profile_id
           END,
           default_review_runtime_profile_id = CASE
             WHEN default_review_runtime_profile_id = OLD.id THEN NULL
             ELSE default_review_runtime_profile_id
           END,
           default_chat_runtime_profile_id = CASE
             WHEN default_chat_runtime_profile_id = OLD.id THEN NULL
             ELSE default_chat_runtime_profile_id
           END,
           updated_at = CASE
             WHEN default_task_runtime_profile_id = OLD.id
               OR default_plan_runtime_profile_id = OLD.id
               OR default_review_runtime_profile_id = OLD.id
               OR default_chat_runtime_profile_id = OLD.id
             THEN (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
             ELSE updated_at
           END
         WHERE id = 1;
       END`,
    ],
  },
  {
    version: 15,
    description:
      "Re-apply runtime limit snapshot columns for DBs that skipped v13 due to branch-merge re-ordering",
    sql: `
      ALTER TABLE runtime_profiles ADD COLUMN runtime_limit_snapshot_json TEXT;
      ALTER TABLE runtime_profiles ADD COLUMN runtime_limit_updated_at TEXT;
      ALTER TABLE tasks ADD COLUMN runtime_limit_snapshot_json TEXT;
      ALTER TABLE tasks ADD COLUMN runtime_limit_updated_at TEXT;
    `,
  },
  {
    version: 17,
    description: "Add Codex index read-model tables for session and usage-limit overlays",
    sql: `
      CREATE TABLE IF NOT EXISTS codex_sessions (
        session_id TEXT PRIMARY KEY,
        file_path TEXT NOT NULL UNIQUE,
        title TEXT,
        project_root TEXT,
        account_fingerprint TEXT,
        source_created_at TEXT,
        source_updated_at TEXT,
        message_count INTEGER NOT NULL DEFAULT 0,
        preview_text TEXT,
        size_bytes INTEGER NOT NULL DEFAULT 0,
        mtime_ms INTEGER NOT NULL DEFAULT 0,
        last_indexed_at TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      );
      CREATE TABLE IF NOT EXISTS codex_session_files (
        file_path TEXT PRIMARY KEY,
        session_id TEXT,
        size_bytes INTEGER NOT NULL DEFAULT 0,
        mtime_ms INTEGER NOT NULL DEFAULT 0,
        parsed_offset INTEGER NOT NULL DEFAULT 0,
        pending_tail TEXT NOT NULL DEFAULT '',
        missing INTEGER NOT NULL DEFAULT 0,
        import_version INTEGER NOT NULL DEFAULT 1,
        last_seen_at TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      );
      CREATE TABLE IF NOT EXISTS codex_limit_heads (
        head_key TEXT PRIMARY KEY,
        account_fingerprint TEXT NOT NULL,
        project_root TEXT,
        limit_id TEXT NOT NULL,
        model TEXT,
        source TEXT NOT NULL DEFAULT 'codex',
        snapshot_json TEXT NOT NULL,
        observed_at TEXT NOT NULL,
        session_id TEXT,
        file_path TEXT,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      );
      CREATE TABLE IF NOT EXISTS codex_limit_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        head_key TEXT NOT NULL,
        account_fingerprint TEXT NOT NULL,
        project_root TEXT,
        limit_id TEXT NOT NULL,
        model TEXT,
        snapshot_json TEXT NOT NULL,
        observed_at TEXT NOT NULL,
        session_id TEXT,
        file_path TEXT,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      );
      CREATE TABLE IF NOT EXISTS codex_index_cursors (
        cursor_key TEXT PRIMARY KEY,
        cursor_value TEXT,
        cursor_json TEXT,
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      );
    `,
  },
  {
    version: 18,
    description: "Drop unused Codex session-file dirty-scan index",
    sql: `
      DROP INDEX IF EXISTS idx_codex_session_files_dirty;
    `,
  },
  {
    version: 19,
    description:
      "Persist feature branch name per task so HANDOFF_MODE auto-queue can route implementer back to the right branch",
    sql: "ALTER TABLE tasks ADD COLUMN branch_name TEXT",
  },
  {
    version: 20,
    description: "Persist per-task git worktree path for parallel auto-queue isolation",
    sql: "ALTER TABLE tasks ADD COLUMN worktree_path TEXT",
  },
  {
    version: 21,
    description: "Add runtime warmup session persistence",
    sql: `
      CREATE TABLE IF NOT EXISTS runtime_warmup_sessions (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        runtime_profile_id TEXT,
        runtime_id TEXT NOT NULL,
        provider_id TEXT NOT NULL,
        transport TEXT,
        model TEXT,
        stage TEXT,
        source_session_id TEXT,
        status TEXT NOT NULL DEFAULT 'creating',
        ttl_seconds INTEGER NOT NULL,
        expires_at TEXT NOT NULL,
        summary TEXT,
        error_message TEXT,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      );
    `,
  },
  {
    version: 22,
    description: "Persist typed task intent on tasks",
    sql: `
      ALTER TABLE tasks ADD COLUMN task_intent TEXT NOT NULL DEFAULT 'general';
      UPDATE tasks SET task_intent = 'fix' WHERE is_fix = 1;
    `,
    skipIfMissingColumns: [
      { statementContains: "WHERE is_fix = 1", tableName: "tasks", columnName: "is_fix" },
    ],
  },
  {
    version: 23,
    description: "Persist typed roadmap batch artifact contracts",
    sql: `
      CREATE TABLE IF NOT EXISTS roadmap_batches (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        roadmap_alias TEXT NOT NULL,
        task_intent TEXT NOT NULL DEFAULT 'general',
        status TEXT NOT NULL DEFAULT 'expected',
        execution_policy TEXT NOT NULL DEFAULT 'serialized_shared_checkout',
        synthesis_task_id TEXT,
        expected_artifact_count INTEGER NOT NULL DEFAULT 0,
        valid_artifact_count INTEGER NOT NULL DEFAULT 0,
        invalid_artifact_count INTEGER NOT NULL DEFAULT 0,
        missing_artifact_count INTEGER NOT NULL DEFAULT 0,
        external_blocked_artifact_count INTEGER NOT NULL DEFAULT 0,
        synthesis_ready INTEGER NOT NULL DEFAULT 0,
        failure_family TEXT,
        summary_json TEXT,
        created_task_ids_json TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      );
      CREATE TABLE IF NOT EXISTS roadmap_batch_artifacts (
        id TEXT PRIMARY KEY,
        batch_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        roadmap_alias TEXT NOT NULL,
        task_id TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'report',
        artifact_path TEXT NOT NULL,
        state TEXT NOT NULL DEFAULT 'expected',
        failure_family TEXT,
        validation_details_json TEXT,
        branch_name TEXT,
        worktree_path TEXT,
        project_root TEXT,
        content_sha TEXT,
        validated_at TEXT,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      );
    `,
  },
  {
    version: 24,
    description: "Add server-owned memory item and audit tables",
    sql: `
      CREATE TABLE IF NOT EXISTS memory_items (
        id TEXT PRIMARY KEY,
        project_id TEXT,
        scope TEXT NOT NULL DEFAULT 'project',
        source_task_id TEXT,
        source_kind TEXT NOT NULL DEFAULT 'task',
        source_ref TEXT,
        item_type TEXT NOT NULL DEFAULT 'architecture_note',
        failure_family TEXT,
        claims_json TEXT NOT NULL DEFAULT '[]',
        status TEXT NOT NULL DEFAULT 'pending',
        redaction_status TEXT NOT NULL DEFAULT 'clean',
        publish_block_reason TEXT,
        review_note TEXT,
        title TEXT NOT NULL,
        summary TEXT NOT NULL,
        content TEXT NOT NULL,
        tags_json TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        approved_at TEXT,
        rejected_at TEXT,
        expired_at TEXT,
        expires_at TEXT
      );
      CREATE TABLE IF NOT EXISTS memory_usage_events (
        id TEXT PRIMARY KEY,
        memory_item_id TEXT NOT NULL,
        project_id TEXT,
        task_id TEXT,
        chat_session_id TEXT,
        workflow_kind TEXT NOT NULL,
        source TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      );
      CREATE TABLE IF NOT EXISTS memory_lifecycle_events (
        id TEXT PRIMARY KEY,
        memory_item_id TEXT NOT NULL,
        action TEXT NOT NULL,
        actor TEXT,
        note TEXT,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      );
    `,
  },
  {
    version: 25,
    description: "Add append-only audit evidence ledger events",
    sql: `
      CREATE TABLE IF NOT EXISTS audit_evidence_events (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL,
        audit_plan_id TEXT NOT NULL,
        source_snapshot_id TEXT NOT NULL,
        tool_name TEXT NOT NULL,
        evidence_kind TEXT NOT NULL,
        evidence_grade TEXT NOT NULL,
        scope_ids_json TEXT NOT NULL DEFAULT '[]',
        risk_hypothesis_ids_json TEXT NOT NULL DEFAULT '[]',
        path_hashes_json TEXT NOT NULL DEFAULT '[]',
        path_range_hashes_json TEXT NOT NULL DEFAULT '[]',
        command_json TEXT,
        exit_code INTEGER,
        output_sha256 TEXT,
        output_preview TEXT,
        output_preview_truncated INTEGER NOT NULL DEFAULT 0,
        parsed_summary_json TEXT,
        redaction_status TEXT NOT NULL DEFAULT 'clean',
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      );
    `,
  },
  {
    version: 26,
    description: "Add audit roadmap artifact attempt lifecycle",
    sql: `
      ALTER TABLE roadmap_batch_artifacts ADD COLUMN attempt_number INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE roadmap_batch_artifacts ADD COLUMN attempt_boundary_id TEXT;
      ALTER TABLE roadmap_batch_artifacts ADD COLUMN failure_signature TEXT;
      CREATE TABLE IF NOT EXISTS roadmap_batch_artifact_attempts (
        id TEXT PRIMARY KEY,
        artifact_id TEXT NOT NULL,
        batch_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        roadmap_alias TEXT NOT NULL,
        task_id TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'report',
        artifact_path TEXT NOT NULL,
        attempt_number INTEGER NOT NULL,
        attempt_boundary_id TEXT,
        state TEXT NOT NULL,
        classification TEXT,
        failure_family TEXT,
        failure_signature TEXT,
        content_sha TEXT,
        rework_status TEXT NOT NULL DEFAULT 'not_applicable',
        validation_details_json TEXT,
        source_snapshot_id TEXT,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      );
    `,
  },
  {
    version: 27,
    description: "Persist structured implementation manifests on tasks",
    sql: `
      ALTER TABLE tasks ADD COLUMN implementation_manifest_json TEXT;
    `,
  },
  {
    version: 28,
    description: "Add source-backed memory claim metadata",
    sql: `
      ALTER TABLE memory_items ADD COLUMN item_type TEXT NOT NULL DEFAULT 'architecture_note';
      ALTER TABLE memory_items ADD COLUMN failure_family TEXT;
      ALTER TABLE memory_items ADD COLUMN claims_json TEXT NOT NULL DEFAULT '[]';
    `,
    skipIfMissingColumns: [
      {
        statementContains: "memory_items ADD COLUMN item_type",
        tableName: "memory_items",
        columnName: "id",
      },
      {
        statementContains: "memory_items ADD COLUMN failure_family",
        tableName: "memory_items",
        columnName: "id",
      },
      {
        statementContains: "memory_items ADD COLUMN claims_json",
        tableName: "memory_items",
        columnName: "id",
      },
    ],
  },
  {
    version: 29,
    description: "Add runtime usage event outcomes",
    sql: `
      ALTER TABLE usage_events ADD COLUMN outcome TEXT NOT NULL DEFAULT 'success';
      ALTER TABLE usage_events ADD COLUMN error_category TEXT;
    `,
  },
  {
    version: 30,
    description: "Scope runtime warmup sessions by canonical runtime stage",
    sql: "ALTER TABLE runtime_warmup_sessions ADD COLUMN stage TEXT",
  },
  {
    version: 31,
    description: "Add durable task lock provenance",
    sql: `
      ALTER TABLE tasks ADD COLUMN lock_stage TEXT;
      ALTER TABLE tasks ADD COLUMN coordinator_id TEXT;
    `,
  },
  {
    version: 32,
    description: "Persist task source references",
    sql: "ALTER TABLE tasks ADD COLUMN source_ref TEXT",
  },
  {
    version: 33,
    description: "Add config audit events",
    sql: `
      CREATE TABLE IF NOT EXISTS config_audit_events (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        task_id TEXT,
        runtime_profile_id TEXT,
        action TEXT NOT NULL,
        source_kind TEXT NOT NULL,
        actor TEXT,
        reason_codes_json TEXT NOT NULL DEFAULT '[]',
        before_json TEXT,
        after_json TEXT,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      );
    `,
  },
  {
    version: 34,
    description: "Add first-class task hierarchy fields",
    sql: `
      ALTER TABLE tasks ADD COLUMN parent_task_id TEXT;
      ALTER TABLE tasks ADD COLUMN root_task_id TEXT;
      ALTER TABLE tasks ADD COLUMN hierarchy_depth INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE tasks ADD COLUMN hierarchy_role TEXT NOT NULL DEFAULT 'executable';
      ALTER TABLE tasks ADD COLUMN hierarchy_position REAL NOT NULL DEFAULT 1000.0;
      ALTER TABLE tasks ADD COLUMN parent_closeout_policy TEXT;
    `,
  },
];

function splitSqlStatements(sqlText: string): string[] {
  return sqlText
    .split(";")
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);
}

function isIgnorableMigrationError(error: unknown): boolean {
  const message = String(error).toLowerCase();
  return message.includes("duplicate column name") || message.includes("already exists");
}

function runMigrations(sqlite: Database.Database): void {
  const currentVersion = (sqlite.pragma("user_version", { simple: true }) as number) ?? 0;
  const pending = MIGRATIONS.filter((m) => m.version > currentVersion);

  if (pending.length === 0) {
    // For fresh DBs (user_version=0) that were just created with CREATE TABLE IF NOT EXISTS
    // (which already includes session_id), set version to latest to skip migrations.
    if (currentVersion === 0 && MIGRATIONS.length > 0) {
      const latest = MIGRATIONS[MIGRATIONS.length - 1].version;
      sqlite.pragma(`user_version = ${latest}`);
    }
    return;
  }

  log.info({ currentVersion, pendingCount: pending.length }, "Running database migrations");

  const runAll = sqlite.transaction(() => {
    for (const migration of pending) {
      const statements = splitSqlStatements(migration.sql);
      for (const statement of statements) {
        const missingColumnSkip = migration.skipIfMissingColumns?.find(
          (rule) =>
            statement.includes(rule.statementContains) &&
            !hasColumn(sqlite, rule.tableName, rule.columnName),
        );
        if (missingColumnSkip) {
          log.debug(
            {
              version: migration.version,
              statement,
              tableName: missingColumnSkip.tableName,
              columnName: missingColumnSkip.columnName,
            },
            "Migration statement requires missing column, skipping",
          );
          continue;
        }
        try {
          sqlite.exec(statement);
        } catch (err) {
          if (isIgnorableMigrationError(err)) {
            log.debug(
              { version: migration.version, statement },
              "Migration statement already applied, skipping",
            );
            continue;
          }
          throw err;
        }
      }
      for (const trigger of migration.triggers ?? []) {
        try {
          sqlite.exec(trigger);
        } catch (err) {
          if (isIgnorableMigrationError(err)) {
            log.debug({ version: migration.version }, "Trigger already exists, skipping");
            continue;
          }
          throw err;
        }
      }
      log.info(
        { version: migration.version, description: migration.description },
        "Migration applied",
      );
    }
    const latest = pending[pending.length - 1].version;
    sqlite.pragma(`user_version = ${latest}`);
  });

  runAll();
  log.info({ newVersion: pending[pending.length - 1].version }, "Migrations complete");
}

function hasColumn(sqlite: Database.Database, tableName: string, columnName: string): boolean {
  const rows = sqlite.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>;
  return rows.some((row) => row.name === columnName);
}

function runRuntimeBackfills(sqlite: Database.Database): void {
  if (hasColumn(sqlite, "app_settings", "id")) {
    const appSettingsBackfill = sqlite
      .prepare(
        `
        INSERT OR IGNORE INTO app_settings (id)
        VALUES (1)
      `,
      )
      .run();
    log.info(
      { backfilledRows: appSettingsBackfill.changes },
      "Backfilled singleton app_settings row",
    );
  }

  if (hasColumn(sqlite, "chat_sessions", "runtime_session_id")) {
    const sessionBackfill = sqlite
      .prepare(
        `
        UPDATE chat_sessions
        SET runtime_session_id = agent_session_id
        WHERE runtime_session_id IS NULL
          AND agent_session_id IS NOT NULL
      `,
      )
      .run();
    log.info(
      { backfilledRows: sessionBackfill.changes },
      "Backfilled runtime_session_id from legacy agent_session_id",
    );
  }

  if (hasColumn(sqlite, "runtime_profiles", "headers_json")) {
    const headersBackfill = sqlite
      .prepare(
        `
        UPDATE runtime_profiles
        SET headers_json = '{}'
        WHERE headers_json IS NULL OR trim(headers_json) = ''
      `,
      )
      .run();
    log.info(
      { backfilledRows: headersBackfill.changes },
      "Backfilled runtime profile headers_json defaults",
    );
  }

  if (hasColumn(sqlite, "runtime_profiles", "options_json")) {
    const optionsBackfill = sqlite
      .prepare(
        `
        UPDATE runtime_profiles
        SET options_json = '{}'
        WHERE options_json IS NULL OR trim(options_json) = ''
      `,
      )
      .run();
    log.info(
      { backfilledRows: optionsBackfill.changes },
      "Backfilled runtime profile options_json defaults",
    );
  }

  if (hasColumn(sqlite, "runtime_profiles", "enabled")) {
    const enabledBackfill = sqlite
      .prepare(
        `
        UPDATE runtime_profiles
        SET enabled = 1
        WHERE enabled IS NULL
      `,
      )
      .run();
    log.info(
      { backfilledRows: enabledBackfill.changes },
      "Backfilled runtime profile enabled defaults",
    );
  }

  if (hasColumn(sqlite, "tasks", "manual_review_required")) {
    const manualReviewBackfill = sqlite
      .prepare(
        `
        UPDATE tasks
        SET manual_review_required = 0
        WHERE manual_review_required IS NULL
      `,
      )
      .run();
    log.info(
      { backfilledRows: manualReviewBackfill.changes },
      "Backfilled task manual_review_required defaults",
    );
  }

  if (hasColumn(sqlite, "runtime_profiles", "runtime_limit_snapshot_json")) {
    const runtimeProfileLimitBackfill = sqlite
      .prepare(
        `
        UPDATE runtime_profiles
        SET runtime_limit_snapshot_json = NULL
        WHERE runtime_limit_snapshot_json IS NOT NULL
          AND trim(runtime_limit_snapshot_json) = ''
      `,
      )
      .run();
    log.info(
      { backfilledRows: runtimeProfileLimitBackfill.changes },
      "Backfilled runtime profile empty runtime_limit_snapshot_json values",
    );
  }

  if (hasColumn(sqlite, "tasks", "runtime_limit_snapshot_json")) {
    const taskLimitBackfill = sqlite
      .prepare(
        `
        UPDATE tasks
        SET runtime_limit_snapshot_json = NULL
        WHERE runtime_limit_snapshot_json IS NOT NULL
          AND trim(runtime_limit_snapshot_json) = ''
      `,
      )
      .run();
    log.info(
      { backfilledRows: taskLimitBackfill.changes },
      "Backfilled task empty runtime_limit_snapshot_json values",
    );
  }
}

/** Best-effort FTS5 bootstrap for memory retrieval. */
function ensureMemoryFts(sqlite: Database.Database): void {
  try {
    sqlite.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS memory_items_fts USING fts5(
        item_id UNINDEXED,
        scope,
        project_id UNINDEXED,
        title,
        summary,
        content,
        tags
      )
    `);
    sqlite.exec(`
      INSERT INTO memory_items_fts (item_id, scope, project_id, title, summary, content, tags)
      SELECT id, scope, project_id, title, summary, content, tags_json
      FROM memory_items
      WHERE id NOT IN (SELECT item_id FROM memory_items_fts)
    `);
    sqlite.exec(`
      CREATE TRIGGER IF NOT EXISTS trg_memory_items_fts_insert
      AFTER INSERT ON memory_items
      FOR EACH ROW
      BEGIN
        INSERT INTO memory_items_fts (item_id, scope, project_id, title, summary, content, tags)
        VALUES (NEW.id, NEW.scope, NEW.project_id, NEW.title, NEW.summary, NEW.content, NEW.tags_json);
      END
    `);
    sqlite.exec(`
      CREATE TRIGGER IF NOT EXISTS trg_memory_items_fts_update
      AFTER UPDATE ON memory_items
      FOR EACH ROW
      BEGIN
        DELETE FROM memory_items_fts WHERE item_id = OLD.id;
        INSERT INTO memory_items_fts (item_id, scope, project_id, title, summary, content, tags)
        VALUES (NEW.id, NEW.scope, NEW.project_id, NEW.title, NEW.summary, NEW.content, NEW.tags_json);
      END
    `);
    sqlite.exec(`
      CREATE TRIGGER IF NOT EXISTS trg_memory_items_fts_delete
      AFTER DELETE ON memory_items
      FOR EACH ROW
      BEGIN
        DELETE FROM memory_items_fts WHERE item_id = OLD.id;
      END
    `);
    log.debug("Memory FTS bootstrap complete");
  } catch (err) {
    log.warn(
      { err },
      "Memory FTS5 bootstrap unavailable; continuing without memory full-text search",
    );
  }
}

/** Idempotent trigger bootstrap — ensures cascade cleanup triggers exist on every startup. */
function ensureTriggers(sqlite: Database.Database): void {
  const allTriggers = MIGRATIONS.flatMap((m) => m.triggers ?? []);
  for (const trigger of allTriggers) {
    try {
      sqlite.exec(trigger);
    } catch (err) {
      if (isIgnorableMigrationError(err)) continue;
      log.error({ err }, "Trigger bootstrap failed");
    }
  }
  if (allTriggers.length > 0) {
    log.debug({ triggerCount: allTriggers.length }, "Trigger bootstrap complete");
  }
}

/** Idempotent index bootstrap for high-frequency query patterns. */
function ensureIndexes(sqlite: Database.Database): void {
  const indexDefs = [
    // Coordinator picks tasks by status
    "CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status)",
    // Coordinator retry scan: blocked_external tasks with due retry_after
    "CREATE INDEX IF NOT EXISTS idx_tasks_retry_after ON tasks(retry_after)",
    // Task list queries filtered by project
    "CREATE INDEX IF NOT EXISTS idx_tasks_project_id ON tasks(project_id)",
    // Composite: coordinator filters status + retry_after together
    "CREATE INDEX IF NOT EXISTS idx_tasks_status_retry ON tasks(status, retry_after)",
    // Composite: task list ordering within a project by status and position
    "CREATE INDEX IF NOT EXISTS idx_tasks_project_status ON tasks(project_id, status, position)",
    // Hierarchy lookups and parent rollup.
    "CREATE INDEX IF NOT EXISTS idx_tasks_parent ON tasks(parent_task_id, hierarchy_position)",
    "CREATE INDEX IF NOT EXISTS idx_tasks_root ON tasks(root_task_id, hierarchy_depth)",
    "CREATE INDEX IF NOT EXISTS idx_tasks_hierarchy_role ON tasks(project_id, hierarchy_role, status)",
    // Task comments lookup by task
    "CREATE INDEX IF NOT EXISTS idx_task_comments_task_id ON task_comments(task_id)",
    // Task locking: find unlocked or stale-locked tasks
    "CREATE INDEX IF NOT EXISTS idx_tasks_locked ON tasks(locked_by, locked_until)",
    // Coordinator scheduled-task scan: backlog tasks with due scheduled_at
    "CREATE INDEX IF NOT EXISTS idx_tasks_scheduled_at ON tasks(scheduled_at, status)",
    // Runtime profile selection by project scope
    "CREATE INDEX IF NOT EXISTS idx_runtime_profiles_project_id ON runtime_profiles(project_id)",
    // Runtime profile selection by runtime/provider
    "CREATE INDEX IF NOT EXISTS idx_runtime_profiles_runtime ON runtime_profiles(runtime_id, provider_id)",
    // Runtime profile lookups for tasks
    "CREATE INDEX IF NOT EXISTS idx_tasks_runtime_profile_id ON tasks(runtime_profile_id)",
    // Runtime profile lookups for chat sessions
    "CREATE INDEX IF NOT EXISTS idx_chat_sessions_runtime_profile_id ON chat_sessions(runtime_profile_id)",
    // Roadmap batch artifact lookups.
    "CREATE INDEX IF NOT EXISTS idx_roadmap_batches_project_alias ON roadmap_batches(project_id, roadmap_alias)",
    "CREATE INDEX IF NOT EXISTS idx_roadmap_batch_artifacts_batch ON roadmap_batch_artifacts(batch_id, role, state)",
    "CREATE INDEX IF NOT EXISTS idx_roadmap_batch_artifacts_task ON roadmap_batch_artifacts(task_id)",
    "CREATE INDEX IF NOT EXISTS idx_roadmap_batch_artifacts_project_alias ON roadmap_batch_artifacts(project_id, roadmap_alias)",
    "CREATE INDEX IF NOT EXISTS idx_roadmap_batch_artifact_attempts_artifact ON roadmap_batch_artifact_attempts(artifact_id, attempt_number)",
    "CREATE INDEX IF NOT EXISTS idx_roadmap_batch_artifact_attempts_batch ON roadmap_batch_artifact_attempts(batch_id, role, state)",
    "CREATE INDEX IF NOT EXISTS idx_roadmap_batch_artifact_attempts_signature ON roadmap_batch_artifact_attempts(artifact_id, failure_signature)",
    "CREATE INDEX IF NOT EXISTS idx_audit_evidence_task ON audit_evidence_events(task_id, created_at)",
    "CREATE INDEX IF NOT EXISTS idx_audit_evidence_plan_snapshot ON audit_evidence_events(audit_plan_id, source_snapshot_id, created_at)",
    "CREATE INDEX IF NOT EXISTS idx_audit_evidence_kind_grade ON audit_evidence_events(evidence_kind, evidence_grade, created_at)",
    "CREATE INDEX IF NOT EXISTS idx_config_audit_project_created ON config_audit_events(project_id, created_at)",
    "CREATE INDEX IF NOT EXISTS idx_config_audit_task_created ON config_audit_events(task_id, created_at)",
    "CREATE INDEX IF NOT EXISTS idx_config_audit_profile_created ON config_audit_events(runtime_profile_id, created_at)",
    // Usage event scope lookups for per-entity aggregation queries and dashboards
    "CREATE INDEX IF NOT EXISTS idx_usage_events_project ON usage_events(project_id, created_at)",
    "CREATE INDEX IF NOT EXISTS idx_usage_events_task ON usage_events(task_id, created_at)",
    "CREATE INDEX IF NOT EXISTS idx_usage_events_chat_session ON usage_events(chat_session_id, created_at)",
    "CREATE INDEX IF NOT EXISTS idx_usage_events_source ON usage_events(source, created_at)",
    "CREATE INDEX IF NOT EXISTS idx_usage_events_runtime ON usage_events(runtime_id, provider_id, created_at)",
    // Memory item review/retrieval and audit lookups.
    "CREATE INDEX IF NOT EXISTS idx_memory_items_project_status ON memory_items(project_id, status, updated_at)",
    "CREATE INDEX IF NOT EXISTS idx_memory_items_scope_status ON memory_items(scope, status, updated_at)",
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_memory_items_source_task_unique ON memory_items(source_task_id) WHERE source_task_id IS NOT NULL",
    "CREATE INDEX IF NOT EXISTS idx_memory_items_expires ON memory_items(status, expires_at)",
    "CREATE INDEX IF NOT EXISTS idx_memory_usage_events_item ON memory_usage_events(memory_item_id, created_at)",
    "CREATE INDEX IF NOT EXISTS idx_memory_usage_events_project ON memory_usage_events(project_id, created_at)",
    "CREATE INDEX IF NOT EXISTS idx_memory_usage_events_task ON memory_usage_events(task_id, created_at)",
    "CREATE INDEX IF NOT EXISTS idx_memory_usage_events_chat_session ON memory_usage_events(chat_session_id, created_at)",
    "CREATE INDEX IF NOT EXISTS idx_memory_lifecycle_events_item ON memory_lifecycle_events(memory_item_id, created_at)",
    // Runtime warmup lookup and lifecycle scans.
    "CREATE INDEX IF NOT EXISTS idx_runtime_warmup_active_lookup ON runtime_warmup_sessions(project_id, runtime_profile_id, runtime_id, provider_id, transport, model, status, expires_at)",
    "CREATE INDEX IF NOT EXISTS idx_runtime_warmup_stage_lookup ON runtime_warmup_sessions(project_id, stage, runtime_profile_id, runtime_id, provider_id, transport, model, status, expires_at)",
    "CREATE INDEX IF NOT EXISTS idx_runtime_warmup_expires ON runtime_warmup_sessions(status, expires_at)",
    // Codex index: project session listing and session detail lookup.
    "CREATE INDEX IF NOT EXISTS idx_codex_sessions_project_root_updated ON codex_sessions(project_root, source_updated_at DESC)",
    "CREATE INDEX IF NOT EXISTS idx_codex_sessions_file_path ON codex_sessions(file_path)",
    // Codex file-state reconcile scans.
    "CREATE INDEX IF NOT EXISTS idx_codex_session_files_session_id ON codex_session_files(session_id)",
    // Codex latest-head and bounded-history lookups.
    "CREATE INDEX IF NOT EXISTS idx_codex_limit_heads_lookup ON codex_limit_heads(account_fingerprint, project_root, limit_id, observed_at DESC)",
    "CREATE INDEX IF NOT EXISTS idx_codex_limit_history_head ON codex_limit_history(head_key, observed_at DESC)",
    "CREATE INDEX IF NOT EXISTS idx_codex_limit_history_account ON codex_limit_history(account_fingerprint, project_root, limit_id, observed_at DESC)",
  ];

  for (const ddl of indexDefs) {
    try {
      sqlite.exec(ddl);
    } catch (err) {
      log.error({ err, ddl }, "Index bootstrap failed");
    }
  }

  log.info({ indexCount: indexDefs.length }, "Index bootstrap complete");
  log.debug(
    { indexes: indexDefs.map((d) => d.match(/idx_\w+/)?.[0] ?? d) },
    "Indexes created/verified",
  );
}

/** Create a fresh in-memory DB — useful for testing */
export function createTestDb(): BetterSQLite3Database<typeof schema> {
  const sqlite = new Database(":memory:");
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  ensureTables(sqlite);
  // ensureTables already calls ensureIndexes at the end

  const db = drizzle(sqlite, { schema });
  log.debug("Created in-memory test database");

  return db;
}

export function closeDb(): void {
  if (_sqlite) {
    _sqlite.close();
    _sqlite = null;
    _db = null;
    log.debug("Database connection closed");
  }
}
