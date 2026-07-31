#!/bin/bash
set -e

# Start the Discord bot in the background
echo "[start-production] Starting Discord bot..."
pnpm --filter @workspace/discord-bot run dev &
DISCORD_PID=$!

# Make sure the bot is killed if this script exits
trap "echo '[start-production] Shutting down...'; kill $DISCORD_PID 2>/dev/null; wait $DISCORD_PID 2>/dev/null" EXIT

echo "[start-production] Discord bot started (PID $DISCORD_PID)"

# Start the API server in the foreground (Replit monitors this process)
echo "[start-production] Starting API server..."
exec node --enable-source-maps artifacts/api-server/dist/index.mjs
