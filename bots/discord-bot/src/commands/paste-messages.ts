import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
  ChannelType,
  TextChannel,
  Client,
} from 'discord.js';

// ── Types (mirror of copy-messages export format) ─────────────────────────────
interface MessageExport {
  id: string;
  author: string;
  authorId: string;
  bot: boolean;
  content: string;
  timestamp: string;
  attachments: { url: string; name: string }[];
  stickers: string[];
  embeds: number;
  reactions: { emoji: string; count: number }[];
  replyTo: string | null;
  pinned: boolean;
}

interface ChannelExport {
  id: string;
  name: string;
  topic: string | null;
  messageCount: number;
  messages: MessageExport[];
}

interface ExportDoc {
  serverName: string;
  serverId: string;
  exportedAt: string;
  totalMessages: number;
  channels: ChannelExport[];
}

// ── Command ───────────────────────────────────────────────────────────────────
export const data = new SlashCommandBuilder()
  .setName('paste-messages')
  .setDescription('Reproduce mensajes exportados en este servidor usando webhooks (nombre + avatar originales)')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addAttachmentOption(opt =>
    opt
      .setName('archivo')
      .setDescription('Archivo JSON exportado por /copy-messages')
      .setRequired(true)
  )
  .addChannelOption(opt =>
    opt
      .setName('canal')
      .setDescription('Canal destino (opcional). Si no se especifica, se busca por nombre automáticamente.')
      .addChannelTypes(ChannelType.GuildText)
      .setRequired(false)
  )
  .addIntegerOption(opt =>
    opt
      .setName('delay')
      .setDescription('Milisegundos entre mensajes (mín. 500, por defecto 800)')
      .setMinValue(500)
      .setMaxValue(5000)
      .setRequired(false)
  );

// ── Avatar cache ──────────────────────────────────────────────────────────────
const avatarCache = new Map<string, string>();

async function getAvatarURL(client: Client, authorId: string): Promise<string> {
  if (avatarCache.has(authorId)) return avatarCache.get(authorId)!;
  try {
    const user = await client.users.fetch(authorId, { force: false });
    const url = user.displayAvatarURL({ size: 128, extension: 'png' });
    avatarCache.set(authorId, url);
    return url;
  } catch {
    // Fallback: default Discord avatar (new hash-free formula)
    const idx = Number((BigInt(authorId) >> 22n) % 6n);
    const url = `https://cdn.discordapp.com/embed/avatars/${idx}.png`;
    avatarCache.set(authorId, url);
    return url;
  }
}

// ── Core runner (fire-and-forget) ─────────────────────────────────────────────
async function runPaste(
  interaction: ChatInputCommandInteraction,
  doc: ExportDoc,
  forceChannel: TextChannel | null,
  delay: number,
) {
  const log = (msg: string) => console.log(`[paste-messages] ${msg}`);
  const guild = interaction.guild!;
  const client = interaction.client;

  await guild.channels.fetch();

  let totalSent = 0;
  let totalSkipped = 0;
  const results: string[] = [];

  for (const ch of doc.channels) {
    // ── Find target channel ────────────────────────────────────────────────
    let target: TextChannel | null = forceChannel;

    if (!target) {
      const found = guild.channels.cache.find(
        c => c.type === ChannelType.GuildText && c.name.toLowerCase() === ch.name.toLowerCase(),
      );
      target = (found as TextChannel) ?? null;
    }

    if (!target) {
      log(`Skipping #${ch.name} — no matching channel found in guild.`);
      results.push(`⚠️ **#${ch.name}** — canal no encontrado en el servidor (omitido)`);
      continue;
    }

    log(`Pasting ${ch.messages.length} messages → #${target.name}`);

    // ── Create webhook ─────────────────────────────────────────────────────
    let webhook;
    try {
      webhook = await (target as TextChannel).createWebhook({
        name: 'CopiEX Paste',
        reason: '/paste-messages import',
      });
    } catch (e) {
      log(`Could not create webhook in #${target.name}: ${e}`);
      results.push(`❌ **#${ch.name}** → **#${target.name}** — sin permiso de webhook`);
      continue;
    }

    // ── If dumping all channels into one target, add a separator header ────
    if (forceChannel && doc.channels.length > 1) {
      try {
        await webhook.send({
          content: `\`\`\`\n📁 #${ch.name}  (${ch.messages.length.toLocaleString()} mensajes del servidor: ${doc.serverName})\n\`\`\``,
          username: 'CopiEX',
          avatarURL: client.user?.displayAvatarURL({ size: 128 }) ?? undefined,
        });
      } catch { /* non-fatal */ }
      await sleep(delay);
    }

    // ── Send messages ──────────────────────────────────────────────────────
    let sent = 0;
    let skipped = 0;

    for (const msg of ch.messages) {
      // Build content
      let content = msg.content ?? '';

      // Append attachment URLs inline (CDN URLs expire but it's the best we can do)
      if (msg.attachments.length > 0) {
        const urls = msg.attachments.map(a => a.url).join('\n');
        content = content ? `${content}\n${urls}` : urls;
      }

      // Sticker note
      if (msg.stickers.length > 0) {
        const note = `🖼️ *${msg.stickers.join(' · ')}*`;
        content = content ? `${content}\n${note}` : note;
      }

      // Embed-only messages with no other content
      if (!content.trim()) {
        if (msg.embeds > 0) {
          content = `*(${msg.embeds} embed${msg.embeds !== 1 ? 's' : ''})*`;
        } else {
          skipped++;
          continue; // fully empty — skip
        }
      }

      // Discord webhook content max: 2000 chars
      if (content.length > 2000) content = content.slice(0, 1997) + '…';

      const avatarURL = await getAvatarURL(client, msg.authorId);
      // Webhook username: max 80 chars, some reserved names banned
      const username = msg.author.slice(0, 80) || 'Unknown';

      try {
        await webhook.send({ content, username, avatarURL });
        sent++;
      } catch (e) {
        log(`Failed to send message ${msg.id}: ${e}`);
        skipped++;
      }

      await sleep(delay);
    }

    // ── Delete webhook when done with this channel ─────────────────────────
    try { await webhook.delete(); } catch { /* non-fatal */ }

    totalSent += sent;
    totalSkipped += skipped;
    results.push(
      `✅ **#${ch.name}** → **#${target.name}** — ${sent.toLocaleString()} mensajes enviados` +
      (skipped > 0 ? ` *(${skipped} omitidos)*` : '')
    );
    log(`Done #${ch.name}: ${sent} sent, ${skipped} skipped.`);
  }

  // ── Summary DM ────────────────────────────────────────────────────────────
  const summary =
    `✅ **Pegado de mensajes completado**\n` +
    `📨 **${totalSent.toLocaleString()}** mensajes enviados · **${totalSkipped}** omitidos\n` +
    `🏠 Servidor origen: **${doc.serverName}** (exportado <t:${Math.floor(new Date(doc.exportedAt).getTime() / 1000)}:R>)\n\n` +
    results.join('\n');

  try {
    await interaction.user.send(summary.slice(0, 2000));
  } catch {
    const fallback = guild.channels.cache.find(c => c.type === ChannelType.GuildText) as TextChannel | undefined;
    if (fallback) await fallback.send(`<@${interaction.user.id}> ${summary}`).catch(() => {});
  }
}

// ── Execute ───────────────────────────────────────────────────────────────────
export async function execute(interaction: ChatInputCommandInteraction) {
  const guild = interaction.guild;
  if (!guild) {
    await interaction.reply({
      content: '❌ Este comando solo puede usarse dentro de un servidor.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const attachment = interaction.options.getAttachment('archivo', true);
  const forceChannelOption = interaction.options.getChannel('canal') as TextChannel | null;
  const delay = interaction.options.getInteger('delay') ?? 800;

  // Validate attachment type
  const isJson =
    attachment.contentType?.includes('json') ||
    attachment.name.endsWith('.json') ||
    attachment.name.endsWith('.txt');

  if (!isJson) {
    await interaction.reply({
      content: '❌ El archivo debe ser el JSON exportado por `/copy-messages` (`.json` o `.txt`).',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // Defer and download the file
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  let doc: ExportDoc;
  try {
    const res = await fetch(attachment.url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    doc = JSON.parse(text) as ExportDoc;
  } catch (e) {
    await interaction.editReply(`❌ No se pudo leer el archivo: ${e}`);
    return;
  }

  // Basic validation
  if (!Array.isArray(doc.channels) || !doc.serverName) {
    await interaction.editReply('❌ El archivo no es un export válido de `/copy-messages`.');
    return;
  }

  const totalMessages = doc.channels.reduce((s, c) => s + c.messages.length, 0);

  await interaction.editReply(
    `⏳ **Pegando mensajes de \`${doc.serverName}\`**\n\n` +
    `📨 **${totalMessages.toLocaleString()}** mensajes · **${doc.channels.length}** canales\n` +
    `⏱️ Delay: **${delay} ms** por mensaje\n` +
    (forceChannelOption ? `📍 Destino único: <#${forceChannelOption.id}>\n` : `📍 Destino: coincidencia por nombre\n`) +
    `\nEsto puede tardar mucho en archivos grandes. Te avisaré por **DM** cuando termine.`
  );

  runPaste(interaction, doc, forceChannelOption, delay).catch(err => {
    console.error('[paste-messages] Fatal error:', err);
    interaction.user.send('❌ El pegado falló por un error interno.').catch(() => {});
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
