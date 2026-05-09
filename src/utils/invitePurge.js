'use strict';

const { PermissionFlagsBits } = require('discord.js');
const db            = require('./database');
const inviteCache   = require('./inviteCache');
const inviteSlotsDb = require('./inviteSlotsDb');
const { log }       = require('./logger');

/**
 * Picks a random text channel in the guild that:
 *   – is viewable by @everyone
 *   – has fewer than SLOT_CAP (50) invites tracked in invite_slots.db
 *
 * Uses the in-memory channel cache — no extra API call.
 *
 * @param {Guild} guild
 * @returns {TextChannel|null}
 */
function findAvailableChannel(guild) {
  const everyoneRole = guild.roles.everyone;

  const candidates = [...guild.channels.cache.values()].filter(ch => {
    if (!ch.isTextBased()) return false;
    // Exclude threads, forums, etc. — only plain text / announcement channels
    const validTypes = [0, 5]; // GuildText = 0, GuildAnnouncement = 5
    if (!validTypes.includes(ch.type)) return false;
    // Must be viewable by @everyone
    if (!ch.permissionsFor(everyoneRole)?.has(PermissionFlagsBits.ViewChannel)) return false;
    // Must have slots available
    if (inviteSlotsDb.getCount(ch.id) >= inviteSlotsDb.SLOT_CAP) return false;
    return true;
  });

  if (!candidates.length) return null;

  // Random selection
  return candidates[Math.floor(Math.random() * candidates.length)];
}

/**
 * Purges invite codes that are 15+ days old with 0 uses.
 * Deletes from Discord, the main database, the invite cache,
 * and decrements the invite slot counter for each removed code.
 *
 * @param {Guild}  guild
 * @param {Client} client
 * @returns {Promise<{ purged: number, kept: number, errors: number }>}
 */
async function purgeUnusedInvites(guild, client) {
  const oldCodes = db.getOldInviteCodes(15);
  if (!oldCodes.length) return { purged: 0, kept: 0, errors: 0 };

  let guildInvites;
  try {
    guildInvites = await guild.invites.fetch();
  } catch (err) {
    throw new Error(`Could not fetch guild invites: ${err.message}`);
  }

  const liveMap = new Map();
  for (const [, inv] of guildInvites) liveMap.set(inv.code, inv);

  let purged = 0, kept = 0, errors = 0;

  for (const row of oldCodes) {
    const liveInvite = liveMap.get(row.code);

    if (!liveInvite) {
      // Already gone from Discord — tidy up everything
      db.deleteInviteCode(row.code);
      inviteCache.remove(row.code);
      inviteSlotsDb.decrement(
        inviteSlotsDb.getDb()
          .prepare('SELECT channel_id FROM seen_codes WHERE code = ?')
          .get(row.code)?.channel_id ?? ''
      );
      inviteSlotsDb.removeCode(row.code);
      purged++;
      continue;
    }

    if ((liveInvite.uses ?? 0) === 0) {
      // Only delete invites the bot itself created — never touch user invites
      if (liveInvite.inviter?.id !== client.user.id) {
        kept++;
        continue;
      }

      const channelId = liveInvite.channelId ?? liveInvite.channel?.id ?? '';

      try {
        await liveInvite.delete('Purging unused referral invite (15+ days old, 0 uses)');
        db.deleteInviteCode(row.code);
        inviteCache.remove(row.code);
        inviteSlotsDb.decrement(channelId);
        inviteSlotsDb.removeCode(row.code);
        purged++;
      } catch (err) {
        errors++;
        await log(client, 'warn', `Failed to delete unused invite \`${row.code}\`: ${err.message}`);
      }
    } else {
      kept++;
    }
  }

  if (purged > 0 || errors > 0) {
    await log(client, 'admin',
      `Invite purge complete — **${purged}** removed, **${kept}** kept (in use), **${errors}** error(s).`
    );
  }

  return { purged, kept, errors };
}

module.exports = { findAvailableChannel, purgeUnusedInvites };
