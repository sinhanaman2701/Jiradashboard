"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { JiraUserSummary } from "@/lib/jira/types";
import {
  TEAM_COLOR_TOKENS,
  type TeamColor,
  type TeamRecord,
  avatarColor,
  initials,
  readTeamsFromStorage,
  slugify,
  writeTeamsToStorage
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

const NAV_SECTIONS = [
  {
    id: "manage-team",
    label: "Manage Team",
    description: "Create teams, assign members, and manage roles.",
    icon: <UsersIcon />
  }
] as const;

function TeamTag({
  name,
  color,
  onRemove
}: {
  name: string;
  color: TeamColor;
  onRemove?: () => void;
}) {
  const token = TEAM_COLOR_TOKENS[color];
  return (
    <span className="team-tag" style={{ background: token.bg, color: token.text }}>
      <span className="team-tag-dot" style={{ background: token.dot }} />
      {name}
      {onRemove ? (
        <button type="button" className="tag-remove-button" onClick={onRemove}>
          ×
        </button>
      ) : null}
    </span>
  );
}

function TeamModal({
  mode,
  team,
  existing,
  onClose,
  onSubmit,
  onDelete
}: {
  mode: "create" | "edit";
  team?: TeamRecord;
  existing: TeamRecord[];
  onClose: () => void;
  onSubmit: (team: TeamRecord) => void;
  onDelete?: (id: string) => void;
}) {
  const colors = Object.keys(TEAM_COLOR_TOKENS) as TeamColor[];
  const [name, setName] = useState(team?.name ?? "");
  const [color, setColor] = useState<TeamColor>(team?.color ?? "blue");
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  function submit() {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Team name is required.");
      return;
    }

    if (
      existing.some(
        (entry) =>
          entry.id !== team?.id && entry.name.toLowerCase() === trimmed.toLowerCase()
      )
    ) {
      setError(mode === "create" ? "A team with that name already exists." : "Name already taken.");
      return;
    }

    onSubmit({
      id: team?.id ?? slugify(trimmed),
      name: trimmed,
      color,
      members: team?.members ?? []
    });
  }

  return (
    <div className="modal-backdrop" onClick={(event) => event.target === event.currentTarget && onClose()}>
      <div className="modal-panel">
        <div className="modal-title">{mode === "create" ? "New Team" : "Edit Team"}</div>
        <div className="modal-copy">
          {mode === "create"
            ? "Teams let you filter and group members on the dashboard."
            : "Update the team name and color or delete this team."}
        </div>

        <div className="modal-fields">
          <div>
            <label className="field-label">Team Name</label>
            <input
              autoFocus
              className={`field-control ${error ? "field-control-error" : ""}`}
              type="text"
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                setError("");
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") submit();
              }}
              placeholder="e.g. Frontend, Design, Platform"
            />
            {error ? <div className="inline-error">{error}</div> : null}
          </div>

          <div>
            <label className="field-label">Color</label>
            <div className="color-picker-row">
              {colors.map((entry) => {
                const token = TEAM_COLOR_TOKENS[entry];
                return (
                  <button
                    key={entry}
                    type="button"
                    className={`color-choice ${color === entry ? "selected" : ""}`}
                    style={{ borderColor: color === entry ? token.dot : "#e4e8f0" }}
                    onClick={() => setColor(entry)}
                  >
                    <span className="team-tag-dot" style={{ background: token.dot }} />
                    {entry.charAt(0).toUpperCase() + entry.slice(1)}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {mode === "edit" && onDelete && team ? (
          confirmDelete ? (
            <div className="confirm-delete-box">
              <span>Delete &quot;{team.name}&quot;? This will remove all member assignments.</span>
              <div className="confirm-delete-actions">
                <button type="button" className="delete-ghost" onClick={() => setConfirmDelete(false)}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="confirm-delete-button"
                  onClick={() => onDelete(team.id)}
                >
                  Yes, delete
                </button>
              </div>
            </div>
          ) : (
            <div className="danger-zone">
              <button type="button" className="delete-ghost" onClick={() => setConfirmDelete(true)}>
                Delete team
              </button>
            </div>
          )
        ) : null}

        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="primary-button" onClick={submit}>
            {mode === "create" ? "Create Team" : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function SettingsShell({ users }: { users: JiraUserSummary[] }) {
  const [activeSection] = useState("manage-team");
  const [teams, setTeams] = useState<TeamRecord[]>([]);
  const [query, setQuery] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [editingTeam, setEditingTeam] = useState<TeamRecord | null>(null);
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);

  useEffect(() => {
    setTeams(readTeamsFromStorage());
  }, []);

  useEffect(() => {
    writeTeamsToStorage(teams);
  }, [teams]);

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

  function upsertTeam(team: TeamRecord) {
    setTeams((current) => {
      const existing = current.some((entry) => entry.id === team.id);
      if (!existing) return [...current, team];
      return current.map((entry) => (entry.id === team.id ? team : entry));
    });
    setCreateOpen(false);
    setEditingTeam(null);
  }

  function deleteTeam(teamId: string) {
    setTeams((current) => current.filter((team) => team.id !== teamId));
    setEditingTeam(null);
  }

  function removeUserFromTeam(teamId: string, userId: string) {
    setTeams((current) =>
      current.map((team) =>
        team.id === teamId
          ? { ...team, members: team.members.filter((member) => member !== userId) }
          : team
      )
    );
  }

  function addUserToTeam(teamId: string, userId: string) {
    setTeams((current) =>
      current.map((team) =>
        team.id === teamId && !team.members.includes(userId)
          ? { ...team, members: [...team.members, userId] }
          : team
      )
    );
    setExpandedUserId(null);
  }

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
          {NAV_SECTIONS.map((section) => (
            <button
              key={section.id}
              type="button"
              className={`settings-nav-item ${activeSection === section.id ? "active" : ""}`}
            >
              <span className="settings-nav-icon">{section.icon}</span>
              <span>{section.label}</span>
            </button>
          ))}
        </aside>

        <main className="settings-main">
          <div className="settings-main-header">
            <div>
              <h1 className="settings-main-title">Manage Team</h1>
              <p className="settings-main-copy">
                Create teams, assign members, and manage roles.
              </p>
            </div>
            <button type="button" className="primary-button" onClick={() => setCreateOpen(true)}>
              + Create Team
            </button>
          </div>

          {teams.length > 0 ? (
            <div className="team-chip-row">
              {teams.map((team) => (
                <button
                  key={team.id}
                  type="button"
                  className="team-chip-button"
                  onClick={() => setEditingTeam(team)}
                >
                  <span className="team-tag-dot" style={{ background: TEAM_COLOR_TOKENS[team.color].dot }} />
                  <span>{team.name}</span>
                  <span className="team-chip-count">{team.members.length}</span>
                  <span className="team-chip-edit">✎</span>
                </button>
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
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search users"
            />
          </div>

          <div className="settings-user-list">
            {filteredUsers.map((user) => {
              const userTeams = teams.filter((team) => team.members.includes(user.accountId));
              const availableTeams = teams.filter((team) => !team.members.includes(user.accountId));
              const isExpanded = expandedUserId === user.accountId;
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
                          <TeamTag
                            key={team.id}
                            name={team.name}
                            color={team.color}
                            onRemove={() => removeUserFromTeam(team.id, user.accountId)}
                          />
                        ))
                      )}

                      {teams.length > 0 ? (
                        <button
                          type="button"
                          className="add-to-team-button"
                          onClick={() =>
                            setExpandedUserId((current) =>
                              current === user.accountId ? null : user.accountId
                            )
                          }
                        >
                          + Add to team
                        </button>
                      ) : null}
                    </div>

                    {isExpanded ? (
                      <div className="inline-team-picker">
                        {availableTeams.length > 0 ? (
                          availableTeams.map((team) => (
                            <button
                              key={team.id}
                              type="button"
                              className="inline-team-option"
                              onClick={() => addUserToTeam(team.id, user.accountId)}
                            >
                              {team.name}
                            </button>
                          ))
                        ) : (
                          <span className="settings-user-email">No remaining teams</span>
                        )}
                        <button
                          type="button"
                          className="inline-cancel-button"
                          onClick={() => setExpandedUserId(null)}
                        >
                          Cancel
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </main>
      </div>

      {createOpen ? (
        <TeamModal
          mode="create"
          existing={teams}
          onClose={() => setCreateOpen(false)}
          onSubmit={upsertTeam}
        />
      ) : null}

      {editingTeam ? (
        <TeamModal
          mode="edit"
          team={editingTeam}
          existing={teams}
          onClose={() => setEditingTeam(null)}
          onSubmit={upsertTeam}
          onDelete={deleteTeam}
        />
      ) : null}
    </div>
  );
}
