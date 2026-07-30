import {
  ChatInputCommandInteraction,
  AutocompleteInteraction,
  SlashCommandBuilder,
  ChannelType,
  PermissionFlagsBits,
  MessageFlags,
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
      .setAutocomplete(true)
  )
  .addStringOption(opt =>
    opt
      .setName('confirm')
      .setDescription('Type CONFIRM to proceed (this will delete existing channels and roles)')
      .setRequired(true)
  );

export async function autocomplete(interaction: AutocompleteInteraction) {
  const focused = interaction.options.getFocused().toLowerCase();
  const snapshots = listSnapshots();
  const filtered = snapshots
    .filter(s => s.toLowerCase().includes(focused))
    .slice(0, 25)
    .map(s => ({ name: s, value: s }));
  await interaction.respond(filtered);
}

export async function execute(interaction: ChatInputCommandInteraction) {
  const snapshotName = interaction.options.getString('name', true).trim();
  const confirm = interaction.options.getString('confirm', true);

  if (confirm !== 'CONFIRM') {
    await interaction.reply({
      content: '❌ You must type exactly `CONFIRM` in the confirm field to proceed.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

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

  // Try to acknowledge the user early since the channel will get deleted
  try {
    await interaction.editReply(
      `⏳ Importing \`${snapshotName}\`… This will take a moment. The server will be restructured.`
    );
  } catch { /* channel may be deleted before we can reply — that's OK */ }

  const log = (msg: string) => console.log(`[import-server] ${msg}`);

  let success = false;

  try {
    await guild.fetch();
    await guild.roles.fetch();
    await guild.channels.fetch();

    // ── 1. Delete non-system channels ────────────────────────────────────────
    log('Deleting existing channels…');
    for (const channel of guild.channels.cache.values()) {
      try {
        await channel.delete('Server import');
        await sleep(350);
      } catch { /* skip undeletable channels */ }
    }

    // ── 2. Delete non-managed, non-everyone roles ─────────────────────────────
    log('Deleting existing roles…');
    const deletableRoles = guild.roles.cache.filter(
      r => !r.managed && r.name !== '@everyone' && r.editable
    );
    for (const role of deletableRoles.values()) {
      try {
        await role.delete('Server import');
        await sleep(350);
      } catch { /* skip undeletable roles */ }
    }

    // ── 3. Create categories ──────────────────────────────────────────────────
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

    // ── 4. Create channels ────────────────────────────────────────────────────
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
        await guild.channels.create(options);
        await sleep(400);
      } catch (e) {
        console.error('[import-server] Failed to create channel', ch.name, e);
      }
    }

    // ── 5. Create roles ───────────────────────────────────────────────────────
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

    // ── 6. Update guild info ──────────────────────────────────────────────────
    log('Updating server name and description…');
    const guildEdit: Parameters<typeof guild.edit>[0] = { name: snapshot.name };
    if (snapshot.description) guildEdit.description = snapshot.description;

    if (snapshot.iconURL) {
      try {
        const res = await fetch(snapshot.iconURL);
        if (res.ok) {
          const buf = await res.arrayBuffer();
          const ext = snapshot.iconURL.includes('.png') ? 'png' : 'jpeg';
          guildEdit.icon = `data:image/${ext};base64,${Buffer.from(buf).toString('base64')}`;
        }
      } catch { log('⚠️  Could not download server icon — skipping.'); }
    }

    await guild.edit(guildEdit);
    success = true;
    log('Import complete!');

    // Try to DM the user with the result (the channel they used is gone)
    const resultMsg =
      `✅ **Server imported from \`${snapshotName}\`!**\n` +
      `📋 Applied: **${snapshot.roles.length}** roles · **${snapshot.categories.length}** categories · **${snapshot.channels.length}** channels\n` +
      `🕐 Snapshot captured: ${new Date(snapshot.capturedAt).toLocaleString()}`;

    try {
      await interaction.user.send(resultMsg);
    } catch {
      // DMs disabled — try to post in any available text channel
      await guild.channels.fetch();
      const textChannel = guild.channels.cache.find(c => c.type === ChannelType.GuildText);
      if (textChannel && textChannel.isTextBased()) {
        await textChannel.send(resultMsg);
      }
    }

  } catch (err) {
    console.error('[import-server] Fatal error:', err);
    const errMsg = '❌ Import failed partway through. Make sure the bot has **Administrator** permission and its role is at the top of the role list.';
    try {
      await interaction.user.send(errMsg);
    } catch {
      // best effort — nothing more we can do
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
