"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { parseTimeToSeconds, secondsToHuman } from "@/lib/time-parser";
import { avatarColor, initials } from "@/lib/teams";
import type { JiraIssueOption, WorklogEntry } from "@/lib/jira/timelog";
import type { AdminTimeLogOverview } from "@/lib/jira/timelog-admin";

interface SessionUser {
  accountId: string;
  displayName: string;
  email: string;
  avatarUrl: string;
  role: "admin" | "user";
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

function currentIstTimestamp(): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(new Date());

  const hour = parts.find((part) => part.type === "hour")?.value ?? "00";
  const minute = parts.find((part) => part.type === "minute")?.value ?? "00";
  const second = parts.find((part) => part.type === "second")?.value ?? "00";
  return `${todayIST()}T${hour}:${minute}:${second}.000+0530`;
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

function dayOfWeekShort(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  if (!year || !month || !day) return "";
  return new Intl.DateTimeFormat("en-IN", {
    weekday: "short",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
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

function estimateLabel(seconds: number): string {
  return seconds > 0 ? secondsToHuman(seconds) : "No ETA";
}

function sortIssuesByLatestLog(issues: JiraIssueOption[]): JiraIssueOption[] {
  return [...issues].sort((a, b) => {
    if (a.latestLoggedAt && b.latestLoggedAt) return b.latestLoggedAt.localeCompare(a.latestLoggedAt);
    if (a.latestLoggedAt) return -1;
    if (b.latestLoggedAt) return 1;
    return a.summary.localeCompare(b.summary);
  });
}

export function TimeLogShell({ user }: { user: SessionUser }) {
  const router = useRouter();

  // Form state
  const [issueQuery, setIssueQuery] = useState("");
  const [issueResults, setIssueResults] = useState<JiraIssueOption[]>([]);
  const [issueLoading, setIssueLoading] = useState(false);
  const [selectedIssue, setSelectedIssue] = useState<JiraIssueOption | null>(null);
  const [visibleTaskCount, setVisibleTaskCount] = useState(10);
  const [issueRefreshVersion, setIssueRefreshVersion] = useState(0);
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

  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const issueSearchAbortRef = useRef<AbortController | null>(null);

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
      .catch(() => {
        setHistory([]);
        setHistoryPage(page);
        setHistoryTotal(0);
        setHistoryTotalPages(1);
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
    if (user.role === "admin") {
      setIssueResults([]);
      return;
    }
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    issueSearchAbortRef.current?.abort();
    searchDebounceRef.current = setTimeout(() => {
      const controller = new AbortController();
      issueSearchAbortRef.current = controller;
      setIssueLoading(true);
      fetch(`/api/timelog/issues?q=${encodeURIComponent(issueQuery)}`, {
        signal: controller.signal,
      })
        .then((r) => (r.ok ? r.json() : []))
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
  }, [issueQuery, issueRefreshVersion, user.role]);

  useEffect(() => {
    setVisibleTaskCount(10);
  }, [issueQuery]);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError("");
    setSubmitSuccess(false);

    const seconds = parseTimeToSeconds(timeInput.trim());
    if (!seconds) {
      setTimeError("Enter a valid time like 2h, 30m, or 2h 30m");
      return;
    }
    setTimeError("");

    if (!selectedIssue) return;

    const issueBeingLogged = selectedIssue;
    setSubmitting(true);
    try {
      const res = await fetch("/api/timelog/log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          issueKey: selectedIssue.key,
          timeSpentSeconds: seconds,
          date: todayIST(),
          comment: description,
        }),
      });
      const data = await res.json().catch(() => ({})) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setSubmitError(data.error ?? "Failed to log time. Please try again.");
      } else {
        setIssueResults((current) => sortIssuesByLatestLog(
          current.map((issue) =>
            issue.key === issueBeingLogged.key
              ? {
                  ...issue,
                  totalLoggedSeconds: issue.totalLoggedSeconds + seconds,
                  latestLoggedAt: currentIstTimestamp(),
                }
              : issue
          )
        ));
        setSubmitSuccess(true);
        setSelectedIssue(null);
        setIssueQuery("");
        setTimeInput("");
        setDescription("");
        setIssueRefreshVersion((current) => current + 1);
        loadHistory(1);
        loadAdminOverview();
      }
    } catch {
      setSubmitError("Failed to log time. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const canSubmit = Boolean(selectedIssue && timeInput.trim() && !submitting);
  const visibleTasks = issueResults.slice(0, visibleTaskCount);
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
                      Last 5 days logging activity · 40h weekly target (Mon–Fri)
                    </p>
                  </div>
                  {!adminOverviewLoading && adminOverview && (
                    <span className="section-status success">{adminOverview.users.length} users</span>
                  )}
                </div>

                {adminOverviewLoading ? (
                  <div className="timelog-history-loading">Loading team logging status…</div>
                ) : !adminOverview || adminOverview.users.length === 0 ? (
                  <div className="empty-state">No active users found.</div>
                ) : (
                  <div className="timelog-admin-list">
                    {adminOverview.users.map((member) => {
                      const whours = Math.round((member.weeklyLoggedSeconds / 3600) * 10) / 10;
                      return (
                        <details key={member.accountId} className="timelog-admin-card">
                          <summary className="timelog-admin-summary member-summary timelog-admin-tab-row">
                            <span
                              className="avatar-circle"
                              style={{ background: avatarColor(member.accountId) }}
                              aria-hidden="true"
                            >
                              {initials(member.displayName)}
                            </span>

                            <span className="member-identity">
                              <span className="member-name">{member.displayName}</span>
                              <span className="member-subtitle">Last 5 days</span>
                            </span>

                            <span className="timelog-weekly-chip">
                              <span className="timelog-weekly-hours">{whours}</span>
                              <span className="timelog-weekly-sep">/</span>
                              <span className="timelog-weekly-target">40h</span>
                            </span>

                            <span className="timelog-admin-overs" aria-label="Last 5 days logging status">
                              {member.days.map((day) => (
                                <span
                                  key={day.date}
                                  className={`timelog-day-dot ${day.isWeekend ? "weekend" : day.hasLogged ? "logged" : "missing"}`}
                                  data-tooltip={
                                    day.isWeekend
                                      ? `${dayOfWeekShort(day.date)} ${formatShortDate(day.date)} · Weekly off`
                                      : `${dayOfWeekShort(day.date)} ${formatShortDate(day.date)} · ${day.hasLogged ? `${day.loggedHours}h logged` : "No logs"}`
                                  }
                                />
                              ))}
                            </span>

                            <span className="timelog-admin-toggle">View logs</span>
                          </summary>
                          <div className="timelog-admin-detail">
                            {member.productClientGroups.length === 0 ? (
                              <div className="timelog-admin-empty">No worklogs in the last 5 days.</div>
                            ) : (
                              <div className="timelog-pc-groups">
                                {member.productClientGroups.map((group) => (
                                  <details key={group.label} className="timelog-pc-card">
                                    <summary className="timelog-pc-summary">
                                      <span className="timelog-pc-label">{group.label}</span>
                                      <span className="timelog-pc-meta">{group.taskCount} task{group.taskCount === 1 ? "" : "s"}</span>
                                      <span className="timelog-pc-hours">{secondsToHuman(group.totalLoggedSeconds)}</span>
                                      <span className="timelog-admin-toggle">View tasks</span>
                                    </summary>
                                    <div className="timelog-pc-task-list">
                                      <div className="timelog-pc-task-head">
                                        <span>Task</span>
                                        <span>ETA</span>
                                        <span>Logged</span>
                                        <span>Last logged</span>
                                      </div>
                                      {group.tasks.map((task) => (
                                        <div key={task.issueKey} className="timelog-pc-task-row">
                                          <span className="timelog-pc-task-name">
                                            <a
                                              className="ticket-link"
                                              href={jiraBaseUrl ? `${jiraBaseUrl}/browse/${task.issueKey}` : "#"}
                                              target={jiraBaseUrl ? "_blank" : undefined}
                                              rel={jiraBaseUrl ? "noreferrer" : undefined}
                                            >
                                              {task.issueKey}
                                            </a>
                                            <span>{task.issueSummary}</span>
                                          </span>
                                          <span className="timelog-pc-task-eta">{task.eta ?? "—"}</span>
                                          <span className="timelog-pc-task-logged">{secondsToHuman(task.loggedSeconds)}</span>
                                          <span className="timelog-pc-task-date">{formatShortDate(task.lastLoggedAt.slice(0, 10))}</span>
                                        </div>
                                      ))}
                                    </div>
                                  </details>
                                ))}
                              </div>
                            )}
                          </div>
                        </details>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {user.role !== "admin" && (
              <>
                <div className="timelog-form-card">
                  <div className="timelog-form-header">
                    <h2 className="timelog-form-title">Your Assigned Tasks</h2>
                    <p className="timelog-form-sub">Pick a task card and log time without searching through Jira.</p>
                  </div>

                  <div className="timelog-form-body">
                    <div className="timelog-task-toolbar">
                      <div className="field-group timelog-task-search">
                        <label className="field-label" htmlFor="tl-task-search">Search tasks</label>
                        <input
                          id="tl-task-search"
                          type="text"
                          className="field-control"
                          style={{ width: "100%" }}
                          placeholder="Search by task key or summary"
                          value={issueQuery}
                          onChange={(e) => {
                            setIssueQuery(e.target.value);
                          }}
                        />
                      </div>
                      <span className="section-status success">
                        {issueLoading ? "Loading tasks…" : `${issueResults.length} assigned tasks`}
                      </span>
                    </div>

                    {issueLoading && issueResults.length === 0 ? (
                      <div className="timelog-history-loading">Loading assigned tasks…</div>
                    ) : issueResults.length === 0 ? (
                      <div className="empty-state">No assigned tasks found.</div>
                    ) : (
                      <>
                        <div className="timelog-task-grid">
                          {visibleTasks.map((issue) => (
                            <div key={issue.id} className="timelog-task-card">
                              <div className="timelog-task-card-top">
                                <span className="timelog-task-space">{issue.projectName} ({issue.projectKey})</span>
                                {issueTypeBadge(issue.issueType)}
                              </div>
                              <div className="timelog-task-name-block">
                                <a
                                  className="timelog-task-title"
                                  href={jiraBaseUrl ? `${jiraBaseUrl}/browse/${issue.key}` : "#"}
                                  target={jiraBaseUrl ? "_blank" : undefined}
                                  rel={jiraBaseUrl ? "noreferrer" : undefined}
                                >
                                  {issue.summary}
                                </a>
                                <div className="task-key">{issue.key}</div>
                              </div>
                              <div className="timelog-task-metrics">
                                <span className="metric-chip">
                                  <em className="metric-chip-label">ETA</em>
                                  <strong className="metric-chip-value">{estimateLabel(issue.originalEstimateSeconds)}</strong>
                                </span>
                                <span className="metric-chip">
                                  <em className="metric-chip-label">Logged till now</em>
                                  <strong className="metric-chip-value">{secondsToHuman(issue.totalLoggedSeconds)}</strong>
                                </span>
                              </div>
                              {issue.latestLoggedAt ? (
                                <span className="issue-dropdown-recent">{formatRecentLogDate(issue.latestLoggedAt)}</span>
                              ) : (
                                <span className="timelog-task-muted">No time logged yet</span>
                              )}
                              <button
                                type="button"
                                className="primary-button timelog-task-log-button"
                                onClick={() => {
                                  setSelectedIssue(issue);
                                  setTimeInput("");
                                  setDescription("");
                                  setTimeError("");
                                  setSubmitError("");
                                  setSubmitSuccess(false);
                                }}
                              >
                                Log time
                              </button>
                            </div>
                          ))}
                        </div>
                        {visibleTaskCount < issueResults.length && (
                          <div className="timelog-load-more">
                            <button
                              type="button"
                              className="secondary-button"
                              onClick={() => setVisibleTaskCount((current) => current + 10)}
                            >
                              Load more
                            </button>
                          </div>
                        )}
                      </>
                    )}

                    {submitSuccess && (
                      <span className="timelog-success-msg">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                        Time logged successfully in Jira!
                      </span>
                    )}
                  </div>
                </div>

                {selectedIssue && (
                  <div className="modal-backdrop" role="dialog" aria-modal="true">
                    <form className="modal-panel" onSubmit={handleSubmit}>
                      <div className="modal-title">Log time</div>
                      <p className="modal-copy">
                        {selectedIssue.key} · {selectedIssue.summary}
                      </p>
                      <div className="modal-fields">
                        <div className="field-group">
                          <label className="field-label" htmlFor="tl-time">Time Spent</label>
                          <input
                            id="tl-time"
                            type="text"
                            className={`field-control ${timeError ? "field-control-error" : ""}`}
                            placeholder="e.g. 2h, 30m, 2h 30m"
                            value={timeInput}
                            onChange={(e) => { setTimeInput(e.target.value); setTimeError(""); }}
                          />
                          {timeError && <span className="inline-error">{timeError}</span>}
                        </div>
                        <div className="field-group">
                          <label className="field-label" htmlFor="tl-desc">Comment (optional)</label>
                          <input
                            id="tl-desc"
                            type="text"
                            className="field-control"
                            placeholder="What did you work on?"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                          />
                        </div>
                      </div>
                      {submitError && <span className="timelog-error-msg">{submitError}</span>}
                      <div className="modal-actions">
                        <button
                          type="button"
                          className="secondary-button"
                          onClick={() => {
                            if (submitting) return;
                            setSelectedIssue(null);
                            setTimeError("");
                            setSubmitError("");
                          }}
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          className="primary-button"
                          disabled={!canSubmit}
                        >
                          {submitting ? "Logging…" : "Log"}
                        </button>
                      </div>
                    </form>
                  </div>
                )}

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
