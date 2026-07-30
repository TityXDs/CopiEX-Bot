export interface RoleSnapshot {
  name: string;
  color: number;
  hoist: boolean;
  mentionable: boolean;
  permissions: string; // BigInt serialized as string
  position: number;
}

export interface ChannelSnapshot {
  name: string;
  type: number; // ChannelType enum value
  topic?: string;
  nsfw?: boolean;
  rateLimitPerUser?: number;
  bitrate?: number;
  userLimit?: number;
  position: number;
  parentIndex?: number; // index into the categories array
}

export interface ServerSnapshot {
  name: string;
  description?: string;
  iconURL?: string;
  roles: RoleSnapshot[];       // sorted by position ascending (excludes @everyone)
  categories: ChannelSnapshot[]; // GUILD_CATEGORY channels
  channels: ChannelSnapshot[];   // non-category channels
  capturedAt: string;
}
