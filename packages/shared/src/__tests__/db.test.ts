import { describe, it, expect } from "vitest";
import Database from "better-sqlite3";
import { join } from "path";
import { tmpdir } from "os";
import { rmSync } from "fs";
import { eq } from "drizzle-orm";
import { chatSessions, tasks } from "../schema.js";
import { closeDb, createTestDb, getDb } from "../db.js";

const CURRENT_DB_USER_VERSION = 35;

function removeSqliteArtifacts(dbPath: string): void {
  for (const path of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`]) {
    try {
      rmSync(path, { force: true });
    } catch {
      // Windows can hold SQLite sidecars briefly after close; ignore cleanup noise in tests.
    }
  }
}

describe("db", () => {
  it("createTestDb returns a working database with indexes", () => {
    const db = createTestDb();
    expect(db).toBeDefined();
  });

  it("creates durable task lock provenance columns for fresh databases", () => {
    closeDb();
    const dbPath = join(
      tmpdir(),
      `aif-shared-lock-provenance-${Date.now()}-${Math.random()}.sqlite`,
    );

    try {
      getDb(dbPath);
      closeDb();

      const sqlite = new Database(dbPath, { readonly: true });
      const columns = sqlite.prepare(`PRAGMA table_info(tasks)`).all() as Array<{ name: string }>;
      const userVersion = sqlite.pragma("user_version", { simple: true }) as number;
      sqlite.close();

      expect(columns.map((column) => column.name)).toEqual(
        expect.arrayContaining([
          "locked_by",
          "locked_until",
          "last_heartbeat_at",
          "lock_stage",
          "coordinator_id",
          "source_ref",
        ]),
      );
      expect(userVersion).toBe(CURRENT_DB_USER_VERSION);
    } finally {
      closeDb();
      removeSqliteArtifacts(dbPath);
    }
  });

  it("creates task hierarchy columns and lookup indexes for fresh databases", () => {
    closeDb();
    const dbPath = join(
      tmpdir(),
      `aif-shared-task-hierarchy-${Date.now()}-${Math.random()}.sqlite`,
    );

    try {
      getDb(dbPath);
      closeDb();

      const sqlite = new Database(dbPath, { readonly: true });
      const columns = sqlite.prepare(`PRAGMA table_info(tasks)`).all() as Array<{ name: string }>;
      const indexes = sqlite
        .prepare(
          `
          SELECT name
          FROM sqlite_master
          WHERE type = 'index'
            AND name IN (
              'idx_tasks_parent',
              'idx_tasks_root',
              'idx_tasks_hierarchy_role'
            )
        `,
        )
        .all() as Array<{ name: string }>;
      const userVersion = sqlite.pragma("user_version", { simple: true }) as number;
      sqlite.close();

      expect(columns.map((column) => column.name)).toEqual(
        expect.arrayContaining([
          "parent_task_id",
          "root_task_id",
          "hierarchy_depth",
          "hierarchy_role",
          "hierarchy_position",
          "parent_closeout_policy",
        ]),
      );
      expect(indexes.map((row) => row.name).sort()).toEqual([
        "idx_tasks_hierarchy_role",
        "idx_tasks_parent",
        "idx_tasks_root",
      ]);
      expect(userVersion).toBe(CURRENT_DB_USER_VERSION);
    } finally {
      closeDb();
      removeSqliteArtifacts(dbPath);
    }
  });

  it("creates Codex index tables for fresh databases", () => {
    closeDb();
    const dbPath = join(tmpdir(), `aif-shared-codex-index-${Date.now()}-${Math.random()}.sqlite`);

    try {
      getDb(dbPath);
      closeDb();

      const sqlite = new Database(dbPath, { readonly: true });
      const tableNames = sqlite
        .prepare(
          `
          SELECT name
          FROM sqlite_master
          WHERE type = 'table'
            AND name IN (
              'codex_sessions',
              'codex_session_files',
              'codex_limit_heads',
              'codex_limit_history',
              'codex_index_cursors'
            )
        `,
        )
        .all() as Array<{ name: string }>;
      const dirtyIndex = sqlite
        .prepare(
          `
          SELECT name
          FROM sqlite_master
          WHERE type = 'index'
            AND name = 'idx_codex_session_files_dirty'
        `,
        )
        .get() as { name: string } | undefined;
      sqlite.close();

      expect(tableNames.map((row) => row.name).sort()).toEqual([
        "codex_index_cursors",
        "codex_limit_heads",
        "codex_limit_history",
        "codex_session_files",
        "codex_sessions",
      ]);
      expect(dirtyIndex).toBeUndefined();
    } finally {
      closeDb();
      removeSqliteArtifacts(dbPath);
    }
  });

  it("index bootstrap is idempotent — calling createTestDb twice does not throw", () => {
    // Each call runs ensureTables + ensureIndexes with CREATE INDEX IF NOT EXISTS
    const db1 = createTestDb();
    const db2 = createTestDb();
    expect(db1).toBeDefined();
    expect(db2).toBeDefined();
  });

  it("creates and seeds a singleton app_settings row", () => {
    closeDb();
    const dbPath = join(tmpdir(), `aif-shared-app-settings-${Date.now()}-${Math.random()}.sqlite`);

    try {
      getDb(dbPath);
      closeDb();

      const sqlite = new Database(dbPath, { readonly: true });
      const rows = sqlite
        .prepare(
          `
          SELECT
            id,
            default_task_runtime_profile_id,
            default_plan_runtime_profile_id,
            default_review_runtime_profile_id,
            default_chat_runtime_profile_id
          FROM app_settings
        `,
        )
        .all() as Array<{
        id: number;
        default_task_runtime_profile_id: string | null;
        default_plan_runtime_profile_id: string | null;
        default_review_runtime_profile_id: string | null;
        default_chat_runtime_profile_id: string | null;
      }>;
      sqlite.close();

      expect(rows).toEqual([
        {
          id: 1,
          default_task_runtime_profile_id: null,
          default_plan_runtime_profile_id: null,
          default_review_runtime_profile_id: null,
          default_chat_runtime_profile_id: null,
        },
      ]);
    } finally {
      closeDb();
      removeSqliteArtifacts(dbPath);
    }
  });

  it("migrates pre-v6 schema and backfills runtime_session_id from agent_session_id", () => {
    closeDb();
    const dbPath = join(tmpdir(), `aif-shared-migrate-${Date.now()}-${Math.random()}.sqlite`);
    const sqlite = new Database(dbPath);

    sqlite.exec(`
      CREATE TABLE projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        root_path TEXT NOT NULL,
        planner_max_budget_usd REAL,
        plan_checker_max_budget_usd REAL,
        implementer_max_budget_usd REAL,
        review_sidecar_max_budget_usd REAL,
        parallel_enabled INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      );
      CREATE TABLE tasks (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        attachments TEXT NOT NULL DEFAULT '[]',
        auto_mode INTEGER NOT NULL DEFAULT 1,
        is_fix INTEGER NOT NULL DEFAULT 0,
        planner_mode TEXT NOT NULL DEFAULT 'fast',
        plan_path TEXT NOT NULL DEFAULT '.ai-factory/PLAN.md',
        plan_docs INTEGER NOT NULL DEFAULT 0,
        plan_tests INTEGER NOT NULL DEFAULT 0,
        skip_review INTEGER NOT NULL DEFAULT 0,
        use_subagents INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'backlog',
        priority INTEGER NOT NULL DEFAULT 0,
        position REAL NOT NULL DEFAULT 1000.0,
        plan TEXT,
        implementation_log TEXT,
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
        paused INTEGER NOT NULL DEFAULT 0,
        last_heartbeat_at TEXT,
        last_synced_at TEXT,
        session_id TEXT,
        locked_by TEXT,
        locked_until TEXT,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      );
      CREATE TABLE task_comments (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL,
        author TEXT NOT NULL DEFAULT 'human',
        message TEXT NOT NULL,
        attachments TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE chat_sessions (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        title TEXT NOT NULL DEFAULT 'New Chat',
        agent_session_id TEXT,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      );
      CREATE TABLE chat_messages (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        attachments TEXT,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      );
    `);

    sqlite
      .prepare(
        `
        INSERT INTO chat_sessions (id, project_id, title, agent_session_id)
        VALUES (?, ?, ?, ?)
      `,
      )
      .run("legacy-chat", "legacy-project", "Legacy Chat", "legacy-agent-session");
    sqlite
      .prepare(
        `
        INSERT INTO tasks (id, project_id, title)
        VALUES (?, ?, ?)
      `,
      )
      .run("legacy-task", "legacy-project", "Legacy Task");
    sqlite
      .prepare(
        `
        INSERT INTO tasks (id, project_id, title, is_fix)
        VALUES (?, ?, ?, ?)
      `,
      )
      .run("legacy-fix-task", "legacy-project", "Legacy Fix Task", 1);
    sqlite.pragma("user_version = 5");
    sqlite.close();

    try {
      const db = getDb(dbPath);
      const migrated = db
        .select()
        .from(chatSessions)
        .where(eq(chatSessions.id, "legacy-chat"))
        .get();

      expect(migrated).toBeDefined();
      expect(migrated?.runtimeSessionId).toBe("legacy-agent-session");
      const migratedTask = db.select().from(tasks).where(eq(tasks.id, "legacy-task")).get();
      expect(migratedTask?.taskIntent).toBe("general");
      const migratedFixTask = db.select().from(tasks).where(eq(tasks.id, "legacy-fix-task")).get();
      expect(migratedFixTask?.isFix).toBe(true);
      expect(migratedFixTask?.taskIntent).toBe("fix");
    } finally {
      closeDb();
      removeSqliteArtifacts(dbPath);
    }
  });

  it("reconciles diverged feature-branch version-9 histories before applying v11", () => {
    closeDb();
    const dbPath = join(tmpdir(), `aif-shared-diverged-v9-${Date.now()}-${Math.random()}.sqlite`);
    const sqlite = new Database(dbPath);

    sqlite.exec(`
      CREATE TABLE projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        root_path TEXT NOT NULL,
        planner_max_budget_usd REAL,
        plan_checker_max_budget_usd REAL,
        implementer_max_budget_usd REAL,
        review_sidecar_max_budget_usd REAL,
        parallel_enabled INTEGER NOT NULL DEFAULT 0,
        default_task_runtime_profile_id TEXT,
        default_plan_runtime_profile_id TEXT,
        default_review_runtime_profile_id TEXT,
        default_chat_runtime_profile_id TEXT,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      );
      CREATE TABLE tasks (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        attachments TEXT NOT NULL DEFAULT '[]',
        auto_mode INTEGER NOT NULL DEFAULT 1,
        is_fix INTEGER NOT NULL DEFAULT 0,
        planner_mode TEXT NOT NULL DEFAULT 'fast',
        plan_path TEXT NOT NULL DEFAULT '.ai-factory/PLAN.md',
        plan_docs INTEGER NOT NULL DEFAULT 0,
        plan_tests INTEGER NOT NULL DEFAULT 0,
        skip_review INTEGER NOT NULL DEFAULT 0,
        use_subagents INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'backlog',
        priority INTEGER NOT NULL DEFAULT 0,
        position REAL NOT NULL DEFAULT 1000.0,
        plan TEXT,
        implementation_log TEXT,
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
        locked_by TEXT,
        locked_until TEXT,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      );
      CREATE TABLE task_comments (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL,
        author TEXT NOT NULL DEFAULT 'human',
        message TEXT NOT NULL,
        attachments TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE runtime_profiles (
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
      CREATE TABLE chat_sessions (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        title TEXT NOT NULL DEFAULT 'New Chat',
        agent_session_id TEXT,
        runtime_profile_id TEXT,
        runtime_session_id TEXT,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      );
      CREATE TABLE chat_messages (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        attachments TEXT,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      );
    `);

    sqlite.pragma("user_version = 9");
    sqlite.close();

    try {
      getDb(dbPath);
      closeDb();

      const migratedSqlite = new Database(dbPath, { readonly: true });
      const usageEventsTable = migratedSqlite
        .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'usage_events'`)
        .get() as { name: string } | undefined;
      const projectColumns = migratedSqlite.prepare(`PRAGMA table_info(projects)`).all() as Array<{
        name: string;
      }>;
      const chatSessionColumns = migratedSqlite
        .prepare(`PRAGMA table_info(chat_sessions)`)
        .all() as Array<{ name: string }>;
      const taskColumns = migratedSqlite.prepare(`PRAGMA table_info(tasks)`).all() as Array<{
        name: string;
      }>;
      const runtimeProfileColumns = migratedSqlite
        .prepare(`PRAGMA table_info(runtime_profiles)`)
        .all() as Array<{ name: string }>;
      const userVersion = migratedSqlite.pragma("user_version", { simple: true }) as number;
      migratedSqlite.close();

      expect(usageEventsTable?.name).toBe("usage_events");
      expect(projectColumns.map((column) => column.name)).toEqual(
        expect.arrayContaining(["token_input", "token_output", "token_total", "cost_usd"]),
      );
      expect(chatSessionColumns.map((column) => column.name)).toEqual(
        expect.arrayContaining(["token_input", "token_output", "token_total", "cost_usd"]),
      );
      expect(taskColumns.map((column) => column.name)).toEqual(
        expect.arrayContaining([
          "manual_review_required",
          "auto_review_state_json",
          "runtime_limit_snapshot_json",
          "runtime_limit_updated_at",
          "branch_name",
          "worktree_path",
        ]),
      );
      expect(runtimeProfileColumns.map((column) => column.name)).toEqual(
        expect.arrayContaining(["runtime_limit_snapshot_json", "runtime_limit_updated_at"]),
      );
      expect(userVersion).toBe(CURRENT_DB_USER_VERSION);
    } finally {
      closeDb();
      removeSqliteArtifacts(dbPath);
    }
  });

  it("drops the unused Codex session-files dirty index when migrating v17 databases", () => {
    closeDb();
    const dbPath = join(
      tmpdir(),
      `aif-shared-codex-index-drop-${Date.now()}-${Math.random()}.sqlite`,
    );
    const sqlite = new Database(dbPath);

    sqlite.exec(`
      CREATE TABLE codex_session_files (
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
      CREATE INDEX idx_codex_session_files_dirty
        ON codex_session_files(missing, mtime_ms, size_bytes);
    `);
    sqlite.pragma("user_version = 17");
    sqlite.close();

    try {
      getDb(dbPath);
      closeDb();

      const migratedSqlite = new Database(dbPath, { readonly: true });
      const dirtyIndex = migratedSqlite
        .prepare(
          `
          SELECT name
          FROM sqlite_master
          WHERE type = 'index'
            AND name = 'idx_codex_session_files_dirty'
        `,
        )
        .get() as { name: string } | undefined;
      const userVersion = migratedSqlite.pragma("user_version", { simple: true }) as number;
      migratedSqlite.close();

      expect(dirtyIndex).toBeUndefined();
      expect(userVersion).toBe(CURRENT_DB_USER_VERSION);
    } finally {
      closeDb();
      removeSqliteArtifacts(dbPath);
    }
  });

  it("recovers v13 runtime-limit columns for DBs stranded at user_version=14 after branch-merge reordering", () => {
    closeDb();
    const dbPath = join(tmpdir(), `aif-shared-v14-stranded-${Date.now()}-${Math.random()}.sqlite`);
    const sqlite = new Database(dbPath);

    sqlite.exec(`
      CREATE TABLE runtime_profiles (
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
      CREATE TABLE tasks (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        title TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'backlog',
        position REAL NOT NULL DEFAULT 1000.0,
        retry_after TEXT,
        locked_by TEXT,
        locked_until TEXT,
        scheduled_at TEXT,
        runtime_profile_id TEXT
      );
    `);
    sqlite.pragma("user_version = 14");
    sqlite.close();

    try {
      getDb(dbPath);
      closeDb();

      const migratedSqlite = new Database(dbPath, { readonly: true });
      const taskColumns = migratedSqlite.prepare(`PRAGMA table_info(tasks)`).all() as Array<{
        name: string;
      }>;
      const profileColumns = migratedSqlite
        .prepare(`PRAGMA table_info(runtime_profiles)`)
        .all() as Array<{ name: string }>;
      const userVersion = migratedSqlite.pragma("user_version", { simple: true }) as number;
      migratedSqlite.close();

      expect(taskColumns.map((column) => column.name)).toEqual(
        expect.arrayContaining([
          "runtime_limit_snapshot_json",
          "runtime_limit_updated_at",
          "branch_name",
          "worktree_path",
        ]),
      );
      expect(profileColumns.map((column) => column.name)).toEqual(
        expect.arrayContaining(["runtime_limit_snapshot_json", "runtime_limit_updated_at"]),
      );
      expect(userVersion).toBe(CURRENT_DB_USER_VERSION);
    } finally {
      closeDb();
      removeSqliteArtifacts(dbPath);
    }
  });

  it("upgrades a v18 schema to current by adding task git-isolation columns and warmup sessions", () => {
    closeDb();
    const dbPath = join(tmpdir(), `aif-shared-v18-to-v19-${Date.now()}-${Math.random()}.sqlite`);
    const sqlite = new Database(dbPath);

    // Minimal pre-v19 schema with the columns the v6→v18 migrations would have
    // produced. The point of this test is to lock the v19 contract: the
    // upgrade must add `branch_name` and `worktree_path`, while leaving every
    // prior column (esp. the v15 runtime_limit recovery columns) intact. If
    // this PR lands second after another migration merges to main, this test
    // will fail and force the rebaser to bump to a free trailing version slot
    // rather than silently re-using an existing version with different SQL.
    sqlite.exec(`
      CREATE TABLE tasks (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        title TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'backlog',
        position REAL NOT NULL DEFAULT 1000.0,
        manual_review_required INTEGER NOT NULL DEFAULT 0,
        auto_review_state_json TEXT,
        runtime_limit_snapshot_json TEXT,
        runtime_limit_updated_at TEXT,
        runtime_profile_id TEXT
      );
    `);
    sqlite.pragma("user_version = 18");
    sqlite.close();

    try {
      getDb(dbPath);
      closeDb();

      const migratedSqlite = new Database(dbPath, { readonly: true });
      const taskColumns = migratedSqlite.prepare(`PRAGMA table_info(tasks)`).all() as Array<{
        name: string;
      }>;
      const warmupTable = migratedSqlite
        .prepare(
          `
          SELECT name
          FROM sqlite_master
          WHERE type = 'table'
            AND name = 'runtime_warmup_sessions'
        `,
        )
        .get() as { name: string } | undefined;
      const userVersion = migratedSqlite.pragma("user_version", { simple: true }) as number;
      migratedSqlite.close();

      const taskColumnNames = taskColumns.map((column) => column.name);
      expect(taskColumnNames).toContain("branch_name");
      expect(taskColumnNames).toContain("worktree_path");
      expect(taskColumnNames).toEqual(
        expect.arrayContaining([
          "manual_review_required",
          "auto_review_state_json",
          "runtime_limit_snapshot_json",
          "runtime_limit_updated_at",
        ]),
      );
      expect(warmupTable?.name).toBe("runtime_warmup_sessions");
      expect(userVersion).toBe(CURRENT_DB_USER_VERSION);
    } finally {
      closeDb();
      removeSqliteArtifacts(dbPath);
    }
  });

  it("creates runtime warmup sessions table and lookup indexes for fresh databases", () => {
    closeDb();
    const dbPath = join(tmpdir(), `aif-shared-warmup-${Date.now()}-${Math.random()}.sqlite`);

    try {
      getDb(dbPath);
      closeDb();

      const sqlite = new Database(dbPath, { readonly: true });
      const table = sqlite
        .prepare(
          `
          SELECT name
          FROM sqlite_master
          WHERE type = 'table'
            AND name = 'runtime_warmup_sessions'
        `,
        )
        .get() as { name: string } | undefined;
      const indexes = sqlite
        .prepare(
          `
          SELECT name
          FROM sqlite_master
          WHERE type = 'index'
            AND name IN (
              'idx_runtime_warmup_active_lookup',
              'idx_runtime_warmup_stage_lookup',
              'idx_runtime_warmup_expires'
            )
        `,
        )
        .all() as Array<{ name: string }>;
      const columns = sqlite.prepare(`PRAGMA table_info(runtime_warmup_sessions)`).all() as Array<{
        name: string;
      }>;
      const userVersion = sqlite.pragma("user_version", { simple: true }) as number;
      sqlite.close();

      expect(table?.name).toBe("runtime_warmup_sessions");
      expect(indexes.map((row) => row.name).sort()).toEqual([
        "idx_runtime_warmup_active_lookup",
        "idx_runtime_warmup_expires",
        "idx_runtime_warmup_stage_lookup",
      ]);
      expect(columns.map((column) => column.name)).toContain("stage");
      expect(userVersion).toBe(CURRENT_DB_USER_VERSION);
    } finally {
      closeDb();
      removeSqliteArtifacts(dbPath);
    }
  });

  it("creates runtime endpoint lease table and indexes for fresh databases", () => {
    closeDb();
    const dbPath = join(
      tmpdir(),
      `aif-shared-runtime-endpoint-leases-${Date.now()}-${Math.random()}.sqlite`,
    );

    try {
      getDb(dbPath);
      closeDb();

      const sqlite = new Database(dbPath, { readonly: true });
      const table = sqlite
        .prepare(
          `
          SELECT name
          FROM sqlite_master
          WHERE type = 'table'
            AND name = 'runtime_endpoint_leases'
        `,
        )
        .get() as { name: string } | undefined;
      const indexes = sqlite
        .prepare(
          `
          SELECT name
          FROM sqlite_master
          WHERE type = 'index'
            AND name IN (
              'idx_runtime_endpoint_leases_holder',
              'idx_runtime_endpoint_leases_task',
              'idx_runtime_endpoint_leases_expires',
              'idx_runtime_endpoint_leases_cooldown'
            )
        `,
        )
        .all() as Array<{ name: string }>;
      const columns = sqlite.prepare(`PRAGMA table_info(runtime_endpoint_leases)`).all() as Array<{
        name: string;
      }>;
      const userVersion = sqlite.pragma("user_version", { simple: true }) as number;
      sqlite.close();

      expect(table?.name).toBe("runtime_endpoint_leases");
      expect(indexes.map((row) => row.name).sort()).toEqual([
        "idx_runtime_endpoint_leases_cooldown",
        "idx_runtime_endpoint_leases_expires",
        "idx_runtime_endpoint_leases_holder",
        "idx_runtime_endpoint_leases_task",
      ]);
      expect(columns.map((column) => column.name)).toEqual(
        expect.arrayContaining([
          "endpoint_key",
          "holder_id",
          "lease_token",
          "lease_expires_at",
          "cooldown_until",
          "cooldown_failure_count",
        ]),
      );
      expect(userVersion).toBe(CURRENT_DB_USER_VERSION);
    } finally {
      closeDb();
      removeSqliteArtifacts(dbPath);
    }
  });

  it("creates roadmap batch artifact contract tables and indexes for fresh databases", () => {
    closeDb();
    const dbPath = join(
      tmpdir(),
      `aif-shared-roadmap-batches-${Date.now()}-${Math.random()}.sqlite`,
    );

    try {
      getDb(dbPath);
      closeDb();

      const sqlite = new Database(dbPath, { readonly: true });
      const tables = sqlite
        .prepare(
          `
          SELECT name
          FROM sqlite_master
          WHERE type = 'table'
            AND name IN (
              'roadmap_batches',
              'roadmap_batch_artifacts'
            )
        `,
        )
        .all() as Array<{ name: string }>;
      const indexes = sqlite
        .prepare(
          `
          SELECT name
          FROM sqlite_master
          WHERE type = 'index'
            AND name IN (
              'idx_roadmap_batches_project_alias',
              'idx_roadmap_batch_artifacts_batch',
              'idx_roadmap_batch_artifacts_task',
              'idx_roadmap_batch_artifacts_project_alias'
            )
        `,
        )
        .all() as Array<{ name: string }>;
      const userVersion = sqlite.pragma("user_version", { simple: true }) as number;
      sqlite.close();

      expect(tables.map((row) => row.name).sort()).toEqual([
        "roadmap_batch_artifacts",
        "roadmap_batches",
      ]);
      expect(indexes.map((row) => row.name).sort()).toEqual([
        "idx_roadmap_batch_artifacts_batch",
        "idx_roadmap_batch_artifacts_project_alias",
        "idx_roadmap_batch_artifacts_task",
        "idx_roadmap_batches_project_alias",
      ]);
      expect(userVersion).toBe(CURRENT_DB_USER_VERSION);
    } finally {
      closeDb();
      removeSqliteArtifacts(dbPath);
    }
  });

  it("creates memory domain tables, indexes, and FTS bootstrap for fresh databases", () => {
    closeDb();
    const dbPath = join(tmpdir(), `aif-shared-memory-${Date.now()}-${Math.random()}.sqlite`);

    try {
      getDb(dbPath);
      closeDb();

      const sqlite = new Database(dbPath);
      const tables = sqlite
        .prepare(
          `
          SELECT name
          FROM sqlite_master
          WHERE type = 'table'
            AND name IN (
              'memory_items',
              'memory_usage_events',
              'memory_lifecycle_events',
              'memory_items_fts'
            )
        `,
        )
        .all() as Array<{ name: string }>;
      const indexes = sqlite
        .prepare(
          `
          SELECT name
          FROM sqlite_master
          WHERE type = 'index'
            AND name IN (
              'idx_memory_items_project_status',
              'idx_memory_items_scope_status',
              'idx_memory_items_source_task_unique',
              'idx_memory_items_expires',
              'idx_memory_usage_events_item',
              'idx_memory_usage_events_project',
              'idx_memory_usage_events_task',
              'idx_memory_usage_events_chat_session',
              'idx_memory_lifecycle_events_item'
            )
        `,
        )
        .all() as Array<{ name: string }>;
      const triggers = sqlite
        .prepare(
          `
          SELECT name
          FROM sqlite_master
          WHERE type = 'trigger'
            AND name IN (
              'trg_memory_items_fts_insert',
              'trg_memory_items_fts_update',
              'trg_memory_items_fts_delete'
            )
        `,
        )
        .all() as Array<{ name: string }>;
      const columns = sqlite.prepare(`PRAGMA table_info(memory_items)`).all() as Array<{
        name: string;
      }>;

      sqlite
        .prepare(
          `
          INSERT INTO memory_items (
            id, project_id, scope, source_task_id, source_kind, title, summary, content, tags_json
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        )
        .run(
          "memory-1",
          "project-1",
          "project",
          "task-1",
          "task",
          "Memory title",
          "Memory summary",
          "Use lane-aware task ids",
          '["rdpi"]',
        );
      const ftsRow = sqlite
        .prepare(`SELECT item_id FROM memory_items_fts WHERE memory_items_fts MATCH ?`)
        .get("lane") as { item_id: string } | undefined;
      const userVersion = sqlite.pragma("user_version", { simple: true }) as number;
      sqlite.close();

      expect(tables.map((row) => row.name).sort()).toEqual([
        "memory_items",
        "memory_items_fts",
        "memory_lifecycle_events",
        "memory_usage_events",
      ]);
      expect(indexes.map((row) => row.name).sort()).toEqual([
        "idx_memory_items_expires",
        "idx_memory_items_project_status",
        "idx_memory_items_scope_status",
        "idx_memory_items_source_task_unique",
        "idx_memory_lifecycle_events_item",
        "idx_memory_usage_events_chat_session",
        "idx_memory_usage_events_item",
        "idx_memory_usage_events_project",
        "idx_memory_usage_events_task",
      ]);
      expect(triggers.map((row) => row.name).sort()).toEqual([
        "trg_memory_items_fts_delete",
        "trg_memory_items_fts_insert",
        "trg_memory_items_fts_update",
      ]);
      expect(columns.map((row) => row.name)).toEqual(
        expect.arrayContaining(["item_type", "failure_family", "claims_json"]),
      );
      expect(ftsRow?.item_id).toBe("memory-1");
      expect(userVersion).toBe(CURRENT_DB_USER_VERSION);
    } finally {
      closeDb();
      removeSqliteArtifacts(dbPath);
    }
  });

  it("upgrades a v23 schema with memory domain tables", () => {
    closeDb();
    const dbPath = join(tmpdir(), `aif-shared-v23-memory-${Date.now()}-${Math.random()}.sqlite`);
    const sqlite = new Database(dbPath);

    sqlite.pragma("user_version = 23");
    sqlite.close();

    try {
      getDb(dbPath);
      closeDb();

      const migratedSqlite = new Database(dbPath, { readonly: true });
      const tables = migratedSqlite
        .prepare(
          `
          SELECT name
          FROM sqlite_master
          WHERE type = 'table'
            AND name IN (
              'memory_items',
              'memory_usage_events',
              'memory_lifecycle_events',
              'memory_items_fts'
            )
        `,
        )
        .all() as Array<{ name: string }>;
      const userVersion = migratedSqlite.pragma("user_version", { simple: true }) as number;
      migratedSqlite.close();

      expect(tables.map((row) => row.name).sort()).toEqual([
        "memory_items",
        "memory_items_fts",
        "memory_lifecycle_events",
        "memory_usage_events",
      ]);
      expect(userVersion).toBe(CURRENT_DB_USER_VERSION);
    } finally {
      closeDb();
      removeSqliteArtifacts(dbPath);
    }
  });

  it("upgrades a v26 schema by adding structured implementation manifests to tasks", () => {
    closeDb();
    const dbPath = join(
      tmpdir(),
      `aif-shared-v26-implementation-manifest-${Date.now()}-${Math.random()}.sqlite`,
    );
    const sqlite = new Database(dbPath);

    sqlite.exec(`
      CREATE TABLE tasks (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        title TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'backlog',
        position REAL NOT NULL DEFAULT 1000.0,
        retry_after TEXT,
        locked_by TEXT,
        locked_until TEXT,
        scheduled_at TEXT,
        runtime_profile_id TEXT,
        manual_review_required INTEGER NOT NULL DEFAULT 0,
        runtime_limit_snapshot_json TEXT,
        runtime_limit_updated_at TEXT,
        task_intent TEXT NOT NULL DEFAULT 'general'
      );
    `);
    sqlite.pragma("user_version = 26");
    sqlite.close();

    try {
      getDb(dbPath);
      closeDb();

      const migratedSqlite = new Database(dbPath, { readonly: true });
      const taskColumns = migratedSqlite.prepare(`PRAGMA table_info(tasks)`).all() as Array<{
        name: string;
      }>;
      const userVersion = migratedSqlite.pragma("user_version", { simple: true }) as number;
      migratedSqlite.close();

      expect(taskColumns.map((column) => column.name)).toContain("implementation_manifest_json");
      expect(userVersion).toBe(CURRENT_DB_USER_VERSION);
    } finally {
      closeDb();
      removeSqliteArtifacts(dbPath);
    }
  });
});
