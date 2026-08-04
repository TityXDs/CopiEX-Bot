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
      .setDescription('Archivar canales actuales en una carpeta oculta en vez de eliminarlos')
      .setRequired(false)
  );

// ── Helpers ───────────────────────────────────────────────────────────────────
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

  // Store pending state — all options selected by default
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
      `Usa el menú para elegir qué elementos copiar — todo está seleccionado por defecto.\n\n` +
      (useArchive
        ? '📦 Los canales actuales serán **archivados** en una carpeta oculta para admins.'
        : '🗑️ Los canales y roles actuales serán **eliminados**.')
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
    await interaction.update({
      content: '❌ Esta sesión expiró. Vuelve a usar `/import-server`.',
      components: [],
      embeds: [],
    });
    return;
  }

  pending.selectedOptions = new Set(interaction.values as ImportOptionValue[]);

  const selectRow = new ActionRowBuilder<StringSelectMenuBuilder>()
    .addComponents(buildSelectMenu(userId, guildId, pending.selectedOptions));

  await interaction.update({
    components: [selectRow, buildButtonRow(userId, guildId)],
  });
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
    await interaction.update({
      content: '❌ Importación cancelada.',
      components: [],
      embeds: [],
    });
    return;
  }

  // import_confirm
  if (!pending) {
    await interaction.update({
      content: '❌ Esta sesión expiró. Vuelve a usar `/import-server`.',
      components: [],
      embeds: [],
    });
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
    await interaction.update({
      content: `❌ El snapshot \`${pending.snapshotName}\` ya no existe.`,
      components: [],
      embeds: [],
    });
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

    // ── 1. Handle existing channels ──────────────────────────────────────────
    if (sel.has('channels')) {
      if (useArchive) {
        log('Archive mode: creating archive category…');
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
        const nonCategoryChannels = guild.channels.cache.filter(
          (c): c is GuildChannel =>
            c.type !== ChannelType.GuildCategory && c.id !== archiveCategory.id
        );
        for (const channel of nonCategoryChannels.values()) {
          try {
            await (channel as GuildChannel & { edit(opts: object): Promise<unknown> }).edit({
              parent: archiveCategory.id,
              lockPermissions: false,
            });
            await sleep(350);
          } catch (e) {
            console.error('[import-server] Could not move channel to archive:', channel.name, e);
          }
        }
        const oldCategories = guild.channels.cache.filter(
          c => c.type === ChannelType.GuildCategory && c.id !== archiveCategory.id
        );
        for (const cat of oldCategories.values()) {
          try { await cat.delete('Server import — archive mode'); await sleep(300); } catch { /* skip */ }
        }
      } else {
        log('Deleting existing channels…');
        for (const channel of guild.channels.cache.values()) {
          try { await channel.delete('Server import'); await sleep(350); } catch { /* skip */ }
        }
      }
    }

    // ── 2. Handle roles ───────────────────────────────────────────────────────
    if (sel.has('roles')) {
      log('Deleting existing roles…');
      const deletableRoles = guild.roles.cache.filter(
        r => !r.managed && r.name !== '@everyone' && r.editable
      );
      for (const role of deletableRoles.values()) {
        try { await role.delete('Server import'); await sleep(350); } catch { /* skip */ }
      }

      log(`Creating ${snapshot.roles.length} roles…`);
      const createdRoles: Array<{ role: Role; desiredPosition: number }> = [];
      for (const r of snapshot.roles) {
        try {
          const created = await guild.roles.create({
            name: r.name,
            color: r.color,
            hoist: r.hoist,
            mentionable: r.mentionable,
            permissions: BigInt(r.permissions),
          });
          createdRoles.push({ role: created, desiredPosition: r.position });
          await sleep(350);
        } catch (e) {
          console.error('[import-server] Failed to create role', r.name, e);
        }
      }

      if (createdRoles.length > 0) {
        try {
          createdRoles.sort((a, b) => a.desiredPosition - b.desiredPosition);
          const positionData = createdRoles.map((entry, i) => ({
            role: entry.role.id,
            position: i + 1,
          }));
          await guild.roles.setPositions(positionData);
          log('Roles reordered.');
        } catch (e) {
          console.error('[import-server] Could not reorder roles (non-fatal):', e);
        }
      }
    }

    // ── 3. Build roleNameToId map ────────────────────────────────────────────
    await guild.roles.fetch();
    const roleNameToId = new Map<string, string>();
    roleNameToId.set('@everyone', guild.roles.everyone.id);
    for (const r of guild.roles.cache.values()) roleNameToId.set(r.name, r.id);

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

    // ── 4. Create categories & channels ─────────────────────────────────────
    if (sel.has('channels')) {
      log('Creating categories…');
      const newCategoryIds: string[] = [];
      for (const cat of snapshot.categories) {
        try {
          const opts: Parameters<typeof guild.channels.create>[0] = {
            name: cat.name,
            type: ChannelType.GuildCategory,
            position: cat.position,
          };
          const overwrites = buildOverwrites(cat.permissionOverwrites);
          if (overwrites?.length) opts.permissionOverwrites = overwrites;
          const created = await guild.channels.create(opts);
          newCategoryIds.push(created.id);
          await sleep(400);
        } catch (e) {
          console.error('[import-server] Failed to create category', cat.name, e);
          newCategoryIds.push('');
        }
      }

      log('Creating channels…');
      for (const ch of snapshot.channels) {
        try {
          const opts: Parameters<typeof guild.channels.create>[0] = {
            name: ch.name,
            type: ch.type as ChannelType,
            position: ch.position,
          };
          if (ch.parentIndex !== undefined && newCategoryIds[ch.parentIndex]) {
            opts.parent = newCategoryIds[ch.parentIndex];
          }
          if (ch.topic) opts.topic = ch.topic;
          if (ch.nsfw) opts.nsfw = ch.nsfw;
          if (ch.rateLimitPerUser) opts.rateLimitPerUser = ch.rateLimitPerUser;
          if (ch.bitrate) opts.bitrate = ch.bitrate;
          if (ch.userLimit) opts.userLimit = ch.userLimit;

          const overwrites = buildOverwrites(ch.permissionOverwrites);
          if (overwrites?.length) opts.permissionOverwrites = overwrites;

          await guild.channels.create(opts);
          await sleep(400);
        } catch (e) {
          console.error('[import-server] Failed to create channel', ch.name, e);
        }
      }
    }

    // ── 5. Update guild info ─────────────────────────────────────────────────
    const guildEdit: Parameters<typeof guild.edit>[0] = {};
    if (sel.has('name')) guildEdit.name = snapshot.name;
    if (sel.has('description') && snapshot.description) guildEdit.description = snapshot.description;

    if (sel.has('icon') && snapshot.iconURL) {
      try {
        const res = await fetch(snapshot.iconURL);
        if (res.ok) {
          const buf = await res.arrayBuffer();
          const ext = snapshot.iconURL.includes('.png') ? 'png' : 'jpeg';
          guildEdit.icon = `data:image/${ext};base64,${Buffer.from(buf).toString('base64')}`;
        }
      } catch { log('⚠️ No se pudo descargar el icono del servidor — se omite.'); }
    }

    if (Object.keys(guildEdit).length > 0) {
      await guild.edit(guildEdit);
    }

    log('Import complete!');

    // Build summary
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
      (useArchive
        ? `📦 Los canales anteriores fueron archivados en **"📦 Archivo"** (solo visible para admins)\n`
        : '') +
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
    const errMsg =
      '❌ El import falló. Asegúrate de que el bot tiene permiso de **Administrador** y su rol está por encima de todos los demás.';
    try { await interaction.user.send(errMsg); } catch { /* best effort */ }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
