'use strict';

const db            = require('../utils/database');
const inviteCache   = require('../utils/inviteCache');
const inviteSlotsDb = require('../utils/inviteSlotsDb');
const { log, consoleLog } = require('../utils/logger');
const { runBackup } = require('../utils/backup');
const { purgeUnusedInvites } = require('../utils/invitePurge');
const { startAdvert } = require('../utils/advertManager');

module.exports = {
  name: 'ready',
  once: true,

  async execute(client) {
    consoleLog('info', `Logged in as ${client.user.tag}  (${client.user.id})`);

    // ── Rebuild invite cache ──────────────────────────────────────────────────
    for (const [, guild] of client.guilds.cache) {
      try {
        const invites = await guild.invites.fetch();
        inviteCache.rebuild(invites);

        // Sync invite codes into the DB.
        // Uses syncInviteCode so a restart never overwrites a human-claimed
        // record with the bot's ID (the bot creates invites on members' behalf).
        let newSlots = 0;
        for (const [, inv] of invites) {
          db.syncInviteCode(
            inv.code,
            inv.inviter?.id  ?? null,
            inv.inviter?.bot ?? false,
          );

          // ── Seed invite slot counts for non-bot invites ──────────────────
          // Bot-created referral invites are tracked when they are created.
          // Here we only count user-created invites we haven't seen before,
          // so channel slot totals reflect real server usage on startup.
          if (inv.inviter?.id === client.user.id) continue;
          const channelId = inv.channelId ?? inv.channel?.id;
          if (!channelId) continue;
          if (inviteSlotsDb.hasSeenCode(inv.code)) continue;
          inviteSlotsDb.increment(channelId);
          inviteSlotsDb.markCode(inv.code, channelId, false);
          newSlots++;
        }

        consoleLog('invite', `Cached ${invites.size} invite(s) for ${guild.name}${newSlots > 0 ? `, seeded ${newSlots} new slot count(s)` : ''}`);
      } catch (err) {
        consoleLog('error', `Could not fetch invites for ${guild.name}: ${err.message}`);
      }
    }

    // ── Catalogue all guild members ───────────────────────────────────────────
    let newCount      = 0;
    let existingCount = 0;

    for (const [, guild] of client.guilds.cache) {
      try {
        const members = await guild.members.fetch();
        for (const [, member] of members) {
          if (member.user.bot) continue;
          const existing = db.getMember(member.id);
          if (existing) {
            existingCount++;
          } else {
            db.upsertMember(member.id);
            newCount++;
          }
        }
      } catch (err) {
        consoleLog('error', `Could not catalogue members for ${guild.name}: ${err.message}`);
      }
    }

    await log(client, 'info', `Bot online. Catalogued **${newCount}** new member(s). **${existingCount}** already existed.`);

    // ── Automatic database backup ─────────────────────────────────────────────
    try {
      await runBackup(client);
    } catch (err) {
      consoleLog('error', `Startup backup failed: ${err.message}`);
    }

    // ── Purge unused invites (15+ days old, 0 uses) ───────────────────────────
    for (const [, guild] of client.guilds.cache) {
      try {
        const { purged } = await purgeUnusedInvites(guild, client);
        if (purged > 0) {
          consoleLog('info', `Purged ${purged} unused invite(s) for ${guild.name}`);
        }
      } catch (err) {
        consoleLog('error', `Invite purge failed for ${guild.name}: ${err.message}`);
      }
    }

    // ── Start chat advert timers ──────────────────────────────────────────────
    try {
      startAdvert(client);
      const enabled = db.getConfig('advert_enabled') !== '0';
      const count   = db.listAdvertChannels().length;
      if (enabled && count > 0) {
        consoleLog('info', `Chat advert started — ${count} channel timer(s) active.`);
      }
    } catch (err) {
      consoleLog('error', `Failed to start advert timers: ${err.message}`);
    }
  },
};
