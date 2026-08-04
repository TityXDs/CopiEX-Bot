import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  PermissionFlagsBits,
} from 'discord.js';
import youtubeDl from 'youtube-dl-exec';
import ffmpegStatic from 'ffmpeg-static';
import { mkdirSync, readdirSync, statSync, unlinkSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const MAX_FILE_BYTES = 25 * 1024 * 1024; // 25 MB

export const data = new SlashCommandBuilder()
  .setName('download')
  .setDescription('Descarga el audio de un video (YouTube, Twitter, TikTok…) y lo envía como MP3')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addStringOption(opt =>
    opt
      .setName('url')
      .setDescription('URL del video o audio')
      .setRequired(true)
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  const url = interaction.options.getString('url', true).trim();

  // Basic URL validation
  try {
    new URL(url);
  } catch {
    await interaction.reply({ content: '❌ URL inválida.', ephemeral: true });
    return;
  }

  await interaction.deferReply();
  await interaction.editReply('⏳ Descargando audio…');

  const tmpDir = join(tmpdir(), `discord-dl-${Date.now()}`);
  mkdirSync(tmpDir, { recursive: true });

  try {
    const outputTemplate = join(tmpDir, 'audio.%(ext)s');

    const options: Record<string, unknown> = {
      extractAudio: true,
      audioFormat: 'mp3',
      audioQuality: '128K',
      output: outputTemplate,
      noPlaylist: true,
      noWarnings: true,
      preferFreeFormats: true,
    };

    // Point yt-dlp to the bundled ffmpeg binary if available
    if (ffmpegStatic) {
      options.ffmpegLocation = ffmpegStatic;
    }

    await youtubeDl(url, options);

    // Find the output file (should be audio.mp3)
    const files = readdirSync(tmpDir);
    if (!files.length) {
      await interaction.editReply('❌ No se encontró el archivo descargado. Es posible que la URL no sea compatible.');
      return;
    }

    const fileName = files[0];
    const filePath = join(tmpDir, fileName);
    const { size } = statSync(filePath);

    if (size > MAX_FILE_BYTES) {
      await interaction.editReply(
        `❌ El archivo pesa **${(size / 1024 / 1024).toFixed(1)} MB** y supera el límite de Discord (25 MB). Prueba con un video más corto.`
      );
      return;
    }

    // Get the title from the filename for display
    const displayName = fileName.replace(/^audio\./, '').startsWith('mp3')
      ? fileName
      : fileName;

    await interaction.editReply({
      content: `✅ Listo — **${displayName}**`,
      files: [{ attachment: filePath, name: displayName }],
    });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[download] Error:', message);

    let hint = '';
    if (message.includes('Sign in') || message.includes('login')) {
      hint = ' El video requiere inicio de sesión para descargarse.';
    } else if (message.includes('Private video') || message.includes('private')) {
      hint = ' El video es privado.';
    } else if (message.includes('unavailable') || message.includes('not available')) {
      hint = ' El video no está disponible.';
    }

    await interaction.editReply(`❌ No se pudo descargar el audio.${hint}`);
  } finally {
    // Clean up temp directory
    try {
      rmSync(tmpDir, { recursive: true, force: true });
    } catch { /* ignore */ }
  }
}
