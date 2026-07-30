import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  ChannelType,
  PermissionFlagsBits,
  GuildChannel,
  CategoryChannel,
  MessageFlags,
} from 'discord.js';
import { saveSnapshot } from '../storage.js';
import type { ServerSnapshot, RoleSnapshot, ChannelSnapshot } from '../types.js';

export const data = new SlashCommandBuilder()
  .setName('copy-server')
  .setDescription('Capture a full snapshot of this server (channels, roles, settings)')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addStringOption(opt =>
    opt
      .setName('name')
      .setDescription('Name to save this snapshot under (e.g. "my-server-backup")')
      .setRequired(true)
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const snapshotName = interaction.options.getString('name', true).trim();
  const guild = interaction.guild;

  if (!guild) {
    await interaction.editReply('❌ This command must be used inside a server.');
    return;
  }

  try {
    const fullGuild = await guild.fetch();
    await fullGuild.roles.fetch();
    await fullGuild.channels.fetch();

    // --- Roles ---
    const roles: RoleSnapshot[] = fullGuild.roles.cache
      .filter(r => !r.managed && r.name !== '@everyone')
      .sort((a, b) => a.position - b.position)
      .map(r => ({
        name: r.name,
        color: r.color,
        hoist: r.hoist,
        mentionable: r.mentionable,
        permissions: r.permissions.bitfield.toString(),
        position: r.position,
      }));

    // --- Categories ---
    const categoriesRaw = fullGuild.channels.cache
      .filter((c): c is CategoryChannel => c.type === ChannelType.GuildCategory)
      .sort((a, b) => a.position - b.position);

    const categoryIndexMap = new Map<string, number>();
    const categories: ChannelSnapshot[] = [];
    let idx = 0;
    for (const cat of categoriesRaw.values()) {
      categoryIndexMap.set(cat.id, idx++);
      categories.push({ name: cat.name, type: cat.type, position: cat.position });
    }

    // --- Non-category channels ---
    const channelTypes = new Set([
      ChannelType.GuildText,
      ChannelType.GuildVoice,
      ChannelType.GuildAnnouncement,
      ChannelType.GuildStageVoice,
      ChannelType.GuildForum,
    ]);

    const channels: ChannelSnapshot[] = fullGuild.channels.cache
      .filter((c): c is GuildChannel => channelTypes.has(c.type as ChannelType))
      .sort((a, b) => a.position - b.position)
      .map(c => {
        const snap: ChannelSnapshot = { name: c.name, type: c.type, position: c.position };
        if (c.parentId && categoryIndexMap.has(c.parentId)) {
          snap.parentIndex = categoryIndexMap.get(c.parentId);
        }
        if ('topic' in c && c.topic) snap.topic = c.topic;
        if ('nsfw' in c && c.nsfw) snap.nsfw = c.nsfw;
        if ('rateLimitPerUser' in c && c.rateLimitPerUser) snap.rateLimitPerUser = c.rateLimitPerUser;
        if ('bitrate' in c && c.bitrate) snap.bitrate = c.bitrate;
        if ('userLimit' in c && c.userLimit) snap.userLimit = c.userLimit;
        return snap;
      });

    const snapshot: ServerSnapshot = {
      name: fullGuild.name,
      description: fullGuild.description ?? undefined,
      iconURL: fullGuild.iconURL({ size: 256 }) ?? undefined,
      roles,
      categories,
      channels,
      capturedAt: new Date().toISOString(),
    };

    saveSnapshot(snapshotName, snapshot);

    await interaction.editReply(
      `✅ **"${fullGuild.name}"** snapshot saved as \`${snapshotName}\`!\n` +
      `📋 Captured: **${roles.length}** roles · **${categories.length}** categories · **${channels.length}** channels\n` +
      `Use \`/import-server name:${snapshotName}\` in another server to apply it.`
    );
  } catch (err) {
    console.error('[copy-server] Error:', err);
    await interaction.editReply('❌ Failed to capture server. Make sure the bot has **Administrator** permission.');
  }
}
