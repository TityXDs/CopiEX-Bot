import { Client, GatewayIntentBits, Collection, Events, Interaction } from 'discord.js';
import * as copyServer from './commands/copy-server.js';
import * as importServer from './commands/import-server.js';

const TOKEN = process.env.DISCORD_TOKEN;

if (!TOKEN) {
  console.error('❌ DISCORD_TOKEN environment variable is not set. Add it as a secret and restart.');
  process.exit(1);
}

interface Command {
  data: { name: string; toJSON(): unknown };
  execute(interaction: never): Promise<void>;
}

const commands = new Collection<string, Command>();
commands.set(copyServer.data.name, copyServer as Command);
commands.set(importServer.data.name, importServer as Command);

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

client.once(Events.ClientReady, c => {
  console.log(`✅ Discord bot ready! Logged in as ${c.user.tag}`);
  console.log(`📡 Serving ${c.guilds.cache.size} guild(s)`);
  console.log('Commands: /copy-server, /import-server');
});

client.on(Events.InteractionCreate, async (interaction: Interaction) => {
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
    const msg = { content: '❌ An unexpected error occurred.', ephemeral: true };
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(msg);
    } else {
      await interaction.reply(msg);
    }
  }
});

client.login(TOKEN);
