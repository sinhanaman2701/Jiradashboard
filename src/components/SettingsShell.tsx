"use client";

import Link from "next/link";
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
    <div className="settings-screen">
      <header className="topbar">
        <div className="topbar-brand">
          <Link href="/" className="worklog-breadcrumb">
            <div className="logo-mark" aria-hidden="true">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <rect x="1" y="1" width="5" height="5" rx="1.2" fill="white" opacity="0.9" />
                <rect x="8" y="1" width="5" height="5" rx="1.2" fill="white" opacity="0.6" />
                <rect x="1" y="8" width="5" height="5" rx="1.2" fill="white" opacity="0.6" />
                <rect x="8" y="8" width="5" height="5" rx="1.2" fill="white" opacity="0.3" />
              </svg>
            </div>
            <span className="app-name app-name-muted">Worklog</span>
          </Link>
          <span className="breadcrumb-separator">/</span>
          <span className="settings-page-label">Settings</span>
        </div>

        <Link href="/" className="settings-back-link">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M19 12H5M5 12l7-7M5 12l7 7" />
          </svg>
          Dashboard
        </Link>
      </header>

      <div className="settings-layout">
        <aside className="settings-sidebar">
          <div className="settings-sidebar-label">Settings</div>
          <button type="button" className="settings-nav-item active">
            <span className="settings-nav-icon"><UsersIcon /></span>
            <span>Manage Team</span>
          </button>
        </aside>

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
            <div className="settings-empty-note" style={{ padding: "16px 0" }}>Loading teams…</div>
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
            {filteredUsers.map((user) => {
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
            })}
          </div>
        </main>
      </div>
    </div>
  );
}
