/**
 * Run this script once to register slash commands with Discord:
 *   pnpm --filter @workspace/discord-bot run deploy
 *
 * Requires: DISCORD_TOKEN and DISCORD_CLIENT_ID environment variables.
 * Set DISCORD_GUILD_ID to register commands instantly to a single server (recommended for testing).
 * Leave DISCORD_GUILD_ID unset to register globally (takes up to 1 hour to propagate).
 */

import { REST, Routes } from 'discord.js';
import * as copyServer from './commands/copy-server.js';
import * as importServer from './commands/import-server.js';

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const GUILD_ID = process.env.DISCORD_GUILD_ID; // optional

if (!TOKEN || !CLIENT_ID) {
  console.error('❌ DISCORD_TOKEN and DISCORD_CLIENT_ID must be set as environment secrets.');
  process.exit(1);
}

const commands = [copyServer.data.toJSON(), importServer.data.toJSON()];

const rest = new REST().setToken(TOKEN);

async function deploy() {
  console.log('🔄 Registering slash commands…');

  if (GUILD_ID) {
    // Guild-specific (instant)
    const data = await rest.put(Routes.applicationGuildCommands(CLIENT_ID!, GUILD_ID), {
      body: commands,
    }) as unknown[];
    console.log(`✅ Registered ${data.length} command(s) to guild ${GUILD_ID} (instant).`);
  } else {
    // Global (up to 1h propagation)
    const data = await rest.put(Routes.applicationCommands(CLIENT_ID!), {
      body: commands,
    }) as unknown[];
    console.log(`✅ Registered ${data.length} command(s) globally (may take up to 1 hour).`);
  }
}

deploy().catch(err => {
  console.error('❌ Failed to register commands:', err);
  process.exit(1);
});
