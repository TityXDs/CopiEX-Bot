import {
  ChatInputCommandInteraction,
  AutocompleteInteraction,
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
} from 'discord.js';
import { loadSnapshot, deleteSnapshot, listSnapshots } from '../storage.js';

export const data = new SlashCommandBuilder()
  .setName('delete-snapshot')
  .setDescription('Delete a saved server snapshot')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addStringOption(opt =>
    opt
      .setName('name')
      .setDescription('Name of the snapshot to delete')
      .setRequired(true)
      .setAutocomplete(true)
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

  const snapshot = loadSnapshot(snapshotName);
  if (!snapshot) {
    const available = listSnapshots();
    await interaction.reply({
      content:
        `❌ Snapshot \`${snapshotName}\` not found.\n` +
        (available.length
          ? `Available snapshots: ${available.map(s => `\`${s}\``).join(', ')}`
          : 'No snapshots saved yet.'),
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  deleteSnapshot(snapshotName);

  await interaction.reply({
    content:
      `🗑️ Snapshot \`${snapshotName}\` deleted.\n` +
      `It was a copy of **${snapshot.name}** captured on ${new Date(snapshot.capturedAt).toLocaleString()}.`,
    flags: MessageFlags.Ephemeral,
  });
}
