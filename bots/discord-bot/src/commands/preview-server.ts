import {
  ChatInputCommandInteraction,
  AutocompleteInteraction,
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
  EmbedBuilder,
  ChannelType,
} from 'discord.js';
import { loadSnapshot, listSnapshots } from '../storage.js';

// ── Command definition ────────────────────────────────────────────────────────
export const data = new SlashCommandBuilder()
  .setName('preview-server')
  .setDescription('Muestra un embed con los roles y canales de un snapshot guardado')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addStringOption(opt =>
    opt
      .setName('name')
      .setDescription('Nombre del snapshot')
      .setRequired(true)
      .setAutocomplete(true)
  );

// ── Autocomplete ──────────────────────────────────────────────────────────────
export async function autocomplete(interaction: AutocompleteInteraction) {
  const focused = interaction.options.getFocused().toLowerCase();
  const filtered = listSnapshots()
    .filter(s => s.toLowerCase().includes(focused))
    .slice(0, 25)
    .map(s => ({ name: s, value: s }));
  await interaction.respond(filtered);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Approximates a Discord role color (0xRRGGBB) to the closest circle emoji. */
function colorDot(color: number): string {
  if (color === 0) return '⬛';
  const r = (color >> 16) & 0xff;
  const g = (color >> 8) & 0xff;
  const b = color & 0xff;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max < 60) return '⬛'; // near-black
  if (min > 200) return '⬜'; // near-white / very light grey
  // hue buckets
  if (r >= g && r >= b) {
    if (g > 140) return '🟠'; // orange-ish
    return '🔴';
  }
  if (g >= r && g >= b) {
    if (b > 140) return '🟦'; // teal
    return '🟢';
  }
  // b is dominant
  if (r > 140) return '🟣';
  return '🔵';
}

/** Icon prefix for each channel type. */
function channelIcon(type: number): string {
  switch (type) {
    case ChannelType.GuildText:         return '#';
    case ChannelType.GuildVoice:        return '🔊';
    case ChannelType.GuildAnnouncement: return '📢';
    case ChannelType.GuildStageVoice:   return '🎙️';
    case ChannelType.GuildForum:        return '💬';
    default:                            return '·';
  }
}

/** Truncates a string so it fits in Discord's character budget. */
function trunc(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

/**
 * Splits an array of lines into chunks whose joined length stays under `budget`.
 * Returns at most `maxChunks` chunks; excess lines are noted in the last chunk.
 */
function chunkLines(lines: string[], budget = 1020, maxChunks = 3): string[] {
  const chunks: string[] = [];
  let cur = '';
  let skipped = 0;

  for (const line of lines) {
    if (chunks.length >= maxChunks) { skipped++; continue; }
    const next = cur ? `${cur}\n${line}` : line;
    if (next.length <= budget) {
      cur = next;
    } else {
      chunks.push(cur);
      cur = line;
    }
  }
  if (cur && chunks.length < maxChunks) chunks.push(cur);
  else if (cur) skipped += cur.split('\n').length;

  if (skipped > 0 && chunks.length > 0) {
    chunks[chunks.length - 1] += `\n*…y ${skipped} más*`;
  }
  return chunks;
}

// ── Execute ───────────────────────────────────────────────────────────────────
export async function execute(interaction: ChatInputCommandInteraction) {
  const snapshotName = interaction.options.getString('name', true).trim();
  const snapshot = loadSnapshot(snapshotName);

  if (!snapshot) {
    const available = listSnapshots();
    await interaction.reply({
      content:
        `❌ No se encontró el snapshot \`${snapshotName}\`.\n` +
        (available.length
          ? `Disponibles: ${available.map(s => `\`${s}\``).join(', ')}`
          : 'No hay snapshots. Usa `/copy-server` primero.'),
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const capturedTs = Math.floor(new Date(snapshot.capturedAt).getTime() / 1000);

  // ── Embed 1: server info + roles ─────────────────────────────────────────
  const infoEmbed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(`📋  ${snapshot.name}`)
    .setDescription(
      (snapshot.description ? `*${snapshot.description}*\n\n` : '') +
      `🕐 Capturado <t:${capturedTs}:R> — <t:${capturedTs}:f>`
    )
    .addFields({
      name: '📊 Resumen',
      value: [
        `**${snapshot.roles.length}** roles`,
        `**${snapshot.categories.length}** categorías`,
        `**${snapshot.channels.length}** canales`,
      ].join('  ·  '),
      inline: false,
    })
    .setFooter({ text: `Snapshot: ${snapshotName}` });

  if (snapshot.iconURL) infoEmbed.setThumbnail(snapshot.iconURL);

  // Roles: sorted highest → lowest rank (descending position = highest rank first)
  const sortedRoles = [...snapshot.roles].sort((a, b) => b.position - a.position);
  const roleLines = sortedRoles.map(r => `${colorDot(r.color)} ${r.name}`);
  const roleChunks = chunkLines(roleLines, 1020, 3);

  for (let i = 0; i < roleChunks.length; i++) {
    infoEmbed.addFields({
      name: i === 0 ? `🎭 Roles (${snapshot.roles.length})` : '\u200b',
      value: roleChunks[i],
      inline: roleChunks.length > 1, // side-by-side when there are multiple chunks
    });
  }

  // ── Embed 2: channels by category ────────────────────────────────────────
  const chanEmbed = new EmbedBuilder()
    .setColor(0x57f287)
    .setTitle('📂  Canales y categorías');

  // Group channels by their parentIndex
  const byCategory = new Map<number | null, typeof snapshot.channels>();
  for (const ch of snapshot.channels) {
    const key = ch.parentIndex ?? null;
    if (!byCategory.has(key)) byCategory.set(key, []);
    byCategory.get(key)!.push(ch);
  }

  let fieldCount = 0;
  const MAX_FIELDS = 24; // leave 1 slot for overflow notice

  // Uncategorized channels first
  const uncategorized = byCategory.get(null) ?? [];
  if (uncategorized.length > 0 && fieldCount < MAX_FIELDS) {
    const lines = uncategorized.map(ch => `${channelIcon(ch.type)} ${ch.name}`);
    const chunks = chunkLines(lines, 1020, 1);
    chanEmbed.addFields({ name: '📁 Sin categoría', value: chunks[0] ?? '\u200b', inline: false });
    fieldCount++;
  }

  // One field per category (split into two inline columns if content is long)
  for (let catIdx = 0; catIdx < snapshot.categories.length; catIdx++) {
    if (fieldCount >= MAX_FIELDS) break;
    const cat = snapshot.categories[catIdx];
    const channels = byCategory.get(catIdx) ?? [];
    const lines = channels.map(ch => `${channelIcon(ch.type)} ${ch.name}`);
    if (lines.length === 0) {
      // Empty category — show placeholder
      chanEmbed.addFields({
        name: trunc(`📂 ${cat.name}`, 256),
        value: '*vacía*',
        inline: true,
      });
      fieldCount++;
      continue;
    }
    const chunks = chunkLines(lines, 1020, 2);
    for (let ci = 0; ci < chunks.length && fieldCount < MAX_FIELDS; ci++) {
      chanEmbed.addFields({
        name: ci === 0 ? trunc(`📂 ${cat.name}`, 256) : '\u200b',
        value: chunks[ci],
        inline: chunks.length > 1,
      });
      fieldCount++;
    }
  }

  if (fieldCount === 0) {
    chanEmbed.setDescription('*Este snapshot no tiene canales guardados.*');
  }

  // ── Reply ────────────────────────────────────────────────────────────────
  await interaction.reply({
    embeds: [infoEmbed, chanEmbed],
    flags: MessageFlags.Ephemeral,
  });
}
