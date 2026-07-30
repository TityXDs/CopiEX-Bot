import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ServerSnapshot } from './types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'data');

function ensureDataDir() {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
}

function snapshotPath(name: string): string {
  return join(DATA_DIR, `${name.toLowerCase().replace(/[^a-z0-9_-]/g, '_')}.json`);
}

export function saveSnapshot(name: string, snapshot: ServerSnapshot): void {
  ensureDataDir();
  writeFileSync(snapshotPath(name), JSON.stringify(snapshot, null, 2), 'utf8');
}

export function loadSnapshot(name: string): ServerSnapshot | null {
  const path = snapshotPath(name);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as ServerSnapshot;
  } catch {
    return null;
  }
}

export function listSnapshots(): string[] {
  ensureDataDir();
  return readdirSync(DATA_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => f.replace('.json', ''));
}
