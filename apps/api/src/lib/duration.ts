/** Parses simple "<n><unit>" durations (e.g. "15m", "30d") used by JWT_*_TTL env vars. */
export function parseDurationMs(input: string): number {
  const match = /^(\d+)([smhd])$/.exec(input.trim());
  if (!match) {
    throw new Error(`Invalid duration string: ${input} (expected e.g. "15m", "30d")`);
  }
  const amount = Number(match[1]!);
  switch (match[2]!) {
    case "s":
      return amount * 1000;
    case "m":
      return amount * 60_000;
    case "h":
      return amount * 3_600_000;
    case "d":
      return amount * 86_400_000;
    default:
      throw new Error(`Unreachable: unexpected duration unit in ${input}`);
  }
}
