"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { DateFilterBar } from "@/components/DateFilterBar";
import type { JiraDashboardData, JiraUserSummary } from "@/lib/jira/types";
import {
  TEAM_COLOR_TOKENS,
  avatarColor,
  initials,
  readTeamsFromStorage,
  writeTeamsToStorage
} from "@/lib/teams";

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
  data: JiraDashboardData;
  preset: Preset;
  rangeLabel: string;
}

function formatHours(value: number): string {
  return `${value.toFixed(2)}h`;
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

function SummaryStrip({ users }: { users: JiraUserSummary[] }) {
  const summary = summaryFromUsers(users);
  const cards = [
    { label: "Members", value: `${summary.members}` },
    { label: "Expected", value: formatHours(summary.expected) },
    { label: "Logged", value: formatHours(summary.logged) },
    { label: "Coverage", value: `${summary.coverage.toFixed(0)}%` },
    {
      label: "Below Target",
      value: `${summary.belowTarget}`,
      tone: summary.belowTarget > 0 ? "danger" : "neutral"
    }
  ];

  return (
    <div className="summary-strip">
      {cards.map((card, index) => (
        <div
          key={card.label}
          className={`summary-card ${index === cards.length - 1 ? "last" : ""}`}
        >
          <span className="summary-card-label">{card.label}</span>
          <span
            className={`summary-card-value ${
              card.tone === "danger" ? "summary-card-value-danger" : ""
            }`}
          >
            {card.value}
          </span>
        </div>
      ))}
    </div>
  );
}

export function DashboardShell({ data, preset, rangeLabel }: DashboardShellProps) {
  const [teams, setTeams] = useState(readTeamsFromStorage());
  const [selectedTeam, setSelectedTeam] = useState("");
  const [openRows, setOpenRows] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setTeams(readTeamsFromStorage());
  }, []);

  useEffect(() => {
    writeTeamsToStorage(teams);
  }, [teams]);

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
    if (!selectedTeam) return data.users;
    return data.users.filter((user) =>
      teams.some((team) => team.id === selectedTeam && team.members.includes(user.accountId))
    );
  }, [data.users, selectedTeam, teams]);

  const belowTarget = visibleUsers.filter((user) => user.loggedHours < user.expectedHours).length;

  return (
    <div className="dashboard-screen">
      <header className="topbar">
        <div className="topbar-brand">
          <div className="logo-mark" aria-hidden="true">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <rect x="1" y="1" width="5" height="5" rx="1.2" fill="white" opacity="0.9" />
              <rect x="8" y="1" width="5" height="5" rx="1.2" fill="white" opacity="0.6" />
              <rect x="1" y="8" width="5" height="5" rx="1.2" fill="white" opacity="0.6" />
              <rect x="8" y="8" width="5" height="5" rx="1.2" fill="white" opacity="0.3" />
            </svg>
          </div>
          <span className="app-name">Worklog</span>
          <span className="mock-badge">{data.mode === "live" ? "LIVE" : "MOCK"}</span>
        </div>

        <div className="topbar-right">
          <span className="range-caption">{rangeLabel}</span>
          <span className="live-dot" />
          <Link className="settings-link" href="/settings">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
            Settings
          </Link>
        </div>
      </header>

      <main className="dashboard-main">
        <SummaryStrip users={visibleUsers} />

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
                <option value="">All Members</option>
                {teams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="section-row">
          <div className="section-label">Members — {visibleUsers.length}</div>
          <div className={`section-status ${belowTarget > 0 ? "danger" : "success"}`}>
            {belowTarget > 0 ? `${belowTarget} below target` : "All on track"}
          </div>
        </div>

        <div className="member-list">
          {visibleUsers.length === 0 ? (
            <div className="empty-state">No members in this team.</div>
          ) : (
            visibleUsers.map((user) => {
              const userTeams = userTeamsMap.get(user.accountId) ?? [];
              const isOpen = Boolean(openRows[user.accountId]);
              const status = statusFor(user);

              return (
                <div key={user.accountId} className="member-card">
                  <button
                    type="button"
                    className="member-summary"
                    onClick={() =>
                      setOpenRows((current) => ({
                        ...current,
                        [user.accountId]: !current[user.accountId]
                      }))
                    }
                  >
                    <div className="avatar-circle" style={{ background: avatarColor(user.accountId) }}>
                      {initials(user.displayName)}
                    </div>

                    <div className="member-identity">
                      <div className="member-name">{user.displayName}</div>
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
                        {user.ticketCount} tickets · {user.workingDaysInRange} working days
                      </div>
                    </div>

                    <div className="metric-chip">
                      <span className="metric-chip-label">Expected</span>
                      <span className="metric-chip-value">{formatHours(user.expectedHours)}</span>
                    </div>

                    <div className="metric-chip">
                      <span className="metric-chip-label">Logged</span>
                      <span className="metric-chip-value">{formatHours(user.loggedHours)}</span>
                    </div>

                    <div className="metric-chip">
                      <span className="metric-chip-label">Variance</span>
                      <span className="metric-chip-value" style={{ color: metricColor(user.varianceHours) }}>
                        {user.varianceHours > 0 ? "+" : ""}
                        {formatHours(user.varianceHours)}
                      </span>
                    </div>

                    <HoursBar user={user} />
                    <StatusPill status={status} />
                    <span className={`chevron ${isOpen ? "open" : ""}`}>▾</span>
                  </button>

                  <div className={`member-expand ${isOpen ? "open" : ""}`}>
                    <div className="member-expand-inner">
                      <div className="task-table">
                        <div className="task-table-head">
                          <span>Task</span>
                          <span>Project</span>
                          <span>Logged</span>
                          <span>Avg/Day</span>
                        </div>

                        {user.ticketBreakdown.length === 0 ? (
                          <div className="task-empty">No logged tickets in this range.</div>
                        ) : (
                          user.ticketBreakdown.map((ticket, index) => (
                            <div key={ticket.issueKey} className="task-table-row">
                              <div className="task-name-cell">
                                <span
                                  className="task-dot"
                                  style={{ background: BAR_COLORS[index % BAR_COLORS.length] }}
                                />
                                <div>
                                  <a
                                    className="ticket-link"
                                    href={`${data.baseUrl ?? "#"}${data.baseUrl ? `/browse/${ticket.issueKey}` : ""}`}
                                    target={data.baseUrl ? "_blank" : undefined}
                                    rel={data.baseUrl ? "noreferrer" : undefined}
                                  >
                                    {ticket.issueSummary}
                                  </a>
                                  <div className="task-key">{ticket.issueKey}</div>
                                </div>
                              </div>
                              <span className="task-project">{ticket.projectKey}</span>
                              <span className="task-logged">{formatHours(ticket.loggedHours)}</span>
                              <span className="task-avg">
                                {formatHours(ticket.loggedHours / Math.max(user.workingDaysInRange, 1))}
                              </span>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </main>
    </div>
  );
}
