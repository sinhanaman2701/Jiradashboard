"use client";

import { useEffect, useMemo, useState } from "react";
import { DateFilterBar } from "@/components/DateFilterBar";
import type { JiraDashboardData } from "@/lib/jira/types";

const IST_TIME_ZONE = "Asia/Kolkata";
const BAR_COLORS = [
  "#2563eb",
  "#f97316",
  "#14b8a6",
  "#8b5cf6",
  "#ef4444",
  "#eab308",
  "#06b6d4",
  "#22c55e"
];
const TEAM_STORAGE_KEY = "jira-dashboard-teams-v1";

interface TeamRecord {
  id: string;
  name: string;
  members: string[];
}

interface DashboardShellProps {
  data: JiraDashboardData;
  currentPreset: string;
  rangeLabel: string;
}

function formatHours(value: number): string {
  return `${value.toFixed(2)}h`;
}

function humanDate(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: IST_TIME_ZONE
  }).format(new Date(value));
}

function varianceClass(value: number): string {
  if (value < 0) return "negative";
  if (value > 0) return "positive";
  return "neutral";
}

function statusText(expectedHours: number, loggedHours: number): "missing" | "under" | "complete" | "over" {
  if (loggedHours === 0) return "missing";
  if (loggedHours < expectedHours) return "under";
  if (loggedHours > expectedHours) return "over";
  return "complete";
}

function statusClass(status: "missing" | "under" | "complete" | "over"): string {
  return `status-pill status-${status}`;
}

function averageDailyHours(loggedHours: number, workingDays: number): number {
  if (workingDays <= 0) return 0;
  return loggedHours / workingDays;
}

export function DashboardShell({
  data,
  currentPreset,
  rangeLabel
}: DashboardShellProps) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [selectedTeamId, setSelectedTeamId] = useState("");
  const [newTeamName, setNewTeamName] = useState("");
  const [teams, setTeams] = useState<TeamRecord[]>([]);

  useEffect(() => {
    const raw = window.localStorage.getItem(TEAM_STORAGE_KEY);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as TeamRecord[];
      if (Array.isArray(parsed)) setTeams(parsed);
    } catch {
      window.localStorage.removeItem(TEAM_STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(TEAM_STORAGE_KEY, JSON.stringify(teams));
  }, [teams]);

  const userTeamsMap = useMemo(() => {
    const map = new Map<string, TeamRecord[]>();
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
    if (!selectedTeamId) return data.users;
    return data.users.filter((user) =>
      teams.some((team) => team.id === selectedTeamId && team.members.includes(user.accountId))
    );
  }, [data.users, selectedTeamId, teams]);

  function createTeam() {
    const name = newTeamName.trim();
    if (!name) return;
    const id =
      name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") ||
      `team-${Date.now()}`;
    if (teams.some((team) => team.id === id || team.name.toLowerCase() === name.toLowerCase())) {
      return;
    }
    setTeams((current) => [...current, { id, name, members: [] }]);
    setNewTeamName("");
  }

  function toggleUserInTeam(teamId: string, userId: string) {
    setTeams((current) =>
      current.map((team) => {
        if (team.id !== teamId) return team;
        const exists = team.members.includes(userId);
        return {
          ...team,
          members: exists
            ? team.members.filter((member) => member !== userId)
            : [...team.members, userId]
        };
      })
    );
  }

  return (
    <>
      <div className="listing-toolbar">
        <div>
          <h2 style={{ margin: 0, fontSize: "1.25rem" }}>User Listing</h2>
          <p style={{ margin: "8px 0 0", color: "var(--muted)" }}>
            {humanDate(data.from)} to {humanDate(data.to)} · {rangeLabel}
          </p>
        </div>

        <div className="settings-wrap">
          <button
            type="button"
            className="settings-trigger"
            onClick={() => setSettingsOpen((value) => !value)}
          >
            <span className="settings-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M12 3.75 13.32 6a7.8 7.8 0 0 1 1.98.82l2.48-.8 1.5 2.6-1.72 1.92c.12.46.19.94.19 1.46s-.07 1-.19 1.46l1.72 1.92-1.5 2.6-2.48-.8c-.61.36-1.28.63-1.98.82L12 20.25l-1.32-2.25a7.8 7.8 0 0 1-1.98-.82l-2.48.8-1.5-2.6 1.72-1.92A5.9 5.9 0 0 1 6.25 12c0-.52.07-1 .19-1.46L4.72 8.62l1.5-2.6 2.48.8c.61-.36 1.28-.63 1.98-.82L12 3.75Z" />
                <circle cx="12" cy="12" r="2.6" />
              </svg>
            </span>
            <span>Settings</span>
          </button>

          {settingsOpen ? (
            <div className="settings-dropdown">
              <div className="settings-section-head">
                <h3 className="settings-title">Teams</h3>
                <p className="settings-copy">
                  Create teams and assign users. A user can belong to multiple teams.
                </p>
              </div>

              <div className="team-create-row">
                <input
                  type="text"
                  value={newTeamName}
                  placeholder="Create team"
                  onChange={(event) => setNewTeamName(event.target.value)}
                />
                <button type="button" className="button" onClick={createTeam}>
                  Add Team
                </button>
              </div>

              <div className="team-user-list">
                {data.users.map((user) => {
                  const userTeams = userTeamsMap.get(user.accountId) ?? [];
                  return (
                    <div key={user.accountId} className="team-user-card">
                      <div className="user-name">{user.displayName}</div>
                      <div className="user-subtle">
                        {userTeams.length > 0
                          ? userTeams.map((team) => team.name).join(", ")
                          : "No team assigned"}
                      </div>

                      <div className="team-checkbox-grid">
                        {teams.length > 0 ? (
                          teams.map((team) => (
                            <label key={team.id} className="team-checkbox">
                              <input
                                type="checkbox"
                                checked={team.members.includes(user.accountId)}
                                onChange={() => toggleUserInTeam(team.id, user.accountId)}
                              />
                              <span>{team.name}</span>
                            </label>
                          ))
                        ) : (
                          <div className="user-subtle">Create a team first.</div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <div className="filters-stack">
        <DateFilterBar currentPreset={currentPreset} from={data.from} to={data.to} />

        <div className="team-filter-bar">
          <label className="toolbar-label">
            <span>Teams</span>
            <select
              value={selectedTeamId}
              className="toolbar-select"
              onChange={(event) => setSelectedTeamId(event.target.value)}
            >
              <option value="">All Users</option>
              {teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="tile-list">
        {visibleUsers.map((user) => {
          const status = statusText(user.expectedHours, user.loggedHours);
          const averageHours = averageDailyHours(user.loggedHours, user.workingDaysInRange);
          const cappedAverage = Math.min(averageHours, 8);
          const userTeams = userTeamsMap.get(user.accountId) ?? [];
          return (
            <details key={user.accountId} className="user-tile">
              <summary className="user-tile-summary">
                <div className="user-tile-header">
                  <div>
                    <div className="user-name">{user.displayName}</div>
                    <div className="user-subtle">
                      {user.ticketCount} tasks contributing to logged time
                    </div>
                    <div className="team-pill-row">
                      {userTeams.length > 0 ? (
                        userTeams.map((team) => (
                          <span key={team.id} className="team-pill">
                            {team.name}
                          </span>
                        ))
                      ) : (
                        <span className="team-pill team-pill-empty">No team</span>
                      )}
                    </div>
                  </div>
                  <div className="user-tile-meta">
                    <div className="tile-metric">
                      <span className="tile-label">Days</span>
                      <span className="cell-strong">{user.workingDaysInRange}</span>
                    </div>
                    <div className="tile-metric">
                      <span className="tile-label">Expected</span>
                      <span className="cell-strong">{formatHours(user.expectedHours)}</span>
                    </div>
                    <div className="tile-metric">
                      <span className="tile-label">Logged</span>
                      <span className="cell-strong">{formatHours(user.loggedHours)}</span>
                    </div>
                    <div className="tile-metric">
                      <span className="tile-label">Variance</span>
                      <span className={`cell-strong ${varianceClass(user.varianceHours)}`}>
                        {user.varianceHours > 0 ? "+" : ""}
                        {formatHours(user.varianceHours)}
                      </span>
                    </div>
                    <span className={statusClass(status)}>{status}</span>
                  </div>
                </div>

                <div className="user-bar-block">
                  <div className="user-bar-meta">
                    <span>Daily tracking</span>
                    <span>{formatHours(cappedAverage)} / 8.00h</span>
                  </div>
                  <div className="hours-bar">
                    {user.ticketBreakdown.map((ticket, index) => {
                      const averageTicketHours = averageDailyHours(
                        ticket.loggedHours,
                        user.workingDaysInRange
                      );
                      const width = Math.max(0, Math.min((averageTicketHours / 8) * 100, 100));
                      return width > 0 ? (
                        <div
                          key={ticket.issueKey}
                          className="hours-segment"
                          style={{
                            width: `${width}%`,
                            backgroundColor: BAR_COLORS[index % BAR_COLORS.length]
                          }}
                          title={`${ticket.issueKey}: ${formatHours(averageTicketHours)} avg/day`}
                        />
                      ) : null;
                    })}
                    {cappedAverage < 8 ? (
                      <div
                        className="hours-remainder"
                        style={{ width: `${((8 - cappedAverage) / 8) * 100}%` }}
                      />
                    ) : null}
                  </div>
                </div>
              </summary>

              <div className="user-tile-body">
                <div className="task-table">
                  <div className="task-table-head">
                    <span>Task</span>
                    <span>Project</span>
                    <span>Total Logged</span>
                    <span>Avg/Day</span>
                  </div>
                  {user.ticketBreakdown.length > 0 ? (
                    user.ticketBreakdown.map((ticket, index) => {
                      const avgPerDay = averageDailyHours(ticket.loggedHours, user.workingDaysInRange);
                      return (
                        <div key={ticket.issueKey} className="task-table-row">
                          <div className="task-name-cell">
                            <span
                              className="task-dot"
                              style={{
                                backgroundColor: BAR_COLORS[index % BAR_COLORS.length]
                              }}
                            />
                            <div>
                              <div className="cell-strong">
                                <a
                                  href={`${data.baseUrl}/browse/${ticket.issueKey}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="ticket-link"
                                >
                                  {ticket.issueSummary}
                                </a>
                              </div>
                              <div className="user-subtle">{ticket.issueKey}</div>
                            </div>
                          </div>
                          <span>{ticket.projectKey}</span>
                          <span className="cell-strong">{formatHours(ticket.loggedHours)}</span>
                          <span className="cell-strong">{formatHours(avgPerDay)}</span>
                        </div>
                      );
                    })
                  ) : (
                    <div className="task-empty">No task-level worklogs found for this user in the selected range.</div>
                  )}
                </div>
              </div>
            </details>
          );
        })}
      </div>
    </>
  );
}
