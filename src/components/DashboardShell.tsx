"use client";

import Link from "next/link";
import { createPortal } from "react-dom";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AnacityLogo } from "@/components/AnacityLogo";
import { DateFilterBar } from "@/components/DateFilterBar";
import { SettingsShell } from "@/components/SettingsShell";
import { SprintShell } from "@/components/SprintShell";
import type { JiraDashboardData, JiraUser, JiraUserSummary } from "@/lib/jira/types";
import type { SprintGoalsSummary } from "@/lib/jira/sprints";
import { parseTimeToSeconds } from "@/lib/time-parser";
import {
  TEAM_COLOR_TOKENS,
  avatarColor,
  initials
} from "@/lib/teams";
import type { TeamRecord } from "@/lib/teams";

interface SessionUser {
  accountId: string;
  displayName: string;
  role: "admin" | "user";
}

const BAR_COLORS = [
  "#3b82f6",
  "#f97316",
  "#14b8a6",
  "#8b5cf6",
  "#ef4444",
  "#eab308",
  "#06b6d4",
  "#22c55e"
] as const;

type Preset = "today" | "yesterday" | "last-week" | "last-month" | "custom";

interface DashboardShellProps {
  data: JiraDashboardData | null;
  manageTeamUsers: JiraUser[];
  preset: Preset;
  rangeLabel: string;
  refreshKey: string;
  syncedAt: string;
  view: "dashboard" | "sprints" | "manage-team";
  user?: SessionUser;
}

interface DashboardTeamGroup {
  id: string;
  name: string;
  color?: TeamRecord["color"];
  users: JiraUserSummary[];
  expectedHours: number;
  loggedHours: number;
  varianceHours: number;
  ticketCount: number;
  belowTarget: number;
}

function formatHours(value: number): string {
  return `${value.toFixed(2)}h`;
}

function formatSyncTime(value: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Kolkata",
  }).format(new Date(value));
}

function EtaCell({ eta }: { eta?: string }) {
  return <span className={eta ? "task-eta" : "task-eta muted"}>{eta || "No ETA"}</span>;
}

function VarianceCell({ eta, totalLoggedSeconds }: { eta?: string; totalLoggedSeconds: number }) {
  if (!eta) return <span className="task-variance muted">—</span>;

  const etaSeconds = parseTimeToSeconds(eta);
  if (!etaSeconds) return <span className="task-variance muted">—</span>;

  const diffSeconds = totalLoggedSeconds - etaSeconds;
  if (diffSeconds === 0) {
    return (
      <span className="task-variance on-target" title={`Total logged compared with ETA ${eta}`}>
        on target
      </span>
    );
  }

  return (
    <span className={`task-variance ${diffSeconds > 0 ? "over" : "under"}`} title={`Total logged compared with ETA ${eta}`}>
      {diffSeconds > 0 ? "+" : "-"}
      {formatHours(Math.abs(diffSeconds) / 3600)}
    </span>
  );
}

function metricColor(value: number): string {
  if (value < 0) return "#dc2626";
  if (value > 0) return "#2563eb";
  return "#059669";
}

function statusFor(user: JiraUserSummary): "missing" | "under" | "complete" | "over" {
  if (user.loggedHours === 0) return "missing";
  if (user.loggedHours < user.expectedHours) return "under";
  if (user.loggedHours > user.expectedHours) return "over";
  return "complete";
}

function averageDailyHours(user: JiraUserSummary): number {
  if (user.workingDaysInRange <= 0) return 0;
  return user.loggedHours / user.workingDaysInRange;
}

function summaryFromUsers(users: JiraUserSummary[]) {
  const members = users.length;
  const expected = users.reduce((sum, user) => sum + user.expectedHours, 0);
  const logged = users.reduce((sum, user) => sum + user.loggedHours, 0);
  const coverage = expected > 0 ? (logged / expected) * 100 : 0;
  const belowTarget = users.filter((user) => user.loggedHours < user.expectedHours).length;
  return { members, expected, logged, coverage, belowTarget };
}

function buildTeamGroup(
  id: string,
  name: string,
  users: JiraUserSummary[],
  color?: TeamRecord["color"]
): DashboardTeamGroup {
  const expectedHours = users.reduce((sum, user) => sum + user.expectedHours, 0);
  const loggedHours = users.reduce((sum, user) => sum + user.loggedHours, 0);
  return {
    id,
    name,
    color,
    users,
    expectedHours,
    loggedHours,
    varianceHours: loggedHours - expectedHours,
    ticketCount: users.reduce((sum, user) => sum + user.ticketCount, 0),
    belowTarget: users.filter((user) => user.loggedHours < user.expectedHours).length
  };
}

function TeamPill({
  name,
  color,
  empty = false
}: {
  name: string;
  color?: keyof typeof TEAM_COLOR_TOKENS;
  empty?: boolean;
}) {
  if (empty || !color) {
    return <span className="team-pill team-pill-empty">{name}</span>;
  }

  const token = TEAM_COLOR_TOKENS[color];
  return (
    <span className="team-pill" style={{ background: token.bg, color: token.text }}>
      {name}
    </span>
  );
}

function StatusPill({ status }: { status: "missing" | "under" | "complete" | "over" }) {
  return <span className={`status-pill status-${status}`}>{status}</span>;
}

function HoursBar({ user }: { user: JiraUserSummary }) {
  const avg = Math.min(averageDailyHours(user), 8);
  const segments = user.ticketBreakdown
    .map((ticket, index) => ({
      issueKey: ticket.issueKey,
      width: Math.max(
        0,
        Math.min((ticket.loggedHours / Math.max(user.workingDaysInRange, 1) / 8) * 100, 100)
      ),
      color: BAR_COLORS[index % BAR_COLORS.length]
    }))
    .filter((segment) => segment.width > 0);
  const usedPercent = Math.min(
    100,
    segments.reduce((sum, segment) => sum + segment.width, 0)
  );

  return (
    <div className="hoursbar-wrap">
      <div className="hoursbar-meta">
        <span>AVG / DAY</span>
        <span>
          {avg.toFixed(2)}h <em>/ 8.00h</em>
        </span>
      </div>
      <div className="hoursbar-track">
        {segments.map((segment) => (
          <div
            key={segment.issueKey}
            className="hoursbar-segment"
            style={{ width: `${segment.width}%`, background: segment.color }}
          />
        ))}
        {usedPercent < 100 ? (
          <div className="hoursbar-remainder" style={{ width: `${100 - usedPercent}%` }} />
        ) : null}
      </div>
    </div>
  );
}

function SkeletonTeamCard() {
  return (
    <div className="team-dashboard-card" style={{ opacity: 0.55, pointerEvents: "none" }}>
      <div className="team-dashboard-summary">
        <div style={{ width: 40, height: 40, borderRadius: "50%", background: "#e5e7eb", flexShrink: 0 }} />
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ width: 130, height: 13, background: "#e5e7eb", borderRadius: 4 }} />
          <div style={{ width: 80, height: 11, background: "#f3f4f6", borderRadius: 4 }} />
        </div>
        {[0, 1, 2].map((i) => (
          <div key={i} style={{ width: 72, height: 38, background: "#f3f4f6", borderRadius: 6 }} />
        ))}
        <div style={{ width: 80, height: 24, background: "#f3f4f6", borderRadius: 12 }} />
      </div>
    </div>
  );
}

function GoalsTooltip({
  lines,
  position,
}: {
  lines: string[];
  position: { x: number; y: number } | null;
}) {
  if (!position || lines.length === 0 || typeof document === "undefined") return null;
  return createPortal(
    <div
      className="dashboard-goals-tooltip"
      style={{ left: position.x, top: position.y }}
    >
      {lines.map((line) => (
        <div key={line}>{line}</div>
      ))}
    </div>,
    document.body
  );
}

function SummaryStrip({
  activeSprintCount,
  users,
  sprintGoals,
}: {
  activeSprintCount: number | null;
  users: JiraUserSummary[];
  sprintGoals: SprintGoalsSummary | null;
}) {
  const summary = summaryFromUsers(users);
  const [tooltipPosition, setTooltipPosition] = useState<{ x: number; y: number } | null>(null);

  const goalsTooltipLines = sprintGoals
    ? sprintGoals.byProject
        .map((p) => `${p.projectName}: ${p.achieved}/${p.total}`)
    : [];

  return (
    <>
      <div className="summary-strip">
        <div className="summary-card">
        <span className="summary-card-label">Members</span>
        <span className="summary-card-value">{summary.members}</span>
        </div>
        <div className="summary-card">
        <span className="summary-card-label">Active Sprints</span>
        <span className="summary-card-value">{activeSprintCount === null ? "—" : activeSprintCount}</span>
        </div>
        <div className="summary-card last">
        <span className="summary-card-label">Sprint Goals Achieved</span>
        {sprintGoals === null ? (
          <span className="summary-card-value">—</span>
        ) : (
          <span
            className="summary-card-value summary-card-goals"
            onMouseEnter={(event) => {
              const rect = event.currentTarget.getBoundingClientRect();
              setTooltipPosition({
                x: rect.left + rect.width / 2,
                y: rect.bottom + 12,
              });
            }}
            onMouseLeave={() => setTooltipPosition(null)}
          >
            {sprintGoals.achieved}/{sprintGoals.total}
          </span>
        )}
        </div>
      </div>
      <GoalsTooltip lines={goalsTooltipLines} position={tooltipPosition} />
    </>
  );
}

export function DashboardShell({ data, manageTeamUsers, preset, rangeLabel, refreshKey, syncedAt, view, user }: DashboardShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [teams, setTeams] = useState<TeamRecord[]>([]);
  const [teamsLoading, setTeamsLoading] = useState(view === "dashboard");
  const [selectedTeam, setSelectedTeam] = useState("");
  const [activeSprintCount, setActiveSprintCount] = useState<number | null>(null);
  const [openRows, setOpenRows] = useState<Record<string, boolean>>({});
  const [openTeams, setOpenTeams] = useState<Record<string, boolean>>({});
  const [sprintGoals, setSprintGoals] = useState<SprintGoalsSummary | null>(null);
  const [ticketSort, setTicketSort] = useState<Record<string, { col: "logged" | "total" | "variance"; dir: "asc" | "desc" } | null>>({});

  useEffect(() => {
    if (view !== "dashboard") return;
    setTeamsLoading(true);
    fetch(`/api/teams${refreshKey ? `?refresh=${encodeURIComponent(refreshKey)}` : ""}`)
      .then((res) => res.json())
      .then((data: TeamRecord[]) => setTeams(data))
      .finally(() => setTeamsLoading(false));
  }, [refreshKey, view]);

  useEffect(() => {
    if (view !== "dashboard") return;
    fetch(`/api/sprints/active-count${refreshKey ? `?refresh=${encodeURIComponent(refreshKey)}` : ""}`)
      .then((res) => res.json())
      .then((data: { count?: number }) => setActiveSprintCount(typeof data.count === "number" ? data.count : null))
      .catch(() => setActiveSprintCount(null));
  }, [refreshKey, view]);

  useEffect(() => {
    if (view !== "dashboard") return;
    fetch(`/api/sprints/goals-summary${refreshKey ? `?refresh=${encodeURIComponent(refreshKey)}` : ""}`)
      .then((res) => res.json())
      .then((data: SprintGoalsSummary) => {
        if (typeof data.achieved === "number") setSprintGoals(data);
      })
      .catch(() => setSprintGoals(null));
  }, [refreshKey, view]);

  const userTeamsMap = useMemo(() => {
    const map = new Map<string, typeof teams>();
    for (const team of teams) {
      for (const member of team.members) {
        const current = map.get(member) ?? [];
        current.push(team);
        map.set(member, current);
      }
    }
    return map;
  }, [teams]);

  const visibleUsers = useMemo(() => {
    const users = data?.users ?? [];
    return users;
  }, [data]);

  const teamGroups = useMemo<DashboardTeamGroup[]>(() => {
    const users = data?.users ?? [];
    const assigned = new Set<string>();

    const groups = teams
      .map((team) => {
        const members = users.filter((dashboardUser) => team.members.includes(dashboardUser.accountId));
        members.forEach((member) => assigned.add(member.accountId));
        return buildTeamGroup(team.id, team.name, members, team.color);
      })
      .filter((group) => group.users.length > 0);

    const unassignedUsers = users.filter((dashboardUser) => !assigned.has(dashboardUser.accountId));
    if (unassignedUsers.length > 0) {
      groups.push(buildTeamGroup("unassigned", "Unassigned Team", unassignedUsers));
    }

    return groups;
  }, [data, teams]);

  const visibleTeamGroups = useMemo(() => {
    if (!selectedTeam) return teamGroups;
    return teamGroups.filter((teamGroup) => teamGroup.id === selectedTeam);
  }, [selectedTeam, teamGroups]);

  useEffect(() => {
    if (!selectedTeam) return;
    if (teamGroups.some((teamGroup) => teamGroup.id === selectedTeam)) return;
    setSelectedTeam("");
  }, [selectedTeam, teamGroups]);

  const belowTarget = visibleUsers.filter((user) => user.loggedHours < user.expectedHours).length;

  const renderUserCard = (dashboardUser: JiraUserSummary) => {
    const userTeams = userTeamsMap.get(dashboardUser.accountId) ?? [];
    const isOpen = Boolean(openRows[dashboardUser.accountId]);
    const status = statusFor(dashboardUser);

    return (
      <div key={dashboardUser.accountId} className={`member-card team-member-card${isOpen ? " open" : ""}`}>
        <button
          type="button"
          className="member-summary"
          onClick={() =>
            setOpenRows((current) => ({
              ...current,
              [dashboardUser.accountId]: !current[dashboardUser.accountId]
            }))
          }
        >
          <div className="avatar-circle" style={{ background: avatarColor(dashboardUser.accountId) }}>
            {initials(dashboardUser.displayName)}
          </div>

          <div className="member-identity">
            <div className="member-name">{dashboardUser.displayName}</div>
            <div className="member-teams">
              {userTeams.length > 0 ? (
                userTeams.map((team) => (
                  <TeamPill key={team.id} name={team.name} color={team.color} />
                ))
              ) : (
                <TeamPill name="No team" empty />
              )}
            </div>
            <div className="member-subtitle">
              {dashboardUser.ticketCount} tickets · {dashboardUser.workingDaysInRange} working days
            </div>
          </div>

          <div className="metric-chip">
            <span className="metric-chip-label">Expected</span>
            <span className="metric-chip-value">{formatHours(dashboardUser.expectedHours)}</span>
          </div>

          <div className="metric-chip">
            <span className="metric-chip-label">Logged</span>
            <span className="metric-chip-value">{formatHours(dashboardUser.loggedHours)}</span>
          </div>

          <div className="metric-chip">
            <span className="metric-chip-label">Variance</span>
            <span className="metric-chip-value" style={{ color: metricColor(dashboardUser.varianceHours) }}>
              {dashboardUser.varianceHours > 0 ? "+" : ""}
              {formatHours(dashboardUser.varianceHours)}
            </span>
          </div>

          <HoursBar user={dashboardUser} />
          <StatusPill status={status} />
          <span className={`chevron ${isOpen ? "open" : ""}`}>▾</span>
        </button>

        <div className={`member-expand ${isOpen ? "open" : ""}`}>
          <div className="member-expand-inner">
            <div className="task-table">
              <div className="task-table-head">
                <span>Task</span>
                <span>Epic</span>
                <span>Space</span>
                {(["logged", "total", "variance"] as const).map((col, i) => {
                  const labels = { logged: "Logged", total: "Total Logged", variance: "ETA Variance (All-time)" };
                  const sort = ticketSort[dashboardUser.accountId];
                  const active = sort?.col === col;
                  return (
                    <span
                      key={col}
                      style={{ cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" }}
                      title={col === "variance" ? "Total hours logged vs ETA — not filtered by date range" : undefined}
                      onClick={() =>
                        setTicketSort((prev) => {
                          const current = prev[dashboardUser.accountId];
                          return {
                            ...prev,
                            [dashboardUser.accountId]: current?.col === col
                              ? { col, dir: current.dir === "asc" ? "desc" : "asc" }
                              : { col, dir: "desc" }
                          };
                        })
                      }
                    >
                      {labels[col]}{active ? (ticketSort[dashboardUser.accountId]?.dir === "asc" ? " ▲" : " ▼") : " ⇅"}
                    </span>
                  );
                })}
                <span>ETA</span>
              </div>

              {dashboardUser.ticketBreakdown.length === 0 ? (
                <div className="task-empty">No logged tickets in this range.</div>
              ) : (
                (() => {
                  const sort = ticketSort[dashboardUser.accountId];
                  const tickets = sort
                    ? [...dashboardUser.ticketBreakdown].sort((a, b) => {
                        let aVal = 0, bVal = 0;
                        if (sort.col === "logged") { aVal = a.loggedHours; bVal = b.loggedHours; }
                        else if (sort.col === "total") { aVal = a.totalLoggedHours; bVal = b.totalLoggedHours; }
                        else {
                          const aEta = parseTimeToSeconds(a.eta ?? "");
                          const bEta = parseTimeToSeconds(b.eta ?? "");
                          aVal = aEta ? a.totalLoggedSeconds - aEta : -Infinity;
                          bVal = bEta ? b.totalLoggedSeconds - bEta : -Infinity;
                        }
                        return sort.dir === "asc" ? aVal - bVal : bVal - aVal;
                      })
                    : dashboardUser.ticketBreakdown;
                  return tickets.map((ticket, index) => (
                  <div key={ticket.issueKey} className="task-table-row">
                    <div className="task-name-cell">
                      <span
                        className="task-dot"
                        style={{ background: BAR_COLORS[index % BAR_COLORS.length] }}
                      />
                      <div>
                        <a
                          className="ticket-link"
                          href={`${data?.baseUrl ?? "#"}${data?.baseUrl ? `/browse/${ticket.issueKey}` : ""}`}
                          target={data?.baseUrl ? "_blank" : undefined}
                          rel={data?.baseUrl ? "noreferrer" : undefined}
                        >
                          {ticket.issueSummary}
                        </a>
                        <div className="task-key">{ticket.issueKey}</div>
                      </div>
                    </div>
                    <span className="task-epic">
                      {ticket.epicSummary ? (
                        <span className="epic-label">{ticket.epicSummary}</span>
                      ) : (
                        <span className="epic-not-linked">Not linked</span>
                      )}
                    </span>
                    <span className="task-space">{ticket.spaceName}</span>
                    <span className="task-logged">{formatHours(ticket.loggedHours)}</span>
                    <span className="task-total-logged">{formatHours(ticket.totalLoggedHours)}</span>
                    <VarianceCell eta={ticket.eta} totalLoggedSeconds={ticket.totalLoggedSeconds} />
                    <EtaCell eta={ticket.eta} />
                  </div>
                  ))
                })()
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }

  function handleRefreshNow() {
    const params = new URLSearchParams(searchParams.toString());
    params.set("refresh", String(Date.now()));
    router.push(`${pathname}?${params.toString()}`);
    router.refresh();
  }

  return (
    <div className="dashboard-screen">
      <header className="topbar">
        <div className="topbar-brand">
          <AnacityLogo variant="header" />
          {data && <span className="mock-badge">{data.mode === "live" ? "LIVE" : "MOCK"}</span>}
        </div>

        <div className="topbar-right">
          {view === "dashboard" && <span className="range-caption">{rangeLabel}</span>}
          <span className="live-dot" />
          {user && (
            <div className="topbar-user">
              <div
                className="topbar-avatar"
                style={{ background: avatarColor(user.accountId) }}
                aria-hidden="true"
              >
                {initials(user.displayName)}
              </div>
              <span className="topbar-user-name">{user.displayName}</span>
            </div>
          )}
          <button type="button" className="settings-link" onClick={handleLogout}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            Sign out
          </button>
        </div>
      </header>

      <div className="home-body">
        <aside className="home-sidebar">
          <div className="home-sidebar-label">Views</div>
          <button
            type="button"
            className={`home-nav-item ${view === "dashboard" ? "active" : ""}`}
            onClick={() => router.push("/")}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="7" height="7" rx="1" />
              <rect x="14" y="3" width="7" height="7" rx="1" />
              <rect x="3" y="14" width="7" height="7" rx="1" />
              <rect x="14" y="14" width="7" height="7" rx="1" />
            </svg>
            Dashboard
          </button>
          <button
            type="button"
            className={`home-nav-item ${view === "sprints" ? "active" : ""}`}
            onClick={() => router.push("/?view=sprints")}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
            </svg>
            Sprints
          </button>
          <Link href="/time-logging" className="home-nav-item">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            Time Logging
          </Link>
          <button
            type="button"
            className={`home-nav-item ${view === "manage-team" ? "active" : ""}`}
            onClick={() => router.push("/?view=manage-team")}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
            Manage Team
          </button>
        </aside>

        <div className="home-content">
          {view === "manage-team" ? (
            <SettingsShell users={manageTeamUsers} />
          ) : view === "sprints" ? (
            <SprintShell />
          ) : data ? (
      <main className="dashboard-main">
        <SummaryStrip activeSprintCount={activeSprintCount} users={visibleUsers} sprintGoals={sprintGoals} />

        <div className="toolbar-row">
          <div className="toolbar-left">
            <DateFilterBar preset={preset} customFrom={data.from} customTo={data.to} />

            <div className="field-group">
              <label className="field-label" htmlFor="team-filter">
                Team
              </label>
              <select
                id="team-filter"
                className="field-control"
                value={selectedTeam}
                onChange={(event) => setSelectedTeam(event.target.value)}
              >
                <option value="">All Teams</option>
                {teamGroups.map((teamGroup) => (
                  <option key={teamGroup.id} value={teamGroup.id}>
                    {teamGroup.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="toolbar-sync">
            <span>Last synced {formatSyncTime(syncedAt)}</span>
            <button type="button" className="secondary-button" onClick={handleRefreshNow}>
              Refresh now
            </button>
          </div>
        </div>

        <div className="section-row">
          <div className="section-label">Teams — {teamsLoading ? "…" : visibleTeamGroups.length}</div>
          <div className={`section-status ${belowTarget > 0 ? "danger" : "success"}`}>
            {belowTarget > 0 ? `${belowTarget} below target` : "All on track"}
          </div>
        </div>

        <div className="team-dashboard-list">
          {teamsLoading ? (
            <>
              <SkeletonTeamCard />
              <SkeletonTeamCard />
              <SkeletonTeamCard />
            </>
          ) : visibleTeamGroups.length === 0 ? (
            <div className="empty-state">No teams or members found.</div>
          ) : (
            visibleTeamGroups.map((teamGroup) => {
              const isTeamOpen = Boolean(openTeams[teamGroup.id]);
              const sortedMembers = teamGroup.users;
              return (
                <div key={teamGroup.id} className={`team-dashboard-card${isTeamOpen ? " open" : ""}`}>
                  <button
                    type="button"
                    className="team-dashboard-summary"
                    onClick={() =>
                      setOpenTeams((current) => ({
                        ...current,
                        [teamGroup.id]: !current[teamGroup.id]
                      }))
                    }
                  >
                    <div
                      className="team-dashboard-avatar"
                      style={{
                        background: teamGroup.color
                          ? TEAM_COLOR_TOKENS[teamGroup.color].dot
                          : "linear-gradient(135deg, #64748b, #94a3b8)"
                      }}
                    >
                      {initials(teamGroup.name)}
                    </div>

                    <div className="team-dashboard-identity">
                      <div className="member-name">{teamGroup.name}</div>
                      <div className="member-subtitle">
                        {teamGroup.users.length} members · {teamGroup.ticketCount} tickets
                      </div>
                    </div>

                    <div className="metric-chip">
                      <span className="metric-chip-label">Expected</span>
                      <span className="metric-chip-value">{formatHours(teamGroup.expectedHours)}</span>
                    </div>

                    <div className="metric-chip">
                      <span className="metric-chip-label">Logged</span>
                      <span className="metric-chip-value">{formatHours(teamGroup.loggedHours)}</span>
                    </div>

                    <div className="metric-chip">
                      <span className="metric-chip-label">Variance</span>
                      <span className="metric-chip-value" style={{ color: metricColor(teamGroup.varianceHours) }}>
                        {teamGroup.varianceHours > 0 ? "+" : ""}
                        {formatHours(teamGroup.varianceHours)}
                      </span>
                    </div>

                    <div className={`section-status ${teamGroup.belowTarget > 0 ? "danger" : "success"}`}>
                      {teamGroup.belowTarget > 0 ? `${teamGroup.belowTarget} below target` : "On track"}
                    </div>
                    <span className={`chevron ${isTeamOpen ? "open" : ""}`}>▾</span>
                  </button>

                  <div className={`team-dashboard-expand ${isTeamOpen ? "open" : ""}`}>
                    <div className="team-dashboard-members">
                      {sortedMembers.map(renderUserCard)}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </main>
          ) : null}
        </div>
      </div>
    </div>
  );
}
