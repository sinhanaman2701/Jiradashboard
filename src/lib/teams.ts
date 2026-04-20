export const TEAM_STORAGE_KEY = "jd-teams-v2";
export const PRESET_STORAGE_KEY = "jd-preset-v1";

export type TeamColor = "blue" | "purple" | "green" | "orange" | "pink" | "teal";

export interface TeamRecord {
  id: string;
  name: string;
  color: TeamColor;
  members: string[];
}

const COLOR_CYCLE: TeamColor[] = ["blue", "purple", "green", "orange", "pink", "teal"];

export function teamColorFromId(id: string): TeamColor {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return COLOR_CYCLE[hash % COLOR_CYCLE.length]!;
}

export const TEAM_COLOR_TOKENS: Record<
  TeamColor,
  { dot: string; bg: string; text: string }
> = {
  blue: { dot: "#3b82f6", bg: "#dbeafe", text: "#1d4ed8" },
  purple: { dot: "#8b5cf6", bg: "#ede9fe", text: "#6d28d9" },
  green: { dot: "#10b981", bg: "#d1fae5", text: "#065f46" },
  orange: { dot: "#f97316", bg: "#ffedd5", text: "#9a3412" },
  pink: { dot: "#ec4899", bg: "#fce7f3", text: "#9d174d" },
  teal: { dot: "#14b8a6", bg: "#ccfbf1", text: "#134e4a" }
};

export function initials(name: string): string {
  return name
    .split(" ")
    .map((part) => part[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function avatarColor(id: string): string {
  const hues = [220, 190, 265, 30, 155, 340, 50, 285];
  const lastChar = id[id.length - 1] ?? "0";
  const idx = (lastChar.charCodeAt(0) - 48) % hues.length;
  return `oklch(55% 0.16 ${hues[idx]})`;
}

export function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || `t-${Date.now()}`
  );
}

export function readTeamsFromStorage(): TeamRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(TEAM_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as TeamRecord[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function writeTeamsToStorage(teams: TeamRecord[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(TEAM_STORAGE_KEY, JSON.stringify(teams));
}
