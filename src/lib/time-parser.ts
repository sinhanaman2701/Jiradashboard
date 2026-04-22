// Parses Jira-style time strings into seconds.
// Accepts: "2h", "30m", "2h 30m", "1.5h", "90m", "1d", "1d 4h", "2d 2h 30m"
// 1d = 8h (Jira standard work day)
export function parseTimeToSeconds(input: string): number | null {
  const s = input.trim().toLowerCase().replace(/\s+/g, " ");
  if (!s) return null;

  const pattern = /^(?:(\d+(?:\.\d+)?)d\s*)?(?:(\d+(?:\.\d+)?)h\s*)?(?:(\d+(?:\.\d+)?)m)?$/;
  const match = pattern.exec(s.replace(/\s+/g, ""));
  if (!match || (!match[1] && !match[2] && !match[3])) return null;

  const days = parseFloat(match[1] ?? "0");
  const hours = parseFloat(match[2] ?? "0");
  const minutes = parseFloat(match[3] ?? "0");
  const total = Math.round(days * 8 * 3600 + hours * 3600 + minutes * 60);

  if (total <= 0) return null;
  return total;
}

export function secondsToHuman(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}
