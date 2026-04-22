"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { parseTimeToSeconds, secondsToHuman } from "@/lib/time-parser";
import { avatarColor, initials } from "@/lib/teams";
import type { JiraProject, JiraIssueOption, WorklogEntry } from "@/lib/jira/timelog";

interface SessionUser {
  accountId: string;
  displayName: string;
  email: string;
  avatarUrl: string;
  role: "admin" | "user";
}

interface AdminTimeLogDay {
  date: string;
  loggedSeconds: number;
  loggedHours: number;
  hasLogged: boolean;
}

interface AdminTimeLogEntry {
  id: string;
  date: string;
  started: string;
  issueKey: string;
  issueSummary: string;
  projectKey: string;
  timeSpentSeconds: number;
}

interface AdminTimeLogDailyLog {
  date: string;
  loggedSeconds: number;
  entries: AdminTimeLogEntry[];
}

interface AdminTimeLogUser {
  accountId: string;
  displayName: string;
  todayLoggedSeconds: number;
  todayLoggedHours: number;
  days: AdminTimeLogDay[];
  dailyLogs: AdminTimeLogDailyLog[];
}

interface AdminTimeLogOverview {
  from: string;
  to: string;
  users: AdminTimeLogUser[];
}

interface WorklogHistoryResponse {
  entries: WorklogEntry[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

function formatRecentLogDate(started: string): string {
  return `Last logged ${formatShortDate(started.slice(0, 10))}`;
}

function formatDate(started: string): string {
  const [year, month, day] = started.slice(0, 10).split("-").map(Number);
  if (!year || !month || !day) return started;

  const utcDate = new Date(Date.UTC(year, month - 1, day));
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(utcDate);
}

function todayIST(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function formatShortDate(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  if (!year || !month || !day) return date;

  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

function formatDailyTarget(seconds: number): string {
  return `${secondsToHuman(seconds)}/8h`;
}

function issueTypeBadge(type: string) {
  const lower = type.toLowerCase();
  let bg = "#dbeafe", color = "#1d4ed8", label = type;
  if (lower.includes("bug")) { bg = "#fee2e2"; color = "#b91c1c"; }
  else if (lower.includes("epic")) { bg = "#ede9fe"; color = "#6d28d9"; }
  else if (lower.includes("story")) { bg = "#d1fae5"; color = "#065f46"; }
  else if (lower.includes("sub")) { bg = "#f3f4f6"; color = "#374151"; }
  return (
    <span className="issue-type-badge" style={{ background: bg, color }}>{label}</span>
  );
}

export function TimeLogShell({ user }: { user: SessionUser }) {
  const router = useRouter();

  // Form state
  const [projects, setProjects] = useState<JiraProject[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(user.role !== "admin");
  const [selectedProject, setSelectedProject] = useState("");
  const [issueQuery, setIssueQuery] = useState("");
  const [issueResults, setIssueResults] = useState<JiraIssueOption[]>([]);
  const [issueLoading, setIssueLoading] = useState(false);
  const [selectedIssue, setSelectedIssue] = useState<JiraIssueOption | null>(null);
  const [showIssueDropdown, setShowIssueDropdown] = useState(false);
  const [date, setDate] = useState(todayIST());
  const [timeInput, setTimeInput] = useState("");
  const [timeError, setTimeError] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [submitSuccess, setSubmitSuccess] = useState(false);

  // History state
  const [history, setHistory] = useState<WorklogEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(user.role !== "admin");
  const [historyPage, setHistoryPage] = useState(1);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyTotalPages, setHistoryTotalPages] = useState(1);
  const [adminOverview, setAdminOverview] = useState<AdminTimeLogOverview | null>(null);
  const [adminOverviewLoading, setAdminOverviewLoading] = useState(user.role === "admin");

  const issueDropdownRef = useRef<HTMLDivElement>(null);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const issueSearchAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (user.role === "admin") return;
    fetch("/api/timelog/projects")
      .then((r) => r.json())
      .then((data: JiraProject[]) => setProjects(Array.isArray(data) ? data : []))
      .finally(() => setProjectsLoading(false));
  }, [user.role]);

  const loadHistory = useCallback((page: number) => {
    setHistoryLoading(true);
    fetch(`/api/timelog/history?page=${page}`)
      .then((r) => r.json())
      .then((data: WorklogHistoryResponse) => {
        setHistory(Array.isArray(data.entries) ? data.entries : []);
        setHistoryPage(data.page ?? page);
        setHistoryTotal(data.total ?? 0);
        setHistoryTotalPages(data.totalPages ?? 1);
      })
      .finally(() => setHistoryLoading(false));
  }, []);

  useEffect(() => {
    if (user.role === "admin") return;
    loadHistory(1);
  }, [loadHistory, user.role]);

  const loadAdminOverview = useCallback(() => {
    if (user.role !== "admin") return;
    setAdminOverviewLoading(true);
    fetch("/api/timelog/admin-overview")
      .then((r) => r.json())
      .then((data: AdminTimeLogOverview) => {
        if (Array.isArray(data.users)) setAdminOverview(data);
      })
      .finally(() => setAdminOverviewLoading(false));
  }, [user.role]);

  useEffect(() => {
    loadAdminOverview();
  }, [loadAdminOverview]);

  // Debounced issue search
  useEffect(() => {
    if (!selectedProject) {
      setIssueResults([]);
      return;
    }
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    issueSearchAbortRef.current?.abort();
    searchDebounceRef.current = setTimeout(() => {
      const controller = new AbortController();
      issueSearchAbortRef.current = controller;
      setIssueLoading(true);
      fetch(`/api/timelog/issues?project=${encodeURIComponent(selectedProject)}&q=${encodeURIComponent(issueQuery)}`, {
        signal: controller.signal,
      })
        .then((r) => r.json())
        .then((data: JiraIssueOption[]) => setIssueResults(Array.isArray(data) ? data : []))
        .catch((error) => {
          if ((error as Error).name !== "AbortError") setIssueResults([]);
        })
        .finally(() => {
          if (issueSearchAbortRef.current === controller) {
            issueSearchAbortRef.current = null;
            setIssueLoading(false);
          }
        });
    }, 500);

    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
      issueSearchAbortRef.current?.abort();
    };
  }, [selectedProject, issueQuery]);

  // Close issue dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (issueDropdownRef.current && !issueDropdownRef.current.contains(e.target as Node)) {
        setShowIssueDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError("");
    setSubmitSuccess(false);

    const seconds = parseTimeToSeconds(timeInput);
    if (!seconds) {
      setTimeError("Enter a valid time like 2h, 30m, or 2h 30m");
      return;
    }
    setTimeError("");

    if (!selectedIssue) return;

    setSubmitting(true);
    try {
      const res = await fetch("/api/timelog/log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          issueKey: selectedIssue.key,
          timeSpentSeconds: seconds,
          date,
          comment: description,
        }),
      });
      const data = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setSubmitError(data.error ?? "Failed to log time. Please try again.");
      } else {
        setSubmitSuccess(true);
        setSelectedIssue(null);
        setIssueQuery("");
        setTimeInput("");
        setDescription("");
        setDate(todayIST());
        loadHistory(1);
        loadAdminOverview();
      }
    } finally {
      setSubmitting(false);
    }
  }

  const canSubmit = Boolean(selectedIssue && timeInput && date && !submitting);
  const jiraBaseUrl = process.env.NEXT_PUBLIC_JIRA_BASE_URL ?? "";

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
        </div>
        <div className="topbar-right">
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
          {user.role === "admin" && (
            <>
              <Link href="/" className="home-nav-item">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="3" width="7" height="7" rx="1" />
                  <rect x="14" y="3" width="7" height="7" rx="1" />
                  <rect x="3" y="14" width="7" height="7" rx="1" />
                  <rect x="14" y="14" width="7" height="7" rx="1" />
                </svg>
                Dashboard
              </Link>
              <Link href="/?view=sprints" className="home-nav-item">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
                </svg>
                Sprints
              </Link>
            </>
          )}
          <Link href="/time-logging" className="home-nav-item active">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            Time Logging
          </Link>
          {user.role === "admin" && (
            <Link href="/?view=manage-team" className="home-nav-item">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
              Manage Team
            </Link>
          )}
        </aside>

        <div className="home-content">
          <main className="timelog-main">
            {user.role === "admin" && (
              <div className="timelog-admin-section">
                <div className="section-row" style={{ marginBottom: 12 }}>
                  <div>
                    <div className="section-label">Team Time Logging</div>
                    <p className="timelog-admin-sub">
                      Today&apos;s logged time and last 7 days logging status for every active Jira user.
                    </p>
                  </div>
                  {!adminOverviewLoading && adminOverview && (
                    <span className="section-status success">{adminOverview.users.length} users</span>
                  )}
                </div>

                {adminOverviewLoading ? (
                  <div className="timelog-history-loading">Loading team logging status…</div>
                ) : !adminOverview || adminOverview.users.length === 0 ? (
                  <div className="empty-state">No active users found for the last 7 days.</div>
                ) : (
                  <div className="timelog-admin-list">
                    {adminOverview.users.map((member) => (
                      <details key={member.accountId} className="timelog-admin-card">
                        <summary className="timelog-admin-summary member-summary">
                          <span
                            className="avatar-circle"
                            style={{ background: avatarColor(member.accountId) }}
                            aria-hidden="true"
                          >
                              {initials(member.displayName)}
                          </span>

                          <span className="member-identity">
                            <span className="member-name">{member.displayName}</span>
                            <span className="member-subtitle">Last 7 days logging activity</span>
                          </span>

                          <span className="metric-chip">
                            <span className="metric-chip-label">Today</span>
                            <span className="metric-chip-value">
                              {member.todayLoggedSeconds > 0 ? secondsToHuman(member.todayLoggedSeconds) : "0h"}
                            </span>
                          </span>

                          <span className="timelog-admin-overs" aria-label="Last 7 days logging status">
                            {member.days.map((day) => (
                              <span
                                key={day.date}
                                className={`timelog-day-dot ${day.hasLogged ? "logged" : "missing"}`}
                                title={`${formatShortDate(day.date)}: ${day.hasLogged ? `${day.loggedHours}h logged` : "No logs"}`}
                              />
                            ))}
                          </span>

                          <span className={member.todayLoggedSeconds > 0 ? "status-pill status-complete" : "status-pill status-missing"}>
                            {member.todayLoggedSeconds > 0 ? "logged" : "missing"}
                          </span>

                          <span className="timelog-admin-toggle">View logs</span>
                        </summary>
                        <div className="timelog-admin-detail">
                          {member.dailyLogs.length === 0 ? (
                            <div className="timelog-admin-empty">No worklogs in the last 7 days.</div>
                          ) : (
                            member.dailyLogs.map((day) => (
                              <details
                                key={day.date}
                                className={`timelog-admin-day ${day.loggedSeconds < 8 * 3600 ? "under-target" : ""}`}
                              >
                                <summary className="timelog-admin-day-summary">
                                  <span className="timelog-history-date">{formatShortDate(day.date)}</span>
                                  <span className="member-subtitle">{day.entries.length} task log{day.entries.length === 1 ? "" : "s"}</span>
                                  <span className="timelog-day-total">{formatDailyTarget(day.loggedSeconds)}</span>
                                  <span className="timelog-admin-toggle">View tasks</span>
                                </summary>
                                <div className="timelog-admin-day-entries">
                                  {day.entries.map((entry) => (
                                    <div key={entry.id} className="timelog-admin-log">
                                      <span className="timelog-admin-log-issue">
                                        <a
                                          className="ticket-link"
                                          href={jiraBaseUrl ? `${jiraBaseUrl}/browse/${entry.issueKey}` : "#"}
                                          target={jiraBaseUrl ? "_blank" : undefined}
                                          rel={jiraBaseUrl ? "noreferrer" : undefined}
                                        >
                                          {entry.issueKey}
                                        </a>
                                        <span>{entry.issueSummary}</span>
                                      </span>
                                      <span className="timelog-history-project">{entry.projectKey}</span>
                                      <span className="timelog-history-time">{secondsToHuman(entry.timeSpentSeconds)}</span>
                                    </div>
                                  ))}
                                </div>
                              </details>
                            ))
                          )}
                        </div>
                      </details>
                    ))}
                  </div>
                )}
              </div>
            )}

            {user.role !== "admin" && (
              <>
                {/* Log time form */}
                <div className="timelog-form-card">
                  <div className="timelog-form-header">
                    <h2 className="timelog-form-title">Log Time</h2>
                    <p className="timelog-form-sub">Select one of your assigned tickets and enter the time you spent on it.</p>
                  </div>

                  <form onSubmit={handleSubmit} className="timelog-form-body">
                    {/* Row 1: Project + Issue */}
                    <div className="timelog-form-row">
                      <div className="field-group" style={{ minWidth: 180, flex: "0 0 220px" }}>
                        <label className="field-label" htmlFor="tl-project">Space (Project)</label>
                        <select
                          id="tl-project"
                          className="field-control"
                          value={selectedProject}
                          disabled={projectsLoading}
                          onChange={(e) => {
                            setSelectedProject(e.target.value);
                            setSelectedIssue(null);
                            setIssueQuery("");
                          }}
                        >
                          <option value="">{projectsLoading ? "Loading…" : "Select project"}</option>
                          {projects.map((p) => (
                            <option key={p.id} value={p.key}>{p.name} ({p.key})</option>
                          ))}
                        </select>
                      </div>

                  <div className="field-group" style={{ flex: 1, minWidth: 240 }} ref={issueDropdownRef}>
                    <label className="field-label" htmlFor="tl-issue">Task / Story / Bug / Epic</label>
                    <div className="issue-search-wrap">
                      <input
                        id="tl-issue"
                        type="text"
                        className="field-control"
                        style={{ width: "100%" }}
                        placeholder={selectedProject ? "Search your assigned tasks…" : "Select a project first"}
                        disabled={!selectedProject}
                        value={selectedIssue ? `${selectedIssue.key} — ${selectedIssue.summary}` : issueQuery}
                        onChange={(e) => {
                          setSelectedIssue(null);
                          setIssueQuery(e.target.value);
                          setShowIssueDropdown(true);
                        }}
                        onFocus={() => {
                          if (selectedProject) setShowIssueDropdown(true);
                        }}
                      />
                      {showIssueDropdown && selectedProject && (
                        <div
                          className="issue-dropdown"
                          onWheel={(event) => event.stopPropagation()}
                        >
                          {issueLoading ? (
                            <div className="issue-dropdown-msg">Searching…</div>
                          ) : issueResults.length === 0 ? (
                            <div className="issue-dropdown-msg">No issues found</div>
                          ) : (
                            issueResults.map((issue) => (
                              <button
                                key={issue.id}
                                type="button"
                                className="issue-dropdown-item"
                                onClick={() => {
                                  setSelectedIssue(issue);
                                  setShowIssueDropdown(false);
                                  setIssueQuery("");
                                }}
                              >
                                <div className="issue-dropdown-meta">
                                  {issueTypeBadge(issue.issueType)}
                                  <span className="issue-dropdown-key">{issue.key}</span>
                                  <span className="issue-dropdown-status">{issue.status}</span>
                                  {issue.latestLoggedAt && (
                                    <span className="issue-dropdown-recent">{formatRecentLogDate(issue.latestLoggedAt)}</span>
                                  )}
                                </div>
                                <div className="issue-dropdown-summary">{issue.summary}</div>
                              </button>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                    {selectedIssue && (
                      <div className="selected-issue-pill">
                        {issueTypeBadge(selectedIssue.issueType)}
                        <span className="selected-issue-key">{selectedIssue.key}</span>
                        <span className="selected-issue-summary">{selectedIssue.summary}</span>
                        <button
                          type="button"
                          className="selected-issue-clear"
                          onClick={() => { setSelectedIssue(null); setIssueQuery(""); }}
                          aria-label="Clear selection"
                        >×</button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Row 2: Date + Time + Description */}
                <div className="timelog-form-row">
                  <div className="field-group">
                    <label className="field-label" htmlFor="tl-date">Date</label>
                    <input
                      id="tl-date"
                      type="date"
                      className="field-control"
                      value={date}
                      max={todayIST()}
                      onChange={(e) => setDate(e.target.value)}
                    />
                  </div>

                  <div className="field-group">
                    <label className="field-label" htmlFor="tl-time">Time Spent</label>
                    <input
                      id="tl-time"
                      type="text"
                      className={`field-control ${timeError ? "field-control-error" : ""}`}
                      placeholder="e.g. 2h, 30m, 2h 30m"
                      value={timeInput}
                      onChange={(e) => { setTimeInput(e.target.value); setTimeError(""); }}
                      style={{ minWidth: 160 }}
                    />
                    {timeError && <span className="inline-error">{timeError}</span>}
                  </div>

                  <div className="field-group" style={{ flex: 1, minWidth: 220 }}>
                    <label className="field-label" htmlFor="tl-desc">Description (optional)</label>
                    <input
                      id="tl-desc"
                      type="text"
                      className="field-control"
                      style={{ width: "100%" }}
                      placeholder="What did you work on?"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                    />
                  </div>
                </div>

                {/* Submit row */}
                <div className="timelog-submit-row">
                  {submitSuccess && (
                    <span className="timelog-success-msg">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      Time logged successfully in Jira!
                    </span>
                  )}
                  {submitError && <span className="timelog-error-msg">{submitError}</span>}
                  <button
                    type="submit"
                    className="primary-button"
                    style={{ height: 38, padding: "0 24px" }}
                    disabled={!canSubmit}
                  >
                    {submitting ? "Logging…" : "Log Time"}
                  </button>
                </div>
                  </form>
                </div>

                {/* History section */}
                <div className="timelog-history-section">
              <div className="section-row" style={{ marginBottom: 12 }}>
                <div className="section-label">My Logged Work</div>
                {!historyLoading && (
                  <span className="section-status success">
                    {historyTotal} entries · Page {historyPage} of {historyTotalPages}
                  </span>
                )}
              </div>

              {historyLoading ? (
                <div className="timelog-history-loading">Loading your work history…</div>
              ) : history.length === 0 ? (
                <div className="empty-state">No logged work in the last 90 days.</div>
              ) : (
                <div className="timelog-history-table">
                  <div className="timelog-history-head">
                    <span>Date</span>
                    <span>Issue</span>
                    <span>Project</span>
                    <span>Time</span>
                    <span>Description</span>
                  </div>
                  {history.map((entry) => (
                    <div key={entry.id} className="timelog-history-row">
                      <span className="timelog-history-date">{formatDate(entry.started)}</span>
                      <div className="timelog-history-issue">
                        <a
                          className="ticket-link"
                          href={jiraBaseUrl ? `${jiraBaseUrl}/browse/${entry.issueKey}` : "#"}
                          target={jiraBaseUrl ? "_blank" : undefined}
                          rel={jiraBaseUrl ? "noreferrer" : undefined}
                        >
                          {entry.issueSummary}
                        </a>
                        <div className="task-key">{entry.issueKey}</div>
                      </div>
                      <span className="timelog-history-project">{entry.projectKey}</span>
                      <span className="timelog-history-time">{secondsToHuman(entry.timeSpentSeconds)}</span>
                      <span className="timelog-history-desc">
                        {entry.comment
                          ? entry.comment.length > 80
                            ? entry.comment.slice(0, 80) + "…"
                            : entry.comment
                          : <em className="epic-not-linked">—</em>}
                      </span>
                    </div>
                  ))}
                  {historyTotalPages > 1 && (
                    <div className="timelog-pagination">
                      <button
                        type="button"
                        className="secondary-button"
                        disabled={historyPage <= 1 || historyLoading}
                        onClick={() => loadHistory(historyPage - 1)}
                      >
                        Previous
                      </button>
                      <span className="timelog-pagination-label">
                        Showing {history.length} of {historyTotal}
                      </span>
                      <button
                        type="button"
                        className="secondary-button"
                        disabled={historyPage >= historyTotalPages || historyLoading}
                        onClick={() => loadHistory(historyPage + 1)}
                      >
                        Next
                      </button>
                    </div>
                  )}
                </div>
              )}
                </div>
              </>
            )}

          </main>
        </div>
      </div>
    </div>
  );
}
