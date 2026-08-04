import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
  ChannelType,
  TextChannel,
  NewsChannel,
  Collection,
  Message,
  Guild,
} from 'discord.js';
import { writeFileSync, mkdirSync, unlinkSync, statSync, readdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// ── Types ─────────────────────────────────────────────────────────────────────

interface MessageExport {
  id: string;
  author: string;
  authorId: string;
  bot: boolean;
  content: string;
  timestamp: string;
  editedAt: string | null;
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

// ── Helpers ───────────────────────────────────────────────────────────────────

function serializeMessage(msg: Message): MessageExport {
  return {
    id: msg.id,
    author: msg.author.discriminator && msg.author.discriminator !== '0'
      ? `${msg.author.username}#${msg.author.discriminator}`
      : msg.author.username,
    authorId: msg.author.id,
    bot: msg.author.bot,
    content: msg.content,
    timestamp: msg.createdAt.toISOString(),
    editedAt: msg.editedAt?.toISOString() ?? null,
    attachments: msg.attachments.map(a => ({ url: a.url, name: a.name })),
    stickers: msg.stickers.map(s => s.name),
    embeds: msg.embeds.length,
    reactions: msg.reactions.cache.map(r => ({
      emoji: r.emoji.name ?? r.emoji.id ?? '?',
      count: r.count,
    })),
    replyTo: msg.reference?.messageId ?? null,
    pinned: msg.pinned,
  };
}

async function fetchChannelMessages(
  channel: TextChannel | NewsChannel,
  onProgress: (count: number) => void,
): Promise<MessageExport[]> {
  const messages: MessageExport[] = [];
  let lastId: string | undefined;

  while (true) {
    let batch: Collection<string, Message>;
    try {
      batch = await channel.messages.fetch({
        limit: 100,
        ...(lastId ? { before: lastId } : {}),
      });
    } catch {
      break; // no access or rate limit — skip channel
    }

    if (batch.size === 0) break;

    // Collect in chronological order (oldest first)
    const sorted = [...batch.values()].sort(
      (a, b) => a.createdTimestamp - b.createdTimestamp,
    );
    messages.unshift(...sorted.map(serializeMessage));

    lastId = batch.last()?.id;
    onProgress(messages.length);

    await sleep(300); // respect rate limits
  }

  return messages;
}

function safeName(s: string) {
  return s.replace(/[^a-z0-9_-]/gi, '_').slice(0, 50);
}

async function runExport(
  interaction: ChatInputCommandInteraction,
  guild: Guild,
) {
  const log = (msg: string) => console.log(`[copy-messages] ${msg}`);
  log(`Export started: ${guild.name} (${guild.id})`);

  await guild.channels.fetch();

  // Only standard text / announcement channels
  const targets = guild.channels.cache.filter(
    c =>
      c.type === ChannelType.GuildText ||
      c.type === ChannelType.GuildAnnouncement,
  ) as Collection<string, TextChannel | NewsChannel>;

  const doc: ExportDoc = {
    serverName: guild.name,
    serverId: guild.id,
    exportedAt: new Date().toISOString(),
    totalMessages: 0,
    channels: [],
  };

  let totalMessages = 0;
  let channelsDone = 0;

  for (const channel of targets.values()) {
    log(`Fetching #${channel.name} (${channelsDone + 1}/${targets.size})…`);

    const messages = await fetchChannelMessages(channel, count => {
      if (count % 1000 === 0) log(`  #${channel.name}: ${count} messages…`);
    });

    totalMessages += messages.length;
    channelsDone++;

    doc.channels.push({
      id: channel.id,
      name: channel.name,
      topic: (channel as TextChannel).topic ?? null,
      messageCount: messages.length,
      messages,
    });

    log(`  Done #${channel.name}: ${messages.length} msgs | total: ${totalMessages}`);
    await sleep(800); // pause between channels
  }

  doc.totalMessages = totalMessages;

  // ── Write & send ────────────────────────────────────────────────────────────
  const tmpDir = join(tmpdir(), `discord-export-${guild.id}-${Date.now()}`);
  mkdirSync(tmpDir, { recursive: true });

  const singleName = `${safeName(guild.name)}_messages.json`;
  const singlePath = join(tmpDir, singleName);
  writeFileSync(singlePath, JSON.stringify(doc, null, 2));

  const { size } = statSync(singlePath);
  const sizeMB = (size / 1024 / 1024).toFixed(1);
  log(`Export complete. ${totalMessages} messages, ${sizeMB} MB`);

  const summary =
    `✅ **Exportación completada — \`${guild.name}\`**\n` +
    `📨 **${totalMessages.toLocaleString()}** mensajes · **${doc.channels.length}** canales\n` +
    `📅 Exportado: ${new Date().toLocaleString('es-ES')}`;

  try {
    if (size <= 25 * 1024 * 1024) {
      // ── Single file ──────────────────────────────────────────────────────
      await interaction.user.send({
        content: summary + `\n📦 Tamaño: ${sizeMB} MB`,
        files: [{ attachment: singlePath, name: singleName }],
      });
    } else {
      // ── Split by channel ─────────────────────────────────────────────────
      await interaction.user.send(
        summary +
        `\n📦 Archivo total (${sizeMB} MB) supera el límite de Discord — te envío un archivo por canal:`,
      );

      for (const ch of doc.channels) {
        const chName = `${safeName(guild.name)}_${safeName(ch.name)}.json`;
        const chPath = join(tmpDir, chName);
        writeFileSync(
          chPath,
          JSON.stringify({ ...doc, channels: [ch] }, null, 2),
        );
        const { size: chSize } = statSync(chPath);

        if (chSize <= 25 * 1024 * 1024) {
          await interaction.user.send({
            content: `📁 **#${ch.name}** — ${ch.messageCount.toLocaleString()} mensajes`,
            files: [{ attachment: chPath, name: chName }],
          });
          await sleep(1500);
        } else {
          await interaction.user.send(
            `⚠️ **#${ch.name}** (${ch.messageCount.toLocaleString()} msgs) supera 25 MB — demasiado grande para enviarlo.`,
          );
        }
      }
    }
  } catch (e) {
    log(`Failed to send DM: ${e}`);
    // Try to find any text channel to notify
    const fallback = guild.channels.cache.find(
      c => c.type === ChannelType.GuildText,
    ) as TextChannel | undefined;
    if (fallback) {
      await fallback.send(
        `<@${interaction.user.id}> La exportación terminó pero no pude enviarte el DM. Asegúrate de tener los DMs abiertos con el bot.`,
      ).catch(() => {});
    }
  } finally {
    // Cleanup temp files
    try {
      for (const f of readdirSync(tmpDir)) unlinkSync(join(tmpDir, f));
    } catch { /* ignore */ }
  }
}

// ── Command ───────────────────────────────────────────────────────────────────

export const data = new SlashCommandBuilder()
  .setName('copy-messages')
  .setDescription('Exporta todos los mensajes del servidor a JSON y te los envía por DM')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

export async function execute(interaction: ChatInputCommandInteraction) {
  const guild = interaction.guild;
  if (!guild) {
    await interaction.reply({
      content: '❌ Este comando solo puede usarse dentro de un servidor.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.reply({
    content:
      `⏳ **Exportación iniciada para \`${guild.name}\`**\n\n` +
      `Voy a copiar todos los mensajes de todos los canales de texto. Puede tardar horas en servidores grandes.\n` +
      `Te enviaré el resultado por **DM** cuando termine — asegúrate de tener los DMs abiertos con el bot.\n\n` +
      `> ⚠️ Para que el contenido de los mensajes se exporte correctamente, el bot necesita el intent **Message Content** activado en el Discord Developer Portal.`,
    flags: MessageFlags.Ephemeral,
  });

  // Fire-and-forget — the interaction will expire long before the export finishes
  runExport(interaction, guild).catch(err => {
    console.error('[copy-messages] Fatal error:', err);
    interaction.user.send(
      '❌ La exportación falló por un error interno. Revisa los logs del bot.',
    ).catch(() => {});
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
