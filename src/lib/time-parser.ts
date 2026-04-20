// Parses Jira-style time strings into seconds.
// Accepts: "2h", "30m", "2h 30m", "1.5h", "90m", "2h30m"
export function parseTimeToSeconds(input: string): number | null {
  const s = input.trim().toLowerCase().replace(/\s+/g, "");
  if (!s) return null;

  // Pattern: optional hours part + optional minutes part
  const pattern = /^(?:(\d+(?:\.\d+)?)h)?(?:(\d+(?:\.\d+)?)m)?$/;
  const match = pattern.exec(s);
  if (!match || (!match[1] && !match[2])) return null;

  const hours = parseFloat(match[1] ?? "0");
  const minutes = parseFloat(match[2] ?? "0");
  const total = Math.round(hours * 3600 + minutes * 60);

  if (total <= 0 || total > 86400) return null;
  return total;
}

export function secondsToHuman(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}
