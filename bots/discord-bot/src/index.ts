import { Client, GatewayIntentBits, Collection, Events, Interaction, AutocompleteInteraction } from 'discord.js';
import * as copyServer from './commands/copy-server.js';
import * as importServer from './commands/import-server.js';
import * as deleteSnapshot from './commands/delete-snapshot.js';

const TOKEN = process.env.DISCORD_TOKEN;

if (!TOKEN) {
  console.error('❌ DISCORD_TOKEN environment variable is not set. Add it as a secret and restart.');
  process.exit(1);
}

interface Command {
  data: { name: string; toJSON(): unknown };
  execute(interaction: never): Promise<void>;
  autocomplete?(interaction: AutocompleteInteraction): Promise<void>;
}

const commands = new Collection<string, Command>();
commands.set(copyServer.data.name, copyServer as Command);
commands.set(importServer.data.name, importServer as Command);
commands.set(deleteSnapshot.data.name, deleteSnapshot as Command);

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

// Prevent unhandled errors from crashing the process
client.on(Events.Error, err => {
  console.error('[discord client error]', err.message);
});

client.once(Events.ClientReady, c => {
  console.log(`✅ Discord bot ready! Logged in as ${c.user.tag}`);
  console.log(`📡 Serving ${c.guilds.cache.size} guild(s)`);
  console.log('Commands: /copy-server, /import-server, /delete-snapshot');
});

client.on(Events.InteractionCreate, async (interaction: Interaction) => {
  // Handle autocomplete
  if (interaction.isAutocomplete()) {
    const command = commands.get(interaction.commandName);
    if (command?.autocomplete) {
      try {
        await command.autocomplete(interaction);
      } catch (err) {
        console.error(`[autocomplete] Error for /${interaction.commandName}:`, err);
      }
    }
    return;
  }

  if (!interaction.isChatInputCommand()) return;

  const command = commands.get(interaction.commandName);
  if (!command) {
    console.warn(`Unknown command: ${interaction.commandName}`);
    return;
  }

  try {
    await command.execute(interaction as never);
  } catch (error) {
    console.error(`Error executing /${interaction.commandName}:`, error);
    try {
      const msg = { content: '❌ An unexpected error occurred.', ephemeral: true };
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(msg);
      } else {
        await interaction.reply(msg);
      }
    } catch {
      // Interaction may have expired — log and move on
    }
  }
});

client.login(TOKEN);
