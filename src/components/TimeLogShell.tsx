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

function formatDate(isoString: string): string {
  const d = new Date(isoString);
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  }).format(d);
}

function todayIST(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
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
  const [projectsLoading, setProjectsLoading] = useState(true);
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
  const [historyLoading, setHistoryLoading] = useState(true);

  const issueDropdownRef = useRef<HTMLDivElement>(null);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetch("/api/timelog/projects")
      .then((r) => r.json())
      .then((data: JiraProject[]) => setProjects(Array.isArray(data) ? data : []))
      .finally(() => setProjectsLoading(false));
  }, []);

  const loadHistory = useCallback(() => {
    setHistoryLoading(true);
    fetch("/api/timelog/history")
      .then((r) => r.json())
      .then((data: WorklogEntry[]) => setHistory(Array.isArray(data) ? data : []))
      .finally(() => setHistoryLoading(false));
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  // Debounced issue search
  useEffect(() => {
    if (!selectedProject) {
      setIssueResults([]);
      return;
    }
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      setIssueLoading(true);
      fetch(`/api/timelog/issues?project=${encodeURIComponent(selectedProject)}&q=${encodeURIComponent(issueQuery)}`)
        .then((r) => r.json())
        .then((data: JiraIssueOption[]) => setIssueResults(Array.isArray(data) ? data : []))
        .finally(() => setIssueLoading(false));
    }, 300);
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
        loadHistory();
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
            <Link href="/settings" className="home-nav-item">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
              Settings
            </Link>
          )}
        </aside>

        <div className="home-content">
          <main className="timelog-main">

            {/* Log time form */}
            <div className="timelog-form-card">
              <div className="timelog-form-header">
                <h2 className="timelog-form-title">Log Time</h2>
                <p className="timelog-form-sub">Select a ticket and enter the time you spent on it.</p>
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
                        placeholder={selectedProject ? "Search by name or key…" : "Select a project first"}
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
                        <div className="issue-dropdown">
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
                  <span className="section-status success">{history.length} entries</span>
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
                </div>
              )}
            </div>

          </main>
        </div>
      </div>
    </div>
  );
}
