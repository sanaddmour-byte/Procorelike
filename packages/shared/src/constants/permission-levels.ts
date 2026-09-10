export const PERMISSION_LEVELS = ["none", "read", "standard", "admin"] as const;

export type PermissionLevel = (typeof PERMISSION_LEVELS)[number];

const LEVEL_RANK: Record<PermissionLevel, number> = {
  none: 0,
  read: 1,
  standard: 2,
  admin: 3,
};

export function isPermissionLevel(value: string): value is PermissionLevel {
  return (PERMISSION_LEVELS as readonly string[]).includes(value);
}

export function levelAtLeast(level: PermissionLevel, required: PermissionLevel): boolean {
  return LEVEL_RANK[level] >= LEVEL_RANK[required];
}

export function maxLevel(a: PermissionLevel, b: PermissionLevel): PermissionLevel {
  return LEVEL_RANK[a] >= LEVEL_RANK[b] ? a : b;
}
