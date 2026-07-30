import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  ChannelType,
  PermissionFlagsBits,
  OverwriteType,
} from 'discord.js';
import { loadSnapshot, listSnapshots } from '../storage.js';

export const data = new SlashCommandBuilder()
  .setName('import-server')
  .setDescription('Apply a saved server snapshot to this server (DESTRUCTIVE — replaces channels & roles)')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addStringOption(opt =>
    opt
      .setName('name')
      .setDescription('Name of the snapshot to import')
      .setRequired(true)
  )
  .addStringOption(opt =>
    opt
      .setName('confirm')
      .setDescription('Type CONFIRM to proceed (this will delete existing channels and roles)')
      .setRequired(true)
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  const snapshotName = interaction.options.getString('name', true).trim();
  const confirm = interaction.options.getString('confirm', true);

  if (confirm !== 'CONFIRM') {
    await interaction.reply({
      content: '❌ You must type exactly `CONFIRM` in the confirm field to proceed.',
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  const guild = interaction.guild;
  if (!guild) {
    await interaction.editReply('❌ This command must be used inside a server.');
    return;
  }

  const snapshot = loadSnapshot(snapshotName);
  if (!snapshot) {
    const available = listSnapshots();
    await interaction.editReply(
      `❌ Snapshot \`${snapshotName}\` not found.\n` +
      (available.length
        ? `Available snapshots: ${available.map(s => `\`${s}\``).join(', ')}`
        : 'No snapshots saved yet. Use `/copy-server` first.')
    );
    return;
  }

  const progress: string[] = [];
  const log = (msg: string) => {
    progress.push(msg);
    console.log(`[import-server] ${msg}`);
  };

  try {
    await guild.fetch();
    await guild.roles.fetch();
    await guild.channels.fetch();

    // ── 1. Delete non-system, non-managed channels ──────────────────────────
    log('Deleting existing channels…');
    const deletableChannels = guild.channels.cache.filter(
      c => !('flags' in c && c.flags?.has('IsSpam' as never))
    );
    for (const channel of deletableChannels.values()) {
      try {
        await channel.delete('Server import');
        await sleep(300);
      } catch {
        // skip channels we can't delete (system channel, etc.)
      }
    }

    // ── 2. Delete non-system, non-managed roles (skip @everyone) ────────────
    log('Deleting existing roles…');
    const deletableRoles = guild.roles.cache.filter(
      r => !r.managed && r.name !== '@everyone' && r.editable
    );
    for (const role of deletableRoles.values()) {
      try {
        await role.delete('Server import');
        await sleep(300);
      } catch {
        // skip roles we can't delete
      }
    }

    // ── 3. Create categories ─────────────────────────────────────────────────
    log('Creating categories…');
    const newCategoryIds: string[] = [];
    for (const cat of snapshot.categories) {
      try {
        const created = await guild.channels.create({
          name: cat.name,
          type: ChannelType.GuildCategory,
          position: cat.position,
        });
        newCategoryIds.push(created.id);
        await sleep(400);
      } catch (e) {
        console.error('[import-server] Failed to create category', cat.name, e);
        newCategoryIds.push('');
      }
    }

    // ── 4. Create channels ───────────────────────────────────────────────────
    log('Creating channels…');
    for (const ch of snapshot.channels) {
      try {
        const options: Parameters<typeof guild.channels.create>[0] = {
          name: ch.name,
          type: ch.type as ChannelType,
          position: ch.position,
        };

        if (ch.parentIndex !== undefined && newCategoryIds[ch.parentIndex]) {
          options.parent = newCategoryIds[ch.parentIndex];
        }
        if (ch.topic) options.topic = ch.topic;
        if (ch.nsfw) options.nsfw = ch.nsfw;
        if (ch.rateLimitPerUser) options.rateLimitPerUser = ch.rateLimitPerUser;
        if (ch.bitrate) options.bitrate = ch.bitrate;
        if (ch.userLimit) options.userLimit = ch.userLimit;

        await guild.channels.create(options as Parameters<typeof guild.channels.create>[0]);
        await sleep(400);
      } catch (e) {
        console.error('[import-server] Failed to create channel', ch.name, e);
      }
    }

    // ── 5. Create roles ──────────────────────────────────────────────────────
    log('Creating roles…');
    for (const r of snapshot.roles) {
      try {
        await guild.roles.create({
          name: r.name,
          color: r.color,
          hoist: r.hoist,
          mentionable: r.mentionable,
          permissions: BigInt(r.permissions),
          position: r.position,
        });
        await sleep(400);
      } catch (e) {
        console.error('[import-server] Failed to create role', r.name, e);
      }
    }

    // ── 6. Update guild info ─────────────────────────────────────────────────
    log('Updating server name and description…');
    const guildEdit: Parameters<typeof guild.edit>[0] = {
      name: snapshot.name,
    };
    if (snapshot.description) guildEdit.description = snapshot.description;

    if (snapshot.iconURL) {
      try {
        // Fetch icon and convert to base64 buffer for upload
        const res = await fetch(snapshot.iconURL);
        if (res.ok) {
          const buf = await res.arrayBuffer();
          const ext = snapshot.iconURL.includes('.png') ? 'png' : 'jpeg';
          guildEdit.icon = `data:image/${ext};base64,${Buffer.from(buf).toString('base64')}`;
        }
      } catch {
        log('⚠️  Could not download server icon — skipping.');
      }
    }

    await guild.edit(guildEdit);

    await interaction.editReply(
      `✅ Server successfully imported from snapshot \`${snapshotName}\`!\n` +
      `📋 Applied: **${snapshot.roles.length}** roles · **${snapshot.categories.length}** categories · **${snapshot.channels.length}** channels\n` +
      `🕐 Snapshot captured: ${new Date(snapshot.capturedAt).toLocaleString()}`
    );
  } catch (err) {
    console.error('[import-server] Fatal error:', err);
    await interaction.editReply(
      '❌ Import failed. Make sure the bot has **Administrator** permission and its role is at the top of the role list.'
    );
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
