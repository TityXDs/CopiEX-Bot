# CopiEX — Discord Server Clone Bot

A Discord bot that snapshots a server's full configuration (channels, roles, name, icon, description) and applies it to another server.

## Run & Operate

- `pnpm --filter @workspace/discord-bot run dev` — start the bot (via the "Discord Bot" workflow)
- `pnpm --filter @workspace/discord-bot run deploy` — register slash commands with Discord (run once after changes)
- `pnpm --filter @workspace/discord-bot run typecheck` — typecheck the bot

## Bot Commands

| Command | Description |
|---|---|
| `/copy-server name:<label>` | Snapshots the current server and saves it under `<label>` |
| `/import-server name:<label> confirm:CONFIRM` | Applies a saved snapshot to the current server (destructive) |

Both commands require **Administrator** permission.

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Discord.js v14
- Snapshots stored as JSON in `bots/discord-bot/data/`

## Where things live

- Bot entry point: `bots/discord-bot/src/index.ts`
- Commands: `bots/discord-bot/src/commands/`
- Snapshot storage: `bots/discord-bot/src/storage.ts`
- Snapshot data: `bots/discord-bot/data/` (auto-created, gitignore if needed)
- Command registration script: `bots/discord-bot/src/deploy-commands.ts`

## Required Secrets

- `DISCORD_TOKEN` — bot token (Discord Developer Portal → Bot)
- `DISCORD_CLIENT_ID` — application client ID (Discord Developer Portal → General Information)
- `DISCORD_GUILD_ID` *(optional)* — set for instant guild-specific command registration instead of global

## Architecture decisions

- Snapshots are plain JSON files keyed by a user-chosen label, stored locally in `data/`
- Import is destructive by design: deletes all existing channels and non-managed roles before recreating from the snapshot. Requires typing `CONFIRM` to prevent accidents
- A 300–400ms delay between Discord API calls avoids rate-limiting during bulk operations
- Icon is fetched from the saved URL at import time and re-uploaded as base64

## Gotchas

- Global command registration takes up to 1 hour to propagate. Set `DISCORD_GUILD_ID` for instant registration during testing.
- The bot's role must be at the top of the role list in the target server, or it won't be able to create roles above its own position.
- Managed roles (e.g. bot roles, Nitro booster) are never deleted or recreated — they're skipped automatically.

## User preferences

_Populate as you build._
