import Database from "better-sqlite3";
import { join } from "path";
import { homedir } from "os";
import { mkdirSync } from "fs";

const DB_DIR = join(homedir(), ".bridge-data");
mkdirSync(DB_DIR, { recursive: true });

const db = new Database(join(DB_DIR, "bridge.db"));
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    title TEXT DEFAULT 'New Conversation',
    created_at TEXT DEFAULT (datetime('now')),
    target_session TEXT,
    workspace TEXT
  );

  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    role TEXT CHECK (role IN ('user', 'agent')),
    content TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS conversation_states (
    conversation_id TEXT PRIMARY KEY REFERENCES conversations(id) ON DELETE CASCADE,
    state TEXT NOT NULL DEFAULT 'idle',
    tool TEXT,
    permission_payload TEXT,
    updated_at TEXT DEFAULT (datetime('now'))
  );
`);

// Migration: add workspace column if missing (existing databases)
try {
  db.exec(`ALTER TABLE conversations ADD COLUMN workspace TEXT`);
} catch (err) {
  if (!err.message.includes("duplicate column name")) throw err;
}

// Migration: add images column if missing (existing databases)
try {
  db.exec(`ALTER TABLE messages ADD COLUMN images TEXT`);
} catch (err) {
  if (!err.message.includes("duplicate column name")) throw err;
}

// Migration: add seq column to conversation_states for gap detection
try {
  db.exec(`ALTER TABLE conversation_states ADD COLUMN seq INTEGER NOT NULL DEFAULT 0`);
} catch (err) {
  if (!err.message.includes("duplicate column name")) throw err;
}

// Migration: add seq column to messages for delta sync
try {
  db.exec(`ALTER TABLE messages ADD COLUMN seq INTEGER`);
} catch (err) {
  if (!err.message.includes("duplicate column name")) throw err;
}

const stmts = {
  insertConversation: db.prepare(`
    INSERT OR IGNORE INTO conversations (id, agent_id, user_id, title, created_at, target_session, workspace)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `),
  insertMessage: db.prepare(`
    INSERT OR IGNORE INTO messages (id, conversation_id, role, content, created_at, images)
    VALUES (?, ?, ?, ?, ?, ?)
  `),
  getMessages: db.prepare(`
    SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC
  `),
  getRecentMessages: db.prepare(`
    SELECT * FROM (
      SELECT * FROM messages
      WHERE conversation_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    ) ORDER BY created_at ASC
  `),
  getConversations: db.prepare(`
    SELECT * FROM conversations WHERE agent_id = ? ORDER BY created_at DESC
  `),
  getConversation: db.prepare(`
    SELECT * FROM conversations WHERE id = ?
  `),
  deleteConversation: db.prepare(`
    DELETE FROM conversations WHERE id = ?
  `),
  updateConversationTitle: db.prepare(`
    UPDATE conversations SET title = ? WHERE id = ?
  `),
  getLastConversationTime: db.prepare(`
    SELECT MAX(created_at) as last_used FROM conversations WHERE workspace = ?
  `),
  upsertConversationState: db.prepare(`
    INSERT INTO conversation_states (conversation_id, state, tool, permission_payload, updated_at)
    VALUES (?, ?, ?, ?, datetime('now'))
    ON CONFLICT(conversation_id) DO UPDATE SET
      state = excluded.state,
      tool = excluded.tool,
      permission_payload = excluded.permission_payload,
      updated_at = excluded.updated_at
  `),
  getConversationState: db.prepare(`
    SELECT * FROM conversation_states WHERE conversation_id = ?
  `),
  deleteConversationState: db.prepare(`
    DELETE FROM conversation_states WHERE conversation_id = ?
  `),
  getConversationStatesForAgent: db.prepare(`
    SELECT cs.* FROM conversation_states cs
    JOIN conversations c ON cs.conversation_id = c.id
    WHERE c.agent_id = ?
  `),
  incrementSeq: db.prepare(`
    UPDATE conversation_states SET seq = seq + 1, updated_at = datetime('now')
    WHERE conversation_id = ?
  `),
  getSeq: db.prepare(`
    SELECT seq FROM conversation_states WHERE conversation_id = ?
  `),
  insertMessageWithSeq: db.prepare(`
    INSERT OR IGNORE INTO messages (id, conversation_id, role, content, created_at, images, seq)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `),
  getMessagesSinceSeq: db.prepare(`
    SELECT * FROM messages WHERE conversation_id = ? AND seq > ? ORDER BY created_at ASC
  `),
};

export const localDb = {
  insertConversation(id, agentId, userId, title, createdAt, targetSession = null, workspace = null) {
    stmts.insertConversation.run(
      id, agentId, userId,
      title ?? "New Conversation",
      createdAt ?? new Date().toISOString(),
      targetSession,
      workspace,
    );
  },

  insertMessage(id, conversationId, role, content, createdAt, images = null) {
    const imagesJson = images ? JSON.stringify(images) : null;
    stmts.insertMessage.run(
      id, conversationId, role, content,
      createdAt ?? new Date().toISOString(),
      imagesJson,
    );
  },

  getMessages(conversationId, limit = null) {
    const rows =
      typeof limit === "number" && limit > 0
        ? stmts.getRecentMessages.all(conversationId, limit)
        : stmts.getMessages.all(conversationId);
    return rows.map((row) => ({
      ...row,
      images: row.images ? JSON.parse(row.images) : undefined,
    }));
  },

  getConversations(agentId) {
    return stmts.getConversations.all(agentId);
  },

  getConversation(conversationId) {
    return stmts.getConversation.get(conversationId) ?? null;
  },

  deleteConversation(conversationId) {
    stmts.deleteConversation.run(conversationId);
  },

  updateTitle(conversationId, title) {
    stmts.updateConversationTitle.run(title, conversationId);
  },

  getLastConversationTime(workspace) {
    const row = stmts.getLastConversationTime.get(workspace);
    return row?.last_used ?? null;
  },

  upsertConversationState(conversationId, state, tool = null, permissionPayload = null) {
    stmts.upsertConversationState.run(conversationId, state, tool, permissionPayload);
  },

  getConversationState(conversationId) {
    return stmts.getConversationState.get(conversationId) ?? null;
  },

  deleteConversationState(conversationId) {
    stmts.deleteConversationState.run(conversationId);
  },

  getConversationStatesForAgent(agentId) {
    return stmts.getConversationStatesForAgent.all(agentId);
  },

  incrementSeq(conversationId) {
    // Ensure a state row exists before incrementing
    stmts.upsertConversationState.run(conversationId, "idle", null, null);
    stmts.incrementSeq.run(conversationId);
    const row = stmts.getSeq.get(conversationId);
    return row?.seq ?? 0;
  },

  getSeq(conversationId) {
    const row = stmts.getSeq.get(conversationId);
    return row?.seq ?? 0;
  },

  insertMessageWithSeq(id, conversationId, role, content, createdAt, images = null, seq = null) {
    const imagesJson = images ? JSON.stringify(images) : null;
    stmts.insertMessageWithSeq.run(
      id, conversationId, role, content,
      createdAt ?? new Date().toISOString(),
      imagesJson,
      seq,
    );
  },

  getMessagesSinceSeq(conversationId, sinceSeq) {
    const rows = stmts.getMessagesSinceSeq.all(conversationId, sinceSeq);
    return rows.map((row) => ({
      ...row,
      images: row.images ? JSON.parse(row.images) : undefined,
    }));
  },
};
