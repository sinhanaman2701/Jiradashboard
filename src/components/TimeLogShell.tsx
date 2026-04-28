"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { AnacityLogo } from "@/components/AnacityLogo";
import { secondsToHuman } from "@/lib/time-parser";
import { avatarColor, initials } from "@/lib/teams";
import type { JiraIssueOption } from "@/lib/jira/timelog";
import type { AdminTeamTimeLogSummary, AdminTimeLogOverview, AdminTimeLogWeek, ProductClientGroup } from "@/lib/jira/timelog-admin";

interface SessionUser {
  accountId: string;
  displayName: string;
  email: string;
  avatarUrl: string;
  role: "admin" | "user";
}

interface WorklogHistoryResponse {
  total: number;
  summaries?: {
    thisMonth: {
      label: string;
      from: string;
      to: string;
      totalLoggedSeconds: number;
      tasks: {
        issueKey: string;
        issueSummary: string;
        projectKey: string;
        totalLoggedSeconds: number;
        lastWorkedAt: string;
      }[];
    };
    previousMonth: {
      label: string;
      from: string;
      to: string;
      totalLoggedSeconds: number;
      tasks: {
        issueKey: string;
        issueSummary: string;
        projectKey: string;
        totalLoggedSeconds: number;
        lastWorkedAt: string;
      }[];
    };
  };
}

function formatRecentLogDate(started: string): string {
  return `Last logged ${formatShortDate(started.slice(0, 10))}`;
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

function startOfCurrentMonthIST(): string {
  const [year, month] = todayIST().split("-");
  return `${year}-${month}-01`;
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

function formatWeekRange(from: string, to: string): string {
  return `${formatShortDate(from)} - ${formatShortDate(to)}`;
}

function formatPeriodRange(from: string, to: string): string {
  return `${formatShortDate(from)} - ${formatShortDate(to)}`;
}

function weeklyHoursLabel(seconds: number): string {
  return `${secondsToHuman(seconds)}/40hrs`;
}

function periodHoursLabel(period: AdminTimeLogWeek, seconds: number): string {
  return period.hoursLabelMode === "weekly-target"
    ? weeklyHoursLabel(seconds)
    : secondsToHuman(seconds);
}

function renderPersonalMonthCard(
  summary: NonNullable<WorklogHistoryResponse["summaries"]>["thisMonth"] | NonNullable<WorklogHistoryResponse["summaries"]>["previousMonth"],
  jiraBaseUrl: string
) {
  return (
    <details className="timelog-month-summary-card" key={summary.label}>
      <summary className="timelog-month-summary-head">
        <span className="timelog-month-summary-top">
          <span className="timelog-month-summary-label">{summary.label}</span>
          <span className="timelog-month-summary-range">{formatPeriodRange(summary.from, summary.to)}</span>
        </span>
        <span className="timelog-month-summary-main">
          <strong className="timelog-month-summary-hours">{secondsToHuman(summary.totalLoggedSeconds)}</strong>
        </span>
        <span className="timelog-admin-toggle">
          {summary.tasks.length} task{summary.tasks.length === 1 ? "" : "s"}
        </span>
      </summary>
      <div className="timelog-month-task-list">
        {summary.tasks.length === 0 ? (
          <div className="timelog-month-task-empty">No tasks worked in this period.</div>
        ) : (
          <>
            <div className="timelog-month-task-head">
              <span>Task</span>
              <span>Project</span>
              <span>Logged</span>
              <span>Last worked</span>
            </div>
            {summary.tasks.map((task) => (
              <div key={task.issueKey} className="timelog-month-task-row">
                <span className="timelog-month-task-name">
                  <a
                    className="ticket-link"
                    href={jiraBaseUrl ? `${jiraBaseUrl}/browse/${task.issueKey}` : "#"}
                    target={jiraBaseUrl ? "_blank" : undefined}
                    rel={jiraBaseUrl ? "noreferrer" : undefined}
                  >
                    {task.issueSummary}
                  </a>
                  <span className="task-key">{task.issueKey}</span>
                </span>
                <span className="timelog-month-task-project">{task.projectKey}</span>
                <span className="timelog-month-task-logged">{secondsToHuman(task.totalLoggedSeconds)}</span>
                <span className="timelog-month-task-date">{formatShortDate(task.lastWorkedAt.slice(0, 10))}</span>
              </div>
            ))}
          </>
        )}
      </div>
    </details>
  );
}

function adminDayDotClass(day: AdminTimeLogOverview["users"][number]["days"][number]): string {
  if (day.isWeekend) return "weekend";
  if (day.isUpcoming) return "upcoming";
  if (day.loggedSeconds === 0) return "missing";
  if (day.loggedSeconds === 8 * 3600) return "target";
  if (day.loggedSeconds < 8 * 3600) return "under";
  return "over";
}

function adminDayTooltip(day: AdminTimeLogOverview["users"][number]["days"][number]): string {
  const label = `${dayOfWeekShort(day.date)} ${formatShortDate(day.date)}`;
  if (day.isWeekend) return `${label} · Weekly off`;
  if (day.isUpcoming) return `${label} · Upcoming`;
  if (day.loggedSeconds === 0) return `${label} · No logs`;
  if (day.loggedSeconds === 8 * 3600) return `${label} · 8h logged`;
  if (day.loggedSeconds < 8 * 3600) return `${label} · ${day.loggedHours}h logged (less than 8h)`;
  return `${label} · ${day.loggedHours}h logged (more than 8h)`;
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

function extractDownloadFilename(header: string | null): string {
  if (!header) return `team-time-logging-report.xlsx`;
  const match = /filename="([^"]+)"/.exec(header);
  return match?.[1] ?? "team-time-logging-report.xlsx";
}

function renderProductClientGroups(
  groups: ProductClientGroup[],
  jiraBaseUrl?: string
) {
  if (groups.length === 0) {
    return <div className="timelog-admin-empty">No worklogs in this period.</div>;
  }

  return (
    <div className="timelog-pc-groups">
      {groups.map((group) => (
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
  );
}

function WeekCard({
  week,
  accountId,
  jiraBaseUrl,
  weekLoading,
  weekData,
  onLoad,
}: {
  week: AdminTimeLogWeek;
  accountId: string;
  jiraBaseUrl?: string;
  weekLoading: Record<string, boolean>;
  weekData: Record<string, { totalLoggedSeconds: number; productClientGroups: ProductClientGroup[] }>;
  onLoad: (accountId: string, weekKey: string, from: string, to: string, endTimestamp?: string) => void;
}) {
  const key = `${accountId}:${week.key}`;
  const lazy = !week.loaded;
  const isLoading = lazy && Boolean(weekLoading[key]);
  const loaded = weekData[key];
  const groups = lazy ? (loaded?.productClientGroups ?? []) : week.productClientGroups;
  const totalSeconds = lazy ? (loaded?.totalLoggedSeconds ?? 0) : week.totalLoggedSeconds;

  return (
    <details
      key={week.key}
      className="timelog-week-card"
      open={week.key === "this-week"}
      onToggle={(e) => {
        if ((e.currentTarget as HTMLDetailsElement).open && lazy && !loaded && !weekLoading[key]) {
          onLoad(accountId, week.key, week.from, week.to, week.toTimestamp);
        }
      }}
    >
      <summary className="timelog-week-summary">
        <span className="timelog-week-label-wrap">
          <span className="timelog-week-label">{week.label}</span>
          <span className="timelog-week-range">{formatWeekRange(week.from, week.to)}</span>
        </span>
        <span className="timelog-week-hours">
          {lazy && !loaded ? (isLoading ? "Loading…" : "—") : periodHoursLabel(week, totalSeconds)}
        </span>
        <span className="timelog-admin-toggle">View logs</span>
      </summary>
      <div className="timelog-week-body">
        {isLoading ? (
          <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
            {[0, 1, 2].map((i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div className="sk" style={{ width: 140, height: 12 }} />
                <div className="sk" style={{ width: 50, height: 12 }} />
              </div>
            ))}
          </div>
        ) : (
          renderProductClientGroups(groups, jiraBaseUrl)
        )}
      </div>
    </details>
  );
}

function renderWeekGroups(
  weeks: AdminTimeLogWeek[],
  accountId: string,
  jiraBaseUrl: string | undefined,
  weekLoading: Record<string, boolean>,
  weekData: Record<string, { totalLoggedSeconds: number; productClientGroups: ProductClientGroup[] }>,
  onLoad: (accountId: string, weekKey: string, from: string, to: string, endTimestamp?: string) => void
) {
  return (
    <div className="timelog-week-groups">
      {weeks.map((week) => (
        <WeekCard
          key={week.key}
          week={week}
          accountId={accountId}
          jiraBaseUrl={jiraBaseUrl}
          weekLoading={weekLoading}
          weekData={weekData}
          onLoad={onLoad}
        />
      ))}
    </div>
  );
}

export function TimeLogShell({ user, view }: { user: SessionUser; view: "team" | "my" }) {
  const router = useRouter();
  const showTeamView = user.role === "admin" && view === "team";
  const showMyView = user.role !== "admin" || view === "my";
  const [timeLoggingMenuOpen, setTimeLoggingMenuOpen] = useState(user.role === "admin");
  const [teamSummaryFrom, setTeamSummaryFrom] = useState(startOfCurrentMonthIST);
  const [teamSummaryTo, setTeamSummaryTo] = useState(todayIST);
  const [teamSummaryDraftFrom, setTeamSummaryDraftFrom] = useState(startOfCurrentMonthIST);
  const [teamSummaryDraftTo, setTeamSummaryDraftTo] = useState(todayIST);

  // Form state
  const [issueQuery, setIssueQuery] = useState("");
  const [issueResults, setIssueResults] = useState<JiraIssueOption[]>([]);
  const [issueLoading, setIssueLoading] = useState(false);
  const [selectedIssue, setSelectedIssue] = useState<JiraIssueOption | null>(null);
  const [visibleTaskCount, setVisibleTaskCount] = useState(10);
  const [issueRefreshVersion, setIssueRefreshVersion] = useState(0);
  const [timeHours, setTimeHours] = useState(0);
  const [timeMinutes, setTimeMinutes] = useState(0);
  const [timeError, setTimeError] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [submitSuccess, setSubmitSuccess] = useState(false);

  // History state
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historySummaries, setHistorySummaries] = useState<WorklogHistoryResponse["summaries"] | null>(null);
  const [adminOverview, setAdminOverview] = useState<AdminTimeLogOverview | null>(null);
  const [adminOverviewLoading, setAdminOverviewLoading] = useState(user.role === "admin");
  const [teamSummary, setTeamSummary] = useState<AdminTeamTimeLogSummary | null>(null);
  const [teamSummaryLoading, setTeamSummaryLoading] = useState(user.role === "admin");
  const [teamSummaryError, setTeamSummaryError] = useState("");
  const [reportDownloading, setReportDownloading] = useState(false);
  const [reportError, setReportError] = useState("");

  const [weekLoading, setWeekLoading] = useState<Record<string, boolean>>({});
  const [weekData, setWeekData] = useState<Record<string, { totalLoggedSeconds: number; productClientGroups: ProductClientGroup[] }>>({});

  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const issueSearchAbortRef = useRef<AbortController | null>(null);

  const loadHistory = useCallback(() => {
    setHistoryLoading(true);
    fetch(`/api/timelog/history`)
      .then((r) => r.json())
      .then((data: WorklogHistoryResponse) => {
        setHistoryTotal(data.total ?? 0);
        setHistorySummaries(data.summaries ?? null);
      })
      .catch(() => {
        setHistoryTotal(0);
        setHistorySummaries(null);
      })
      .finally(() => setHistoryLoading(false));
  }, []);

  useEffect(() => {
    if (!showMyView) return;
    loadHistory();
  }, [loadHistory, showMyView]);

  const loadTeamSummary = useCallback((from: string, to: string) => {
    if (user.role !== "admin") return;
    setTeamSummaryLoading(true);
    setTeamSummaryError("");

    const params = new URLSearchParams({ from, to });
    fetch(`/api/timelog/admin-summary?${params.toString()}`)
      .then(async (r) => {
        const data = await r.json().catch(() => ({}));
        if (!r.ok) {
          throw new Error((data as { error?: string }).error ?? "Failed to load team summary.");
        }
        return data as AdminTeamTimeLogSummary;
      })
      .then((data) => setTeamSummary(data))
      .catch((error) => {
        setTeamSummary(null);
        setTeamSummaryError(error instanceof Error ? error.message : "Failed to load team summary.");
      })
      .finally(() => setTeamSummaryLoading(false));
  }, [user.role]);

  useEffect(() => {
    if (!showTeamView) return;
    loadTeamSummary(teamSummaryFrom, teamSummaryTo);
  }, [loadTeamSummary, showTeamView, teamSummaryFrom, teamSummaryTo]);

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

  function applyTeamSummaryRange() {
    if (teamSummaryDraftFrom > teamSummaryDraftTo) {
      setTeamSummaryError("Start date cannot be after end date.");
      return;
    }

    setTeamSummaryFrom(teamSummaryDraftFrom);
    setTeamSummaryTo(teamSummaryDraftTo);
  }

  const loadWeekData = useCallback((accountId: string, weekKey: string, from: string, to: string, endTimestamp?: string) => {
    const key = `${accountId}:${weekKey}`;
    setWeekLoading((prev) => ({ ...prev, [key]: true }));
    const params = new URLSearchParams({ accountId, from, to });
    if (endTimestamp) params.set("endTimestamp", endTimestamp);

    fetch(`/api/timelog/admin-week?${params.toString()}`)
      .then((r) => r.json())
      .then((data) => {
        if (data && typeof data.totalLoggedSeconds === "number") {
          setWeekData((prev) => ({ ...prev, [key]: data }));
        }
      })
      .finally(() => setWeekLoading((prev) => ({ ...prev, [key]: false })));
  }, []);

  // Debounced issue search
  useEffect(() => {
    if (!showMyView) {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
      issueSearchAbortRef.current?.abort();
      setIssueResults([]);
      setIssueLoading(false);
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
  }, [issueQuery, issueRefreshVersion, showMyView]);

  useEffect(() => {
    setVisibleTaskCount(10);
  }, [issueQuery]);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }

  async function handleDownloadAdminReport() {
    if (reportDownloading) return;
    setReportError("");
    setReportDownloading(true);

    try {
      const res = await fetch("/api/timelog/admin-report");
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(data.error ?? "Failed to generate report.");
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = extractDownloadFilename(res.headers.get("content-disposition"));
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      setReportError(error instanceof Error ? error.message : "Failed to generate report.");
    } finally {
      setReportDownloading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError("");
    setSubmitSuccess(false);

    const seconds = timeHours * 3600 + timeMinutes * 60;
    if (seconds <= 0) {
      setTimeError("Enter at least 1 minute");
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
        setTimeHours(0);
        setTimeMinutes(0);
        setDescription("");
        setIssueRefreshVersion((current) => current + 1);
        loadHistory();
        loadAdminOverview();
      }
    } catch {
      setSubmitError("Failed to log time. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const canSubmit = Boolean(selectedIssue && (timeHours > 0 || timeMinutes > 0) && !submitting);
  const visibleTasks = issueResults.slice(0, visibleTaskCount);
  const jiraBaseUrl = process.env.NEXT_PUBLIC_JIRA_BASE_URL ?? "";

  return (
    <div className="dashboard-screen">
      <header className="topbar">
        <div className="topbar-brand">
          <AnacityLogo variant="header" />
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
          {user.role === "admin" ? (
            <>
              <button
                type="button"
                className="home-nav-item home-nav-parent active"
                aria-expanded={timeLoggingMenuOpen}
                onClick={() => setTimeLoggingMenuOpen((current) => !current)}
              >
                <span className="home-nav-parent-main">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                  </svg>
                  Time Logging
                </span>
                <span className={`home-nav-caret ${timeLoggingMenuOpen ? "open" : ""}`} aria-hidden="true">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </span>
              </button>
              {timeLoggingMenuOpen && (
                <>
                  <Link
                    href="/time-logging?view=team"
                    className={`home-nav-item home-nav-subitem ${view === "team" ? "active" : ""}`}
                  >
                    Team Time Logging
                  </Link>
                  <Link
                    href="/time-logging?view=my"
                    className={`home-nav-item home-nav-subitem ${view === "my" ? "active" : ""}`}
                  >
                    My Time Logging
                  </Link>
                </>
              )}
            </>
          ) : (
            <Link href="/time-logging" className="home-nav-item active">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
              Time Logging
            </Link>
          )}
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
            {showTeamView && (
              <div className="timelog-admin-section">
                <div className="section-row" style={{ marginBottom: 12 }}>
                  <div>
                    <div className="section-label">Team Time Logging</div>
                    <p className="timelog-admin-sub">
                      This week logging activity · 40h weekly target (Mon–Fri)
                    </p>
                    <div className="timelog-admin-legend" aria-label="Logging status legend">
                      <span className="timelog-admin-legend-item"><span className="timelog-day-dot target" />8h logged</span>
                      <span className="timelog-admin-legend-item"><span className="timelog-day-dot under" />Less than 8h</span>
                      <span className="timelog-admin-legend-item"><span className="timelog-day-dot over" />More than 8h</span>
                      <span className="timelog-admin-legend-item"><span className="timelog-day-dot missing" />No logs</span>
                    </div>
                  </div>
                  <div className="timelog-admin-actions">
                    {!adminOverviewLoading && adminOverview && (
                      <span className="section-status success">{adminOverview.users.length} users</span>
                    )}
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={handleDownloadAdminReport}
                      disabled={reportDownloading}
                    >
                      {reportDownloading ? "Preparing report…" : "Download XLSX Report"}
                    </button>
                  </div>
                </div>
                {reportError && <span className="timelog-error-msg">{reportError}</span>}

                <div className="timelog-team-summary-section">
                  <div className="section-row" style={{ marginBottom: 12 }}>
                    <div>
                      <div className="section-label">Team Summary</div>
                      <p className="timelog-admin-sub">
                        Separate custom range summary for users, logged time, and expected time.
                      </p>
                    </div>
                  </div>

                  <div className="timelog-team-summary-toolbar">
                    <div className="field-group">
                      <label className="field-label" htmlFor="team-summary-from">From</label>
                      <input
                        id="team-summary-from"
                        type="date"
                        className="field-control"
                        value={teamSummaryDraftFrom}
                        onChange={(e) => setTeamSummaryDraftFrom(e.target.value)}
                      />
                    </div>
                    <div className="field-group">
                      <label className="field-label" htmlFor="team-summary-to">To</label>
                      <input
                        id="team-summary-to"
                        type="date"
                        className="field-control"
                        value={teamSummaryDraftTo}
                        max={todayIST()}
                        onChange={(e) => setTeamSummaryDraftTo(e.target.value)}
                      />
                    </div>
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={applyTeamSummaryRange}
                      disabled={teamSummaryLoading}
                    >
                      {teamSummaryLoading ? "Applying…" : "Apply range"}
                    </button>
                  </div>

                  {teamSummaryError && <span className="timelog-error-msg">{teamSummaryError}</span>}

                  <div className="summary-strip timelog-team-summary-grid">
                    <div className="summary-card">
                      <span className="summary-card-label">Total Users</span>
                      <span className="summary-card-value">
                        {teamSummaryLoading && !teamSummary ? "…" : (teamSummary?.totalUsers ?? "—")}
                      </span>
                    </div>
                    <div className="summary-card">
                      <span className="summary-card-label">Total Time Logged</span>
                      <span className="summary-card-value">
                        {teamSummaryLoading && !teamSummary ? "…" : (teamSummary ? secondsToHuman(teamSummary.totalLoggedSeconds) : "—")}
                      </span>
                    </div>
                    <div className="summary-card last">
                      <span className="summary-card-label">Total Expected Time Logged</span>
                      <span className="summary-card-value">
                        {teamSummaryLoading && !teamSummary ? "…" : (teamSummary ? secondsToHuman(teamSummary.totalExpectedSeconds) : "—")}
                      </span>
                    </div>
                  </div>
                </div>

                {adminOverviewLoading ? (
                  <div className="timelog-admin-list">
                    {[0, 1, 2, 3].map((i) => (
                      <div key={i} className="timelog-admin-card" style={{ pointerEvents: "none", opacity: 0.7 }}>
                        <div className="timelog-admin-summary member-summary timelog-admin-tab-row" style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px" }}>
                          <div className="sk sk-round" style={{ width: 36, height: 36, flexShrink: 0 }} />
                          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
                            <div className="sk" style={{ width: 140, height: 13 }} />
                            <div className="sk" style={{ width: 70, height: 11 }} />
                          </div>
                          <div className="sk" style={{ width: 88, height: 30, borderRadius: 6 }} />
                          <div style={{ display: "flex", gap: 5 }}>
                            {[0, 1, 2, 3, 4].map((d) => (
                              <div key={d} className="sk sk-round" style={{ width: 18, height: 18 }} />
                            ))}
                          </div>
                          <div className="sk" style={{ width: 60, height: 11, borderRadius: 4 }} />
                        </div>
                      </div>
                    ))}
                  </div>
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
                              <span className="member-subtitle">This week</span>
                            </span>

                            <span className="timelog-weekly-stack">
                              <span className="timelog-weekly-chip">
                                <span className="timelog-weekly-hours">{weeklyHoursLabel(member.weeklyLoggedSeconds)}</span>
                              </span>
                              <span className="timelog-weekly-label">Current week</span>
                            </span>

                            <span className="timelog-admin-overs" aria-label="This week logging status">
                              {member.days.map((day) => (
                                <span
                                  key={day.date}
                                  className={`timelog-day-dot ${adminDayDotClass(day)}`}
                                  data-tooltip={adminDayTooltip(day)}
                                />
                              ))}
                            </span>

                            <span className="timelog-admin-toggle">View logs</span>
                          </summary>
                          <div className="timelog-admin-detail">
                            {renderWeekGroups(member.weeklyGroups, member.accountId, jiraBaseUrl, weekLoading, weekData, loadWeekData)}
                          </div>
                        </details>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {showMyView && (
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
                      <div className="timelog-task-grid">
                        {[0, 1, 2, 3, 4, 5].map((i) => (
                          <div key={i} className="timelog-task-card" style={{ pointerEvents: "none", opacity: 0.7 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                              <div className="sk" style={{ width: 90, height: 11 }} />
                              <div className="sk" style={{ width: 48, height: 18, borderRadius: 4 }} />
                            </div>
                            <div className="sk" style={{ width: "90%", height: 13, marginBottom: 6 }} />
                            <div className="sk" style={{ width: 55, height: 11, marginBottom: 12 }} />
                            <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                              <div className="sk" style={{ width: 72, height: 36, borderRadius: 6 }} />
                              <div className="sk" style={{ width: 72, height: 36, borderRadius: 6 }} />
                            </div>
                            <div className="sk" style={{ width: 80, height: 11, marginBottom: 12 }} />
                            <div className="sk" style={{ width: "100%", height: 32, borderRadius: 6 }} />
                          </div>
                        ))}
                      </div>
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
                                  setTimeHours(0);
                                  setTimeMinutes(0);
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
                          <label className="field-label">Time Spent</label>
                          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                              <input
                                id="tl-time-hours"
                                type="number"
                                min={0}
                                max={23}
                                className={`field-control ${timeError ? "field-control-error" : ""}`}
                                style={{ width: 72, textAlign: "center" }}
                                value={timeHours === 0 ? "" : timeHours}
                                placeholder="0"
                                onChange={(e) => { setTimeHours(Math.max(0, Math.min(23, parseInt(e.target.value) || 0))); setTimeError(""); }}
                              />
                              <span style={{ fontSize: 13, color: "var(--muted-mid)", flexShrink: 0 }}>hrs</span>
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                              <input
                                id="tl-time-minutes"
                                type="number"
                                min={0}
                                max={59}
                                className={`field-control ${timeError ? "field-control-error" : ""}`}
                                style={{ width: 72, textAlign: "center" }}
                                value={timeMinutes === 0 ? "" : timeMinutes}
                                placeholder="0"
                                onChange={(e) => { setTimeMinutes(Math.max(0, Math.min(59, parseInt(e.target.value) || 0))); setTimeError(""); }}
                              />
                              <span style={{ fontSize: 13, color: "var(--muted-mid)", flexShrink: 0 }}>min</span>
                            </div>
                          </div>
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
                            setTimeHours(0);
                            setTimeMinutes(0);
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
                    {historyTotal} entries in last 90 days
                  </span>
                )}
              </div>

              <div className="timelog-month-summary-grid">
                {historyLoading ? (
                  <>
                    {[0, 1].map((i) => (
                      <div key={i} className="timelog-month-summary-card" style={{ pointerEvents: "none", opacity: 0.7 }}>
                        <div className="sk" style={{ width: 110, height: 12, marginBottom: 8 }} />
                        <div className="sk" style={{ width: 82, height: 24, marginBottom: 10, borderRadius: 6 }} />
                        <div className="sk" style={{ width: 130, height: 11 }} />
                      </div>
                    ))}
                  </>
                ) : (
                  <>
                    {historySummaries
                      ? [
                          renderPersonalMonthCard(historySummaries.thisMonth, jiraBaseUrl),
                          renderPersonalMonthCard(historySummaries.previousMonth, jiraBaseUrl),
                        ]
                      : null}
                  </>
                )}
              </div>

              {!historyLoading && !historySummaries && (
                <div className="empty-state">Unable to load logged work right now.</div>
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
