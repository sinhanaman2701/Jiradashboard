"use client";

import { useEffect, useMemo, useState } from "react";
import type { JiraUser } from "@/lib/jira/types";
import {
  TEAM_COLOR_TOKENS,
  type TeamRecord,
  avatarColor,
  initials,
} from "@/lib/teams";

function UsersIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function ExternalLinkIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  );
}

function TeamTag({ name, color }: { name: string; color: TeamRecord["color"] }) {
  const token = TEAM_COLOR_TOKENS[color];
  return (
    <span className="team-tag" style={{ background: token.bg, color: token.text }}>
      <span className="team-tag-dot" style={{ background: token.dot }} />
      {name}
    </span>
  );
}

export function SettingsShell({ users }: { users: JiraUser[] }) {
  const [teams, setTeams] = useState<TeamRecord[]>([]);
  const [teamsLoading, setTeamsLoading] = useState(true);
  const [query, setQuery] = useState("");

  useEffect(() => {
    fetch("/api/teams")
      .then((res) => res.json())
      .then((data: TeamRecord[]) => { setTeams(data); setTeamsLoading(false); })
      .catch(() => setTeamsLoading(false));
  }, []);

  const filteredUsers = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return users;
    return users.filter((user) => {
      const email = user.emailAddress ?? "";
      return (
        user.displayName.toLowerCase().includes(normalized) ||
        email.toLowerCase().includes(normalized)
      );
    });
  }, [query, users]);

  const orgId = process.env.NEXT_PUBLIC_ATLASSIAN_ORG_ID;
  const manageTeamsUrl = orgId
    ? `https://admin.atlassian.com/o/${orgId}/teams`
    : "https://admin.atlassian.com";

  return (
        <main className="settings-main">
          <div className="settings-main-header">
            <div>
              <h1 className="settings-main-title">Manage Team</h1>
              <p className="settings-main-copy">
                Teams are synced from your Atlassian organisation.
              </p>
            </div>
            <a
              href={manageTeamsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="primary-button"
              style={{ display: "inline-flex", alignItems: "center", gap: 6, textDecoration: "none" }}
            >
              Manage in Jira <ExternalLinkIcon />
            </a>
          </div>

          {teamsLoading ? (
            <div className="team-chip-row" style={{ padding: "12px 0" }}>
              {[100, 80, 120, 90, 70].map((w, i) => (
                <div key={i} className="sk" style={{ width: w, height: 30, borderRadius: 16, display: "inline-block" }} />
              ))}
            </div>
          ) : teams.length > 0 ? (
            <div className="team-chip-row">
              {teams.map((team) => (
                <div key={team.id} className="team-chip-button" style={{ cursor: "default" }}>
                  <span className="team-tag-dot" style={{ background: TEAM_COLOR_TOKENS[team.color].dot }} />
                  <span>{team.name}</span>
                  <span className="team-chip-count">{team.members.length}</span>
                </div>
              ))}
            </div>
          ) : null}

          <div className="settings-search-wrap">
            <svg className="settings-search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.35-4.35" />
            </svg>
            <input
              className="settings-search"
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search users"
            />
          </div>

          <div className="settings-user-list">
            {teamsLoading ? (
              [0, 1, 2, 3, 4].map((i) => (
                <div key={i} className="settings-user-card" style={{ opacity: 0.6, pointerEvents: "none" }}>
                  <div className="sk sk-round" style={{ width: 40, height: 40, flexShrink: 0 }} />
                  <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 7 }}>
                    <div className="sk" style={{ width: 140, height: 13 }} />
                    <div className="sk" style={{ width: 180, height: 11 }} />
                    <div className="sk" style={{ width: 80, height: 20, borderRadius: 10 }} />
                  </div>
                </div>
              ))
            ) : (
              filteredUsers.map((user) => {
                const userTeams = teams.filter((team) => team.members.includes(user.accountId));
                return (
                  <div key={user.accountId} className="settings-user-card">
                    <div className="settings-user-avatar" style={{ background: avatarColor(user.accountId) }}>
                      {initials(user.displayName)}
                    </div>
                    <div className="settings-user-content">
                      <div className="settings-user-name">{user.displayName}</div>
                      <div className="settings-user-email">
                        {user.emailAddress ?? `${user.accountId}@jira.local`}
                      </div>
                      <div className="settings-user-team-row">
                        {userTeams.length === 0 ? (
                          <span className="settings-empty-note">No teams assigned</span>
                        ) : (
                          userTeams.map((team) => (
                            <TeamTag key={team.id} name={team.name} color={team.color} />
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </main>
  );
}
