'use strict';

const Database = require('better-sqlite3');
const path     = require('path');
const fs       = require('fs');

// Maximum number of invites the bot will create in any single channel
const SLOT_CAP = 50;

let _db = null;

function getDb() {
  if (_db) return _db;

  const dbPath = process.env.SLOTS_DB_PATH
    || path.join(process.cwd(), 'data', 'invite_slots.db');
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  _db = new Database(dbPath);
  _db.pragma('journal_mode = WAL');
  _db.exec(`
    -- Running invite count per channel (bot-created + user-created).
    -- Used to decide whether to create new bot invites in this channel.
    CREATE TABLE IF NOT EXISTS channel_counts (
      channel_id TEXT PRIMARY KEY,
      count      INTEGER NOT NULL DEFAULT 0
    );

    -- Every invite code that has been counted, tagged with its channel and
    -- whether the bot created it.  Used to skip already-seen codes on restart.
    CREATE TABLE IF NOT EXISTS seen_codes (
      code       TEXT    PRIMARY KEY,
      channel_id TEXT    NOT NULL,
      is_bot     INTEGER NOT NULL DEFAULT 0
    );
  `);

  return _db;
}

/** Current invite count for a channel (0 if not yet tracked). */
function getCount(channelId) {
  return getDb()
    .prepare('SELECT count FROM channel_counts WHERE channel_id = ?')
    .get(channelId)?.count ?? 0;
}

/** Increment a channel's invite count by 1. */
function increment(channelId) {
  getDb().prepare(`
    INSERT INTO channel_counts (channel_id, count) VALUES (?, 1)
    ON CONFLICT(channel_id) DO UPDATE SET count = count + 1
  `).run(channelId);
}

/** Decrement a channel's invite count by 1 (floor 0). */
function decrement(channelId) {
  getDb().prepare(`
    UPDATE channel_counts
    SET    count = MAX(0, count - 1)
    WHERE  channel_id = ?
  `).run(channelId);
}

/** Returns true if this code has already been counted. */
function hasSeenCode(code) {
  return !!getDb()
    .prepare('SELECT 1 FROM seen_codes WHERE code = ?')
    .get(code);
}

/**
 * Records a code as counted.
 * @param {string}  code
 * @param {string}  channelId
 * @param {boolean} isBot – true for bot-created (referral) invites
 */
function markCode(code, channelId, isBot = false) {
  getDb().prepare(`
    INSERT OR IGNORE INTO seen_codes (code, channel_id, is_bot)
    VALUES (?, ?, ?)
  `).run(code, channelId, isBot ? 1 : 0);
}

/** Removes a code from tracking (called when invite is purged). */
function removeCode(code) {
  getDb().prepare('DELETE FROM seen_codes WHERE code = ?').run(code);
}

/** Returns all channel counts ordered highest → lowest. */
function getAllCounts() {
  return getDb()
    .prepare('SELECT * FROM channel_counts ORDER BY count DESC')
    .all();
}

module.exports = {
  SLOT_CAP,
  getDb,
  getCount,
  increment,
  decrement,
  hasSeenCode,
  markCode,
  removeCode,
  getAllCounts,
};
