'use strict';

const {
  ActionRowBuilder,
  ChannelSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
} = require('discord.js');

const db                                 = require('./database');
const { log }                            = require('./logger');
const { isAuthorized, denyUnauthorized } = require('./auth');
const { startChannelTimer, stopChannelTimer, restartAdvert } = require('./advertManager');

// ─── Button handlers ──────────────────────────────────────────────────────────

async function handleSetupButton(interaction, client) {
  if (!isAuthorized(interaction.member)) return denyUnauthorized(interaction);

  const id = interaction.customId;

  // ── Log Channel ──────────────────────────────────────────────────────────────
  if (id === 'setup_btn_log_channel') {
    return interaction.showModal(
      new ModalBuilder()
        .setCustomId('setup_modal_log_channel')
        .setTitle('Set Log Channel')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('channel_id_input')
              .setLabel('Channel ID')
              .setStyle(TextInputStyle.Short)
              .setPlaceholder('Right-click the channel → Copy Channel ID')
              .setRequired(true)
              .setMaxLength(20),
          ),
        ),
    );
  }

  // ── Referral Channel ─────────────────────────────────────────────────────────
  if (id === 'setup_btn_referral_channel') {
    return interaction.showModal(
      new ModalBuilder()
        .setCustomId('setup_modal_referral_channel')
        .setTitle('Set Referral Channel')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('channel_id_input')
              .setLabel('Channel ID')
              .setStyle(TextInputStyle.Short)
              .setPlaceholder('Right-click the channel → Copy Channel ID')
              .setRequired(true)
              .setMaxLength(20),
          ),
        ),
    );
  }

  // ── Post Panel ───────────────────────────────────────────────────────────────
  if (id === 'setup_btn_post_panel') {
    await interaction.deferUpdate();

    const channelId = db.getConfig('referral_channel_id');
    if (!channelId) {
      return interaction.followUp({
        content: '❌ No referral channel set. Configure it first.',
        flags: 1 << 6,
      });
    }

    const channel = await interaction.guild.channels.fetch(channelId).catch(() => null);
    if (!channel?.isTextBased()) {
      return interaction.followUp({
        content: '❌ Referral channel not found or is not a text channel.',
        flags: 1 << 6,
      });
    }

    const bannerEmbed = new EmbedBuilder()
      .setImage('https://media.discordapp.net/attachments/1311207930833408091/1498621103961018388/Advert_01.png?ex=69f1d32a&is=69f081aa&hm=6b05785db39e6002fe863b72c4fde4ccd59d7a8880441c8fe0e643fa8644630f&=&format=webp&quality=lossless&width=1672&height=469');

    const panelEmbed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle('🔗  VILTROX REFERRAL BUDDY')
      .setDescription([
        '# REFER YOUR FRIENDS TO THE VILTROX COMMUNITY TO UNLOCK EXCLUSIVE REWARDS!',
        '',
        '**Click the button below to receive your personal invite link.**',
        'Share it with your photography friends — every milestone they hit in the community earns you points.',
        '',
        '**── Point Milestones ──**',
        '> 📥 **Friend joins the server',
        '> `→ +1 pt`',
        '> 1️⃣ Friend reaches 25 XP Points (Freshman Role)**',
        '> `→ +2 pt`',
        '> 2️⃣ **Friend reaches 500 XP Points (Frequent Chatter Role)**',
        '> `→ +5 pts`',
        '> 3️⃣ **Friend reaches 1,000 XP Points (Active Contributor)**',
        '> `→ +10 pts`',
        '> 4️⃣ **Friend reaches 10,000 XP Points (Viltrox Elite)**',
        '> `→ +100 pts`',
        '',
        '**── Rewards ──**',
        'Accumulate points to unlock exclusive rewards!',
        'Use `/stats` to check your current standing.',
        'Use `/leaderboard` to view the top inviters',
      ].join('\n'))
      .setFooter({ text: 'Your link is unique — do not share it with bots' });

    const panelRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('referral_get_link')
        .setLabel('Get My Referral Link')
        .setStyle(ButtonStyle.Success)
        .setEmoji('🔗'),
    );

    const infoRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('referral_btn_leaderboard')
        .setLabel('Leaderboard')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('🏆'),
      new ButtonBuilder()
        .setCustomId('referral_btn_stats')
        .setLabel('My Stats')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('📊'),
    );

    await channel.send({ embeds: [bannerEmbed, panelEmbed], components: [panelRow, infoRow] });
    await log(client, 'admin', `Admin \`${interaction.user.id}\` posted the referral panel in <#${channelId}>.`);

    return interaction.followUp({
      content: `✅ Panel posted in <#${channelId}>.`,
      flags: 1 << 6,
    });
  }

  // ── Join Points sub-panel ────────────────────────────────────────────────────
  if (id === 'setup_btn_join_points') {
    const enabled   = db.getConfig('join_points_enabled') !== '0';
    const value     = db.getConfig('join_points_value') ?? '1';
    const statusTxt = enabled
      ? `✅ Currently **enabled** — **${value}** pt(s) awarded per join`
      : `❌ Currently **disabled** — no points awarded on join`;

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('setup_join_enable')
        .setLabel('Enable')
        .setStyle(enabled ? ButtonStyle.Secondary : ButtonStyle.Success)
        .setEmoji('✅')
        .setDisabled(enabled),
      new ButtonBuilder()
        .setCustomId('setup_join_disable')
        .setLabel('Disable')
        .setStyle(enabled ? ButtonStyle.Danger : ButtonStyle.Secondary)
        .setEmoji('❌')
        .setDisabled(!enabled),
      new ButtonBuilder()
        .setCustomId('setup_join_customise')
        .setLabel('Customise Join Point(s)')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('🔢'),
    );

    return interaction.reply({
      content: `**🎯 Join Points**\n${statusTxt}`,
      components: [row],
      flags: 1 << 6,
    });
  }

  // ── Join Points: Enable ──────────────────────────────────────────────────────
  if (id === 'setup_join_enable') {
    db.setConfig('join_points_enabled', '1');
    const value = db.getConfig('join_points_value') ?? '1';
    await log(client, 'admin', `Admin \`${interaction.user.id}\` enabled join points (**${value}** pt(s) per join).`);
    return interaction.update({
      content: `✅ Join points **enabled** — referrers now earn **${value}** pt(s) when their invitee joins.`,
      components: [],
    });
  }

  // ── Join Points: Disable ─────────────────────────────────────────────────────
  if (id === 'setup_join_disable') {
    db.setConfig('join_points_enabled', '0');
    await log(client, 'admin', `Admin \`${interaction.user.id}\` disabled join points.`);
    return interaction.update({
      content: `❌ Join points **disabled** — no points will be awarded when a referral joins.`,
      components: [],
    });
  }

  // ── Join Points: Customise → modal ───────────────────────────────────────────
  if (id === 'setup_join_customise') {
    const current = db.getConfig('join_points_value') ?? '1';
    const modal = new ModalBuilder()
      .setCustomId('setup_modal_join_points')
      .setTitle('Customise Join Points');

    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('points_input')
          .setLabel('Points awarded to referrer on join')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('e.g. 5')
          .setValue(current)
          .setRequired(true)
          .setMaxLength(4),
      ),
    );

    return interaction.showModal(modal);
  }

  // ── Add Milestone Role ───────────────────────────────────────────────────────
  if (id === 'setup_btn_add_milestone') {
    const modal = new ModalBuilder()
      .setCustomId('setup_modal_add_milestone')
      .setTitle('Add Milestone Role');

    const roleInput = new TextInputBuilder()
      .setCustomId('role_input')
      .setLabel('Role name or Role ID')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('e.g. Verified  or  123456789012345678')
      .setRequired(true);

    const pointsInput = new TextInputBuilder()
      .setCustomId('points_input')
      .setLabel('Points to award the referrer')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('e.g. 10')
      .setRequired(true)
      .setMaxLength(6);

    modal.addComponents(
      new ActionRowBuilder().addComponents(roleInput),
      new ActionRowBuilder().addComponents(pointsInput),
    );

    return interaction.showModal(modal);
  }

  // ── Remove Milestone Role ────────────────────────────────────────────────────
  if (id === 'setup_btn_remove_milestone') {
    const rewards = db.listRoleRewards();
    if (!rewards.length) {
      return interaction.reply({
        content: '❌ No milestone roles are currently configured.',
        flags: 1 << 6,
      });
    }

    const modal = new ModalBuilder()
      .setCustomId('setup_modal_remove_milestone')
      .setTitle('Remove Milestone Role');

    const roleInput = new TextInputBuilder()
      .setCustomId('role_input')
      .setLabel('Role name or Role ID to remove')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('e.g. Verified  or  123456789012345678')
      .setRequired(true);

    modal.addComponents(new ActionRowBuilder().addComponents(roleInput));
    return interaction.showModal(modal);
  }

  // ── Chat Advert sub-panel ────────────────────────────────────────────────────
  if (id === 'setup_btn_chat_advert') {
    const enabled  = db.getConfig('advert_enabled') !== '0';
    const hours    = db.getConfig('advert_interval_hours') ?? '1';
    const channels = db.listAdvertChannels();
    const chText   = channels.length
      ? channels.map(r => `<#${r.channel_id}>`).join(', ')
      : '*None*';

    const statusTxt = enabled
      ? `✅ Currently **enabled** — posting every **${hours}** hour(s)\nChannels: ${chText}`
      : `❌ Currently **disabled**\nChannels: ${chText}`;

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('setup_advert_add_channel')
        .setLabel('Add Channel')
        .setStyle(ButtonStyle.Success)
        .setEmoji('➕'),
      new ButtonBuilder()
        .setCustomId('setup_advert_remove_channel')
        .setLabel('Remove Channel')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('➖'),
      new ButtonBuilder()
        .setCustomId('setup_advert_set_interval')
        .setLabel('Set Interval')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('⏱️'),
      new ButtonBuilder()
        .setCustomId('setup_advert_enable')
        .setLabel('Enable')
        .setStyle(enabled ? ButtonStyle.Secondary : ButtonStyle.Success)
        .setEmoji('✅')
        .setDisabled(enabled),
      new ButtonBuilder()
        .setCustomId('setup_advert_disable')
        .setLabel('Disable')
        .setStyle(enabled ? ButtonStyle.Danger : ButtonStyle.Secondary)
        .setEmoji('❌')
        .setDisabled(!enabled),
    );

    return interaction.reply({
      content: `**📢 Chat Advert**\n${statusTxt}`,
      components: [row],
      flags: 1 << 6,
    });
  }

  // ── Chat Advert: Add Channel ─────────────────────────────────────────────────
  if (id === 'setup_advert_add_channel') {
    return interaction.showModal(
      new ModalBuilder()
        .setCustomId('setup_modal_advert_add_channel')
        .setTitle('Add Advert Channel')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('channel_id_input')
              .setLabel('Channel ID')
              .setStyle(TextInputStyle.Short)
              .setPlaceholder('Right-click the channel → Copy Channel ID')
              .setRequired(true)
              .setMaxLength(20),
          ),
        ),
    );
  }

  // ── Chat Advert: Remove Channel ──────────────────────────────────────────────
  if (id === 'setup_advert_remove_channel') {
    const channels = db.listAdvertChannels();
    if (!channels.length) {
      return interaction.reply({ content: '❌ No advert channels are configured.', flags: 1 << 6 });
    }

    const select = new ChannelSelectMenuBuilder()
      .setCustomId('setup_select_advert_remove')
      .setPlaceholder('Select a channel to remove from the advert schedule')
      .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement);

    return interaction.reply({
      content: '**Select a channel to remove from the advert schedule:**',
      components: [new ActionRowBuilder().addComponents(select)],
      flags: 1 << 6,
    });
  }

  // ── Chat Advert: Set Interval ────────────────────────────────────────────────
  if (id === 'setup_advert_set_interval') {
    const current = db.getConfig('advert_interval_hours') ?? '1';
    const modal   = new ModalBuilder()
      .setCustomId('setup_modal_advert_interval')
      .setTitle('Set Advert Interval');

    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('hours_input')
          .setLabel('Hours between posts (e.g. 2 or 0.5)')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('e.g. 1')
          .setValue(current)
          .setRequired(true)
          .setMaxLength(6),
      ),
    );

    return interaction.showModal(modal);
  }

  // ── Chat Advert: Enable ──────────────────────────────────────────────────────
  if (id === 'setup_advert_enable') {
    db.setConfig('advert_enabled', '1');
    restartAdvert(client);
    await log(client, 'admin', `Admin \`${interaction.user.id}\` enabled the chat advert.`);
    return interaction.update({
      content: '✅ Chat advert **enabled** — timers started for all configured channels.',
      components: [],
    });
  }

  // ── Chat Advert: Disable ─────────────────────────────────────────────────────
  if (id === 'setup_advert_disable') {
    db.setConfig('advert_enabled', '0');
    restartAdvert(client); // stopAdvert inside restartAdvert will clear timers
    await log(client, 'admin', `Admin \`${interaction.user.id}\` disabled the chat advert.`);
    return interaction.update({
      content: '❌ Chat advert **disabled** — all timers stopped.',
      components: [],
    });
  }
}

// ─── Select menu handlers ─────────────────────────────────────────────────────

async function handleSetupSelect(interaction, client) {
  if (!isAuthorized(interaction.member)) return denyUnauthorized(interaction);

  const id = interaction.customId;


  if (id === 'setup_select_advert_remove') {
    const channelId = interaction.values[0];
    db.removeAdvertChannel(channelId);
    stopChannelTimer(channelId);
    await log(client, 'admin', `Admin \`${interaction.user.id}\` removed <#${channelId}> from the advert schedule.`);
    return interaction.update({ content: `✅ <#${channelId}> removed from the advert schedule.`, components: [] });
  }
}

// ─── Modal handlers ───────────────────────────────────────────────────────────

async function handleSetupModal(interaction, client) {
  if (!isAuthorized(interaction.member)) return denyUnauthorized(interaction);

  // ── Log Channel ──────────────────────────────────────────────────────────────
  if (interaction.customId === 'setup_modal_log_channel') {
    const channelId = interaction.fields.getTextInputValue('channel_id_input').trim().replace(/[<#>]/g, '');

    if (!/^\d{17,20}$/.test(channelId)) {
      return interaction.reply({ content: '❌ That doesn\'t look like a valid channel ID. Right-click the channel and select **Copy Channel ID**.', flags: 1 << 6 });
    }

    const channel = await interaction.guild.channels.fetch(channelId).catch(() => null);
    if (!channel?.isTextBased()) {
      return interaction.reply({ content: `❌ Could not find a text channel with ID \`${channelId}\`. Make sure the bot has access to it.`, flags: 1 << 6 });
    }

    db.setConfig('log_channel_id', channelId);
    await log(client, 'admin', `Admin \`${interaction.user.id}\` set log channel to <#${channelId}>.`);
    return interaction.reply({ content: `✅ Log channel set to <#${channelId}>.`, flags: 1 << 6 });
  }

  // ── Referral Channel ─────────────────────────────────────────────────────────
  if (interaction.customId === 'setup_modal_referral_channel') {
    const channelId = interaction.fields.getTextInputValue('channel_id_input').trim().replace(/[<#>]/g, '');

    if (!/^\d{17,20}$/.test(channelId)) {
      return interaction.reply({ content: '❌ That doesn\'t look like a valid channel ID. Right-click the channel and select **Copy Channel ID**.', flags: 1 << 6 });
    }

    const channel = await interaction.guild.channels.fetch(channelId).catch(() => null);
    if (!channel?.isTextBased()) {
      return interaction.reply({ content: `❌ Could not find a text channel with ID \`${channelId}\`. Make sure the bot has access to it.`, flags: 1 << 6 });
    }

    db.setConfig('referral_channel_id', channelId);
    await log(client, 'admin', `Admin \`${interaction.user.id}\` set referral channel to <#${channelId}>.`);
    return interaction.reply({ content: `✅ Referral channel set to <#${channelId}>.`, flags: 1 << 6 });
  }

  // ── Customise Join Points ────────────────────────────────────────────────────
  if (interaction.customId === 'setup_modal_join_points') {
    const raw    = interaction.fields.getTextInputValue('points_input').trim();
    const points = parseInt(raw, 10);

    if (isNaN(points) || points < 1) {
      return interaction.reply({ content: '❌ Points must be a positive whole number.', flags: 1 << 6 });
    }

    db.setConfig('join_points_value', String(points));
    await log(client, 'admin',
      `Admin \`${interaction.user.id}\` set join points to **${points}** pt(s) per join.`
    );

    return interaction.reply({
      content: `✅ Join points updated — referrers will now earn **${points}** pt(s) when their invitee joins.`,
      flags: 1 << 6,
    });
  }

  // ── Add Milestone Role ───────────────────────────────────────────────────────
  if (interaction.customId === 'setup_modal_add_milestone') {
    const roleRaw   = interaction.fields.getTextInputValue('role_input').trim();
    const pointsRaw = interaction.fields.getTextInputValue('points_input').trim();
    const points    = parseInt(pointsRaw, 10);

    if (isNaN(points) || points < 1) {
      return interaction.reply({ content: '❌ Points must be a positive whole number.', flags: 1 << 6 });
    }

    const role = await resolveRole(interaction.guild, roleRaw);
    if (!role) {
      return interaction.reply({
        content: `❌ Could not find a role matching \`${roleRaw}\`. Try using the exact role ID (right-click → Copy ID).`,
        flags: 1 << 6,
      });
    }

    db.upsertRoleReward(role.id, points);
    await log(client, 'admin',
      `Admin \`${interaction.user.id}\` added milestone role: <@&${role.id}> → **${points}** pts to referrer.`
    );

    return interaction.reply({
      content: `✅ <@&${role.id}> will now award **${points}** point(s) to referrers when their invitee receives it.`,
      flags: 1 << 6,
    });
  }

  // ── Chat Advert: Add Channel ─────────────────────────────────────────────────
  if (interaction.customId === 'setup_modal_advert_add_channel') {
    const channelId = interaction.fields.getTextInputValue('channel_id_input').trim().replace(/[<#>]/g, '');

    if (!/^\d{17,20}$/.test(channelId)) {
      return interaction.reply({ content: '❌ That doesn\'t look like a valid channel ID. Right-click the channel and select **Copy Channel ID**.', flags: 1 << 6 });
    }

    const channel = await interaction.guild.channels.fetch(channelId).catch(() => null);
    if (!channel?.isTextBased()) {
      return interaction.reply({ content: `❌ Could not find a text channel with ID \`${channelId}\`. Make sure the bot has access to it.`, flags: 1 << 6 });
    }

    db.addAdvertChannel(channelId);
    if (db.getConfig('advert_enabled') !== '0') startChannelTimer(channelId, client);
    await log(client, 'admin', `Admin \`${interaction.user.id}\` added <#${channelId}> to the advert schedule.`);

    return interaction.reply({
      content: `✅ <#${channelId}> added to the advert schedule.`,
      flags: 1 << 6,
    });
  }

  // ── Chat Advert: Set Interval ────────────────────────────────────────────────
  if (interaction.customId === 'setup_modal_advert_interval') {
    const raw   = interaction.fields.getTextInputValue('hours_input').trim();
    const hours = parseFloat(raw);

    if (isNaN(hours) || hours < 0.1) {
      return interaction.reply({ content: '❌ Interval must be a number ≥ 0.1 (e.g. 1 or 0.5).', flags: 1 << 6 });
    }

    db.setConfig('advert_interval_hours', String(hours));
    restartAdvert(client);
    await log(client, 'admin',
      `Admin \`${interaction.user.id}\` set advert interval to **${hours}** hour(s). Timers restarted.`
    );

    return interaction.reply({
      content: `✅ Advert interval set to **${hours}** hour(s). All timers restarted.`,
      flags: 1 << 6,
    });
  }

  // ── Remove Milestone Role ────────────────────────────────────────────────────
  if (interaction.customId === 'setup_modal_remove_milestone') {
    const roleRaw = interaction.fields.getTextInputValue('role_input').trim();

    const role = await resolveRole(interaction.guild, roleRaw);
    if (!role) {
      return interaction.reply({
        content: `❌ Could not find a role matching \`${roleRaw}\`. Try using the exact role ID (right-click → Copy ID).`,
        flags: 1 << 6,
      });
    }

    const existing = db.listRoleRewards().find(r => r.role_id === role.id);
    if (!existing) {
      return interaction.reply({
        content: `❌ <@&${role.id}> is not configured as a milestone role.`,
        flags: 1 << 6,
      });
    }

    db.deleteRoleReward(role.id);
    await log(client, 'admin', `Admin \`${interaction.user.id}\` removed milestone role <@&${role.id}>.`);
    return interaction.reply({
      content: `✅ Milestone role <@&${role.id}> has been removed.`,
      flags: 1 << 6,
    });
  }
}

// ─── Helper: resolve a role by ID or name (case-insensitive) ─────────────────

async function resolveRole(guild, input) {
  // Try as ID first
  if (/^\d{17,20}$/.test(input)) {
    const byId = guild.roles.cache.get(input)
      ?? await guild.roles.fetch(input).catch(() => null);
    if (byId) return byId;
  }

  // Try case-insensitive name match
  await guild.roles.fetch(); // ensure cache is populated
  const lower = input.toLowerCase();
  return guild.roles.cache.find(r => r.name.toLowerCase() === lower) ?? null;
}

// ─── Route helpers ────────────────────────────────────────────────────────────

const SETUP_BUTTON_IDS = new Set([
  'setup_btn_log_channel',
  'setup_btn_referral_channel',
  'setup_btn_post_panel',
  'setup_btn_join_points',
  'setup_join_enable',
  'setup_join_disable',
  'setup_join_customise',
  'setup_btn_add_milestone',
  'setup_btn_remove_milestone',
  'setup_btn_chat_advert',
  'setup_advert_add_channel',
  'setup_advert_remove_channel',
  'setup_advert_set_interval',
  'setup_advert_enable',
  'setup_advert_disable',
]);

const SETUP_SELECT_IDS = new Set([
  'setup_select_advert_remove',
]);

const SETUP_MODAL_IDS = new Set([
  'setup_modal_log_channel',
  'setup_modal_referral_channel',
  'setup_modal_join_points',
  'setup_modal_add_milestone',
  'setup_modal_remove_milestone',
  'setup_modal_advert_add_channel',
  'setup_modal_advert_interval',
]);

function isSetupButton(id) { return SETUP_BUTTON_IDS.has(id); }
function isSetupSelect(id) { return SETUP_SELECT_IDS.has(id); }
function isSetupModal(id)  { return SETUP_MODAL_IDS.has(id); }

module.exports = {
  handleSetupButton,
  handleSetupSelect,
  handleSetupModal,
  isSetupButton,
  isSetupSelect,
  isSetupModal,
};
