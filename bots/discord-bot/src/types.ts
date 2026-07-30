export interface RoleSnapshot {
  name: string;
  color: number;
  hoist: boolean;
  mentionable: boolean;
  permissions: string; // BigInt serialized as string
  position: number;
}

export interface PermissionOverwriteSnapshot {
  type: 'role' | 'member';
  /** Role name (for type=role, including "@everyone") or user ID (for type=member) */
  name: string;
  allow: string; // BigInt as string
  deny: string;  // BigInt as string
}

export interface ChannelSnapshot {
  name: string;
  type: number;
  topic?: string;
  nsfw?: boolean;
  rateLimitPerUser?: number;
  bitrate?: number;
  userLimit?: number;
  position: number;
  parentIndex?: number; // index into the categories array
  permissionOverwrites?: PermissionOverwriteSnapshot[];
}

export interface ServerSnapshot {
  name: string;
  description?: string;
  iconURL?: string;
  roles: RoleSnapshot[];         // sorted by position ascending (excludes @everyone)
  categories: ChannelSnapshot[]; // GUILD_CATEGORY channels
  channels: ChannelSnapshot[];   // non-category channels
  capturedAt: string;
}
