import {
  ChatInputCommandInteraction,
  AutocompleteInteraction,
  SlashCommandBuilder,
  ChannelType,
  PermissionFlagsBits,
  MessageFlags,
  GuildChannel,
} from 'discord.js';
import { loadSnapshot, listSnapshots } from '../storage.js';

export const data = new SlashCommandBuilder()
  .setName('import-server')
  .setDescription('Apply a saved server snapshot to this server')
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
      .setDescription('Type CONFIRM to proceed')
      .setRequired(true)
  )
  .addBooleanOption(opt =>
    opt
      .setName('archive')
      .setDescription(
        'Archive existing channels into a hidden folder (visible only to admins) instead of deleting them'
      )
      .setRequired(false)
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
  const useArchive = interaction.options.getBoolean('archive') ?? false;

  if (confirm !== 'CONFIRM') {
    await interaction.reply({
      content: '❌ Escribe exactamente `CONFIRM` en el campo de confirmación para continuar.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const guild = interaction.guild;
  if (!guild) {
    await interaction.editReply('❌ Este comando solo puede usarse dentro de un servidor.');
    return;
  }

  const snapshot = loadSnapshot(snapshotName);
  if (!snapshot) {
    const available = listSnapshots();
    await interaction.editReply(
      `❌ No se encontró el snapshot \`${snapshotName}\`.\n` +
      (available.length
        ? `Snapshots disponibles: ${available.map(s => `\`${s}\``).join(', ')}`
        : 'No hay snapshots guardados. Usa `/copy-server` primero.')
    );
    return;
  }

  // Acknowledge early — the channel will be deleted/modified soon
  try {
    await interaction.editReply(
      `⏳ Importando \`${snapshotName}\`…${useArchive ? ' Los canales actuales serán archivados.' : ''} Esto tomará un momento.`
    );
  } catch { /* channel may vanish — that's OK */ }

  const log = (msg: string) => console.log(`[import-server] ${msg}`);

  try {
    await guild.fetch();
    await guild.roles.fetch();
    await guild.channels.fetch();

    if (useArchive) {
      // ── ARCHIVE MODE: move existing channels to a hidden category ────────────
      log('Archive mode: creating archive category…');

      const dateStr = new Date().toLocaleDateString('es-ES', {
        day: '2-digit', month: '2-digit', year: 'numeric',
      });

      // Create the archive category — deny @everyone ViewChannel
      // (Admins with the Administrator bit bypass channel overwrites automatically)
      const archiveCategory = await guild.channels.create({
        name: `📦 Archivo ${dateStr}`,
        type: ChannelType.GuildCategory,
        permissionOverwrites: [
          {
            id: guild.roles.everyone.id,
            deny: [PermissionFlagsBits.ViewChannel],
          },
        ],
      });

      // Move every non-category channel into the archive category
      log('Moving existing channels to archive…');
      const nonCategoryChannels = guild.channels.cache.filter(
        (c): c is GuildChannel =>
          c.type !== ChannelType.GuildCategory && c.id !== archiveCategory.id
      );

      for (const channel of nonCategoryChannels.values()) {
        try {
          await (channel as GuildChannel & { edit(opts: object): Promise<unknown> }).edit({
            parent: archiveCategory.id,
            lockPermissions: false, // keep channel-level overwrites intact
          });
          await sleep(350);
        } catch (e) {
          console.error('[import-server] Could not move channel to archive:', channel.name, e);
        }
      }

      // Delete existing categories (now empty)
      log('Removing old empty categories…');
      const oldCategories = guild.channels.cache.filter(
        c => c.type === ChannelType.GuildCategory && c.id !== archiveCategory.id
      );
      for (const cat of oldCategories.values()) {
        try {
          await cat.delete('Server import — archive mode');
          await sleep(300);
        } catch { /* skip if not deletable */ }
      }

    } else {
      // ── DELETE MODE: remove all channels ─────────────────────────────────────
      log('Deleting existing channels…');
      for (const channel of guild.channels.cache.values()) {
        try {
          await channel.delete('Server import');
          await sleep(350);
        } catch { /* skip undeletable channels */ }
      }
    }

    // ── Delete non-managed, non-everyone roles ──────────────────────────────
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

    // ── Create categories ───────────────────────────────────────────────────
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

    // ── Create channels ─────────────────────────────────────────────────────
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

    // ── Create roles ────────────────────────────────────────────────────────
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

    // ── Update guild info ───────────────────────────────────────────────────
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
      } catch { log('⚠️ Could not download server icon — skipping.'); }
    }

    await guild.edit(guildEdit);
    log('Import complete!');

    const resultMsg =
      `✅ **Servidor importado desde \`${snapshotName}\`!**\n` +
      `📋 Aplicado: **${snapshot.roles.length}** roles · **${snapshot.categories.length}** categorías · **${snapshot.channels.length}** canales\n` +
      (useArchive ? `📦 Los canales anteriores fueron archivados en **"📦 Archivo"** (solo visible para admins)\n` : '') +
      `🕐 Snapshot capturado: ${new Date(snapshot.capturedAt).toLocaleString()}`;

    // The original channel is gone — DM the user or post in a new channel
    try {
      await interaction.user.send(resultMsg);
    } catch {
      await guild.channels.fetch();
      const textChannel = guild.channels.cache.find(c => c.type === ChannelType.GuildText);
      if (textChannel?.isTextBased()) {
        await textChannel.send(resultMsg);
      }
    }

  } catch (err) {
    console.error('[import-server] Fatal error:', err);
    const errMsg =
      '❌ El import falló. Asegúrate de que el bot tiene permiso de **Administrador** y su rol está arriba de todos los demás en la lista de roles.';
    try { await interaction.user.send(errMsg); } catch { /* best effort */ }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
