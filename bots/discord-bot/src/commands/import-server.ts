import {
  ChatInputCommandInteraction,
  AutocompleteInteraction,
  StringSelectMenuInteraction,
  ButtonInteraction,
  SlashCommandBuilder,
  ChannelType,
  PermissionFlagsBits,
  MessageFlags,
  GuildChannel,
  Role,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  TextChannel,
  VoiceChannel,
  CategoryChannel,
} from 'discord.js';
import { loadSnapshot, listSnapshots } from '../storage.js';
import type { PermissionOverwriteSnapshot } from '../types.js';

// ── Options definition ────────────────────────────────────────────────────────
export const IMPORT_OPTIONS = [
  { value: 'name',        label: 'Nombre del servidor',  description: 'Cambia el nombre del servidor' },
  { value: 'icon',        label: 'Icono del servidor',   description: 'Aplica el icono guardado' },
  { value: 'description', label: 'Descripción',          description: 'Aplica la descripción del servidor' },
  { value: 'roles',       label: 'Roles',                description: 'Crea y reordena los roles del snapshot' },
  { value: 'channels',    label: 'Canales y categorías', description: 'Crea todos los canales y categorías' },
  { value: 'permissions', label: 'Permisos de canales',  description: 'Aplica los permisos de cada canal' },
] as const;

type ImportOptionValue = typeof IMPORT_OPTIONS[number]['value'];

// ── In-memory pending state ───────────────────────────────────────────────────
interface PendingImport {
  snapshotName: string;
  useArchive: boolean;
  selectedOptions: Set<ImportOptionValue>;
}

const pendingImports = new Map<string, PendingImport>();

function pendingKey(userId: string, guildId: string) {
  return `${userId}:${guildId}`;
}

// ── Command definition ────────────────────────────────────────────────────────
export const data = new SlashCommandBuilder()
  .setName('import-server')
  .setDescription('Aplica un snapshot guardado a este servidor')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addStringOption(opt =>
    opt
      .setName('name')
      .setDescription('Nombre del snapshot a importar')
      .setRequired(true)
      .setAutocomplete(true)
  )
  .addBooleanOption(opt =>
    opt
      .setName('archive')
      .setDescription('Archivar canales no coincidentes en una carpeta oculta en vez de eliminarlos')
      .setRequired(false)
  );

// ── UI helpers ────────────────────────────────────────────────────────────────
function buildSelectMenu(userId: string, guildId: string, selected: Set<ImportOptionValue>) {
  return new StringSelectMenuBuilder()
    .setCustomId(`import_select:${userId}:${guildId}`)
    .setPlaceholder('Elige qué elementos copiar')
    .setMinValues(1)
    .setMaxValues(IMPORT_OPTIONS.length)
    .addOptions(
      IMPORT_OPTIONS.map(opt =>
        new StringSelectMenuOptionBuilder()
          .setValue(opt.value)
          .setLabel(opt.label)
          .setDescription(opt.description)
          .setDefault(selected.has(opt.value))
      )
    );
}

function buildButtonRow(userId: string, guildId: string) {
  const confirmBtn = new ButtonBuilder()
    .setCustomId(`import_confirm:${userId}:${guildId}`)
    .setLabel('Confirmar')
    .setStyle(ButtonStyle.Danger);

  const cancelBtn = new ButtonBuilder()
    .setCustomId(`import_cancel:${userId}:${guildId}`)
    .setLabel('Cancelar')
    .setStyle(ButtonStyle.Secondary);

  return new ActionRowBuilder<ButtonBuilder>().addComponents(confirmBtn, cancelBtn);
}

// ── Autocomplete ──────────────────────────────────────────────────────────────
export async function autocomplete(interaction: AutocompleteInteraction) {
  const focused = interaction.options.getFocused().toLowerCase();
  const snapshots = listSnapshots();
  const filtered = snapshots
    .filter(s => s.toLowerCase().includes(focused))
    .slice(0, 25)
    .map(s => ({ name: s, value: s }));
  await interaction.respond(filtered);
}

// ── Slash command handler ─────────────────────────────────────────────────────
export async function execute(interaction: ChatInputCommandInteraction) {
  const snapshotName = interaction.options.getString('name', true).trim();
  const useArchive = interaction.options.getBoolean('archive') ?? false;

  const guild = interaction.guild;
  if (!guild) {
    await interaction.reply({
      content: '❌ Este comando solo puede usarse dentro de un servidor.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const snapshot = loadSnapshot(snapshotName);
  if (!snapshot) {
    const available = listSnapshots();
    await interaction.reply({
      content:
        `❌ No se encontró el snapshot \`${snapshotName}\`.\n` +
        (available.length
          ? `Disponibles: ${available.map(s => `\`${s}\``).join(', ')}`
          : 'No hay snapshots guardados. Usa `/copy-server` primero.'),
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const allSelected = new Set(IMPORT_OPTIONS.map(o => o.value));
  pendingImports.set(pendingKey(interaction.user.id, guild.id), {
    snapshotName,
    useArchive,
    selectedOptions: allSelected,
  });

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(`⚠️ Importar snapshot: \`${snapshotName}\``)
    .setDescription(
      `Vas a aplicar este snapshot al servidor **${guild.name}**.\n\n` +
      `Usa el menú para elegir qué elementos copiar — todo está seleccionado por defecto.\n` +
      `Los canales y roles con el mismo nombre **no se borrarán** — solo se actualizarán sus permisos.\n\n` +
      (useArchive
        ? '📦 Los canales sin coincidencia serán **archivados** en una carpeta oculta para admins.'
        : '🗑️ Los canales y roles sin coincidencia serán **eliminados**.')
    )
    .addFields(
      { name: 'Roles',       value: `${snapshot.roles.length}`,      inline: true },
      { name: 'Categorías',  value: `${snapshot.categories.length}`, inline: true },
      { name: 'Canales',     value: `${snapshot.channels.length}`,   inline: true },
      { name: 'Capturado',   value: new Date(snapshot.capturedAt).toLocaleString('es-ES'), inline: false },
    );

  const selectRow = new ActionRowBuilder<StringSelectMenuBuilder>()
    .addComponents(buildSelectMenu(interaction.user.id, guild.id, allSelected));

  await interaction.reply({
    embeds: [embed],
    components: [selectRow, buildButtonRow(interaction.user.id, guild.id)],
    flags: MessageFlags.Ephemeral,
  });
}

// ── Select menu interaction ───────────────────────────────────────────────────
export async function handleSelectMenu(interaction: StringSelectMenuInteraction) {
  const parts = interaction.customId.split(':');
  const userId = parts[1];
  const guildId = parts[2];
  const key = pendingKey(userId, guildId);
  const pending = pendingImports.get(key);

  if (!pending) {
    await interaction.update({ content: '❌ Esta sesión expiró. Vuelve a usar `/import-server`.', components: [], embeds: [] });
    return;
  }

  pending.selectedOptions = new Set(interaction.values as ImportOptionValue[]);

  const selectRow = new ActionRowBuilder<StringSelectMenuBuilder>()
    .addComponents(buildSelectMenu(userId, guildId, pending.selectedOptions));

  await interaction.update({ components: [selectRow, buildButtonRow(userId, guildId)] });
}

// ── Button interaction ────────────────────────────────────────────────────────
export async function handleButton(interaction: ButtonInteraction) {
  const parts = interaction.customId.split(':');
  const action = parts[0];
  const userId = parts[1];
  const guildId = parts[2];
  const key = pendingKey(userId, guildId);
  const pending = pendingImports.get(key);

  if (action === 'import_cancel') {
    pendingImports.delete(key);
    await interaction.update({ content: '❌ Importación cancelada.', components: [], embeds: [] });
    return;
  }

  if (!pending) {
    await interaction.update({ content: '❌ Esta sesión expiró. Vuelve a usar `/import-server`.', components: [], embeds: [] });
    return;
  }

  pendingImports.delete(key);

  const guild = interaction.guild;
  if (!guild) {
    await interaction.update({ content: '❌ No se puede acceder al servidor.', components: [], embeds: [] });
    return;
  }

  const snapshot = loadSnapshot(pending.snapshotName);
  if (!snapshot) {
    await interaction.update({ content: `❌ El snapshot \`${pending.snapshotName}\` ya no existe.`, components: [], embeds: [] });
    return;
  }

  const sel = pending.selectedOptions;
  const useArchive = pending.useArchive;

  await interaction.update({
    content: `⏳ Importando \`${pending.snapshotName}\`… Esto puede tardar un momento.`,
    components: [],
    embeds: [],
  });

  const log = (msg: string) => console.log(`[import-server] ${msg}`);

  try {
    await guild.fetch();
    await guild.roles.fetch();
    await guild.channels.fetch();

    // ── Helper: convert stored overwrites to Discord API format ─────────────
    const roleNameToId = new Map<string, string>();

    function buildOverwrites(overwrites: PermissionOverwriteSnapshot[] | undefined) {
      if (!sel.has('permissions') || !overwrites?.length) return undefined;
      return overwrites
        .filter(o => o.type === 'role' && roleNameToId.has(o.name))
        .map(o => ({
          id: roleNameToId.get(o.name)!,
          allow: BigInt(o.allow),
          deny: BigInt(o.deny),
        }));
    }

    // ── 1. Roles ─────────────────────────────────────────────────────────────
    if (sel.has('roles')) {
      // Build snapshot role name set (excluding @everyone)
      const snapshotRoleNames = new Set(snapshot.roles.map(r => r.name));

      // Update existing roles that appear in the snapshot
      const createdRoles: Array<{ role: Role; desiredPosition: number }> = [];

      for (const existingRole of guild.roles.cache.values()) {
        if (existingRole.managed || existingRole.name === '@everyone') continue;

        if (snapshotRoleNames.has(existingRole.name)) {
          // Role exists in both — update its properties instead of recreating
          const snap = snapshot.roles.find(r => r.name === existingRole.name)!;
          try {
            const updated = await existingRole.edit({
              color: snap.color,
              hoist: snap.hoist,
              mentionable: snap.mentionable,
              permissions: BigInt(snap.permissions),
            });
            createdRoles.push({ role: updated, desiredPosition: snap.position });
            log(`Updated existing role: ${existingRole.name}`);
            await sleep(300);
          } catch (e) {
            console.error('[import-server] Failed to update role', existingRole.name, e);
          }
        } else {
          // Role not in snapshot — delete it
          if (existingRole.editable) {
            try { await existingRole.delete('Server import'); await sleep(300); } catch { /* skip */ }
          }
        }
      }

      // Refresh cache after deletions
      await guild.roles.fetch();

      // Create roles that exist in snapshot but not in guild
      const existingRoleNames = new Set(guild.roles.cache.map(r => r.name));
      for (const snap of snapshot.roles) {
        if (existingRoleNames.has(snap.name)) continue; // already handled above
        try {
          const created = await guild.roles.create({
            name: snap.name,
            color: snap.color,
            hoist: snap.hoist,
            mentionable: snap.mentionable,
            permissions: BigInt(snap.permissions),
          });
          createdRoles.push({ role: created, desiredPosition: snap.position });
          log(`Created new role: ${snap.name}`);
          await sleep(350);
        } catch (e) {
          console.error('[import-server] Failed to create role', snap.name, e);
        }
      }

      // Reorder roles by their original snapshot position.
      // We do a fresh fetch so any roles that errored during create/edit are
      // still included, then look up each role by name to build a clean
      // position list. Roles are sorted ascending (lowest rank first) and
      // assigned sequential positions 1..N so Discord places them correctly
      // (higher sequential number = higher in the role list).
      try {
        await guild.roles.fetch();
        const sortedSnap = [...snapshot.roles].sort((a, b) => a.position - b.position);
        const positionData: Array<{ role: string; position: number }> = [];
        for (let i = 0; i < sortedSnap.length; i++) {
          const guildRole = guild.roles.cache.find(r => r.name === sortedSnap[i].name);
          if (guildRole) positionData.push({ role: guildRole.id, position: i + 1 });
        }
        if (positionData.length > 0) {
          await guild.roles.setPositions(positionData);
          log(`Roles reordered (${positionData.length} roles).`);
        }
      } catch (e) {
        console.error('[import-server] Could not reorder roles (non-fatal):', e);
      }
    }

    // ── 2. Build roleNameToId map (after role changes) ────────────────────────
    await guild.roles.fetch();
    roleNameToId.set('@everyone', guild.roles.everyone.id);
    for (const r of guild.roles.cache.values()) roleNameToId.set(r.name, r.id);

    // ── 3. Channels ──────────────────────────────────────────────────────────
    if (sel.has('channels')) {
      await guild.channels.fetch();

      // Index existing channels/categories by name (lowercase) for matching
      const existingCatsByName = new Map<string, CategoryChannel>();
      const existingChannelsByNameType = new Map<string, GuildChannel>();

      for (const ch of guild.channels.cache.values()) {
        if (ch.type === ChannelType.GuildCategory) {
          existingCatsByName.set(ch.name.toLowerCase(), ch as CategoryChannel);
        } else {
          const key = `${ch.name.toLowerCase()}|${ch.type}`;
          existingChannelsByNameType.set(key, ch as GuildChannel);
        }
      }

      const snapshotCatNames = new Set(snapshot.categories.map(c => c.name.toLowerCase()));
      const snapshotChannelKeys = new Set(
        snapshot.channels.map(c => `${c.name.toLowerCase()}|${c.type}`)
      );

      // Separate matched vs unmatched existing channels
      const unmatchedNonCat: GuildChannel[] = [];
      const unmatchedCats: CategoryChannel[] = [];

      for (const ch of guild.channels.cache.values()) {
        if (ch.type === ChannelType.GuildCategory) {
          if (!snapshotCatNames.has(ch.name.toLowerCase())) {
            unmatchedCats.push(ch as CategoryChannel);
          }
        } else {
          const key = `${ch.name.toLowerCase()}|${ch.type}`;
          if (!snapshotChannelKeys.has(key)) {
            unmatchedNonCat.push(ch as GuildChannel);
          }
        }
      }

      // Handle unmatched non-category channels (archive or delete)
      if (unmatchedNonCat.length > 0) {
        if (useArchive) {
          log('Archive mode: creating archive category for unmatched channels…');
          const dateStr = new Date().toLocaleDateString('es-ES', {
            day: '2-digit', month: '2-digit', year: 'numeric',
          });
          const archiveCategory = await guild.channels.create({
            name: `📦 Archivo ${dateStr}`,
            type: ChannelType.GuildCategory,
            permissionOverwrites: [
              { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
            ],
          });
          for (const ch of unmatchedNonCat) {
            try {
              await (ch as GuildChannel & { edit(opts: object): Promise<unknown> }).edit({
                parent: archiveCategory.id,
                lockPermissions: false,
              });
              await sleep(350);
            } catch (e) {
              console.error('[import-server] Could not archive channel:', ch.name, e);
            }
          }
        } else {
          for (const ch of unmatchedNonCat) {
            try { await ch.delete('Server import'); await sleep(300); } catch { /* skip */ }
          }
        }
      }

      // Delete unmatched categories (after channels are moved out)
      for (const cat of unmatchedCats) {
        try { await cat.delete('Server import'); await sleep(300); } catch { /* skip */ }
      }

      // Process categories: create new ones, update permissions on existing
      const newCategoryIds: string[] = [];
      for (const snapCat of snapshot.categories) {
        const existing = existingCatsByName.get(snapCat.name.toLowerCase());
        if (existing) {
          // Already exists — update permissions if selected
          if (sel.has('permissions')) {
            const overwrites = buildOverwrites(snapCat.permissionOverwrites);
            if (overwrites?.length) {
              try {
                await existing.permissionOverwrites.set(overwrites);
                await sleep(300);
              } catch (e) {
                console.error('[import-server] Failed to update category permissions:', snapCat.name, e);
              }
            }
          }
          newCategoryIds.push(existing.id);
          log(`Kept existing category: ${snapCat.name}`);
        } else {
          // Create new category
          try {
            const opts: Parameters<typeof guild.channels.create>[0] = {
              name: snapCat.name,
              type: ChannelType.GuildCategory,
              position: snapCat.position,
            };
            const overwrites = buildOverwrites(snapCat.permissionOverwrites);
            if (overwrites?.length) opts.permissionOverwrites = overwrites;
            const created = await guild.channels.create(opts);
            newCategoryIds.push(created.id);
            log(`Created new category: ${snapCat.name}`);
            await sleep(400);
          } catch (e) {
            console.error('[import-server] Failed to create category:', snapCat.name, e);
            newCategoryIds.push('');
          }
        }
      }

      // Refresh channel cache
      await guild.channels.fetch();

      // Process channels: update existing, create new
      for (const snapCh of snapshot.channels) {
        const matchKey = `${snapCh.name.toLowerCase()}|${snapCh.type}`;
        const existing = existingChannelsByNameType.get(matchKey);
        const parentId = snapCh.parentIndex !== undefined
          ? (newCategoryIds[snapCh.parentIndex] ?? null)
          : null;

        if (existing) {
          // Channel exists — update permissions and parent if needed
          log(`Updating existing channel: ${snapCh.name}`);
          try {
            const editOpts: Record<string, unknown> = {};
            if (parentId) editOpts.parent = parentId;

            if (sel.has('permissions')) {
              const overwrites = buildOverwrites(snapCh.permissionOverwrites);
              if (overwrites?.length) editOpts.permissionOverwrites = overwrites;
            }

            if (Object.keys(editOpts).length > 0) {
              await (existing as TextChannel | VoiceChannel).edit(editOpts as never);
              await sleep(300);
            }
          } catch (e) {
            console.error('[import-server] Failed to update channel:', snapCh.name, e);
          }
        } else {
          // Create new channel
          try {
            const opts: Parameters<typeof guild.channels.create>[0] = {
              name: snapCh.name,
              type: snapCh.type as never,
              position: snapCh.position,
            };
            if (parentId) opts.parent = parentId;
            if (snapCh.topic) opts.topic = snapCh.topic;
            if (snapCh.nsfw) opts.nsfw = snapCh.nsfw;
            if (snapCh.rateLimitPerUser) opts.rateLimitPerUser = snapCh.rateLimitPerUser;
            if (snapCh.bitrate) opts.bitrate = snapCh.bitrate;
            if (snapCh.userLimit) opts.userLimit = snapCh.userLimit;

            const overwrites = buildOverwrites(snapCh.permissionOverwrites);
            if (overwrites?.length) opts.permissionOverwrites = overwrites;

            await guild.channels.create(opts);
            log(`Created new channel: ${snapCh.name}`);
            await sleep(400);
          } catch (e) {
            console.error('[import-server] Failed to create channel:', snapCh.name, e);
          }
        }
      }
    }

    // ── 4. Update guild info ─────────────────────────────────────────────────
    const guildEdit: Parameters<typeof guild.edit>[0] = {};
    if (sel.has('name'))        guildEdit.name        = snapshot.name;
    if (sel.has('description') && snapshot.description) guildEdit.description = snapshot.description;

    if (sel.has('icon') && snapshot.iconURL) {
      try {
        const res = await fetch(snapshot.iconURL);
        if (res.ok) {
          const buf = await res.arrayBuffer();
          const ext = snapshot.iconURL.includes('.png') ? 'png' : 'jpeg';
          guildEdit.icon = `data:image/${ext};base64,${Buffer.from(buf).toString('base64')}`;
        }
      } catch { log('⚠️ No se pudo descargar el icono — se omite.'); }
    }

    if (Object.keys(guildEdit).length > 0) await guild.edit(guildEdit);

    log('Import complete!');

    // ── 5. Send result ───────────────────────────────────────────────────────
    const applied: string[] = [];
    if (sel.has('roles'))       applied.push(`**${snapshot.roles.length}** roles`);
    if (sel.has('channels'))    applied.push(`**${snapshot.categories.length}** categorías · **${snapshot.channels.length}** canales`);
    if (sel.has('permissions')) applied.push('permisos de canales');
    if (sel.has('name'))        applied.push('nombre');
    if (sel.has('icon'))        applied.push('icono');
    if (sel.has('description')) applied.push('descripción');

    const resultMsg =
      `✅ **Servidor importado desde \`${pending.snapshotName}\`!**\n` +
      `📋 Aplicado: ${applied.join(' · ')}\n` +
      `🔄 Canales y roles con el mismo nombre fueron actualizados sin borrarse.\n` +
      (useArchive ? `📦 Los canales sin coincidencia fueron archivados en **"📦 Archivo"**\n` : '') +
      `🕐 Snapshot capturado: ${new Date(snapshot.capturedAt).toLocaleString()}`;

    try {
      await interaction.user.send(resultMsg);
    } catch {
      await guild.channels.fetch();
      const textChannel = guild.channels.cache.find(c => c.type === ChannelType.GuildText);
      if (textChannel?.isTextBased()) await textChannel.send(resultMsg);
    }

  } catch (err) {
    console.error('[import-server] Fatal error:', err);
    const errMsg = '❌ El import falló. Asegúrate de que el bot tiene permiso de **Administrador** y su rol está por encima de todos los demás.';
    try { await interaction.user.send(errMsg); } catch { /* best effort */ }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
