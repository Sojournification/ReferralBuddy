'use strict';

const {
  SlashCommandBuilder, EmbedBuilder,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
} = require('discord.js');
const db      = require('../utils/database');
const { isAuthorized, denyUnauthorized } = require('../utils/auth');

// ─── Shared builders (also used by setupHandlers to refresh) ─────────────────

async function buildSetupEmbed(guild) {
  const logChannelId      = db.getConfig('log_channel_id');
  const referralChannelId = db.getConfig('referral_channel_id');
  const rewards           = db.listRoleRewards();
  const advertChannels    = db.listAdvertChannels();

  const logText      = logChannelId      ? `<#${logChannelId}>`      : '*Not set*';
  const referralText = referralChannelId ? `<#${referralChannelId}>` : '*Not set*';
  const rewardLines  = rewards.length
    ? rewards.map(r => `• <@&${r.role_id}> → **${r.points_awarded}** pt(s)`).join('\n')
    : '*None configured*';

  const joinEnabled = db.getConfig('join_points_enabled') !== '0';
  const joinValue   = db.getConfig('join_points_value') ?? '1';
  const joinText    = joinEnabled
    ? `✅ Enabled — **${joinValue}** pt(s) per join`
    : `❌ Disabled`;

  const advertEnabled = db.getConfig('advert_enabled') !== '0';
  const advertHours   = db.getConfig('advert_interval_hours') ?? '1';
  const advertChText  = advertChannels.length
    ? advertChannels.map(r => `• <#${r.channel_id}>`).join('\n')
    : '*None configured*';
  const advertStatus  = advertEnabled
    ? `✅ Enabled — every **${advertHours}** hour(s)\n${advertChText}`
    : `❌ Disabled\n${advertChText}`;

  return new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle('🛠️  ReferralBuddy Setup')
    .addFields(
      { name: '📋 Log Channel',      value: logText,      inline: true },
      { name: '🔗 Referral Channel', value: referralText, inline: true },
      { name: '​',                   value: '​',          inline: true },
      { name: '🎯 Join Points',      value: joinText,     inline: false },
      { name: '🏆 Milestone Roles',  value: rewardLines,  inline: false },
      { name: '📢 Chat Advert',      value: advertStatus, inline: false },
    )
    .setFooter({ text: 'Use the buttons below to configure the bot' })
    .setTimestamp();
}

function buildSetupRows() {
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('setup_btn_log_channel')
      .setLabel('Log Channel')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('📋'),
    new ButtonBuilder()
      .setCustomId('setup_btn_referral_channel')
      .setLabel('Referral Channel')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('🔗'),
    new ButtonBuilder()
      .setCustomId('setup_btn_post_panel')
      .setLabel('Post Panel')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('📢'),
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('setup_btn_join_points')
      .setLabel('Join Points')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('🎯'),
    new ButtonBuilder()
      .setCustomId('setup_btn_add_milestone')
      .setLabel('Add Milestone Role')
      .setStyle(ButtonStyle.Success)
      .setEmoji('➕'),
    new ButtonBuilder()
      .setCustomId('setup_btn_remove_milestone')
      .setLabel('Remove Milestone Role')
      .setStyle(ButtonStyle.Danger)
      .setEmoji('➖'),
  );

  const row3 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('setup_btn_chat_advert')
      .setLabel('Chat Advert')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('📢'),
  );

  return [row1, row2, row3];
}

// ─── Command ──────────────────────────────────────────────────────────────────

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Open the bot configuration panel'),

  buildSetupEmbed,
  buildSetupRows,

  async execute(interaction) {
    if (!isAuthorized(interaction.member)) return denyUnauthorized(interaction);
    await interaction.deferReply({ flags: 1 << 6 }); // ephemeral

    const embed = await buildSetupEmbed(interaction.guild);
    const rows  = buildSetupRows();

    return interaction.editReply({ embeds: [embed], components: rows });
  },
};
