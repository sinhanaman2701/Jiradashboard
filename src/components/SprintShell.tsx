"use client";

import { type CSSProperties, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Sprint, SprintBoard, SprintIssue, SprintProject, SprintResult } from "@/lib/jira/sprint-types";
import { parseTimeToSeconds } from "@/lib/time-parser";

function formatHours(h: number): string {
  return `${h.toFixed(2)}h`;
}

const STATUS_PROGRESSION = [
  "not started",
  "development",
  "product review",
  "product review changes",
  "code review",
  "code review fixes",
  "qa level i",
  "qa fixes",
  "qa level ii",
  "ready for release",
  "done",
];

function progressionIndex(name: string): number {
  return STATUS_PROGRESSION.indexOf(name.toLowerCase());
}

function isGoalAchieved(statusName: string | undefined, sprintGoal: string): boolean {
  if (!statusName || !sprintGoal) return false;
  const statusIdx = progressionIndex(statusName);
  const goalIdx = progressionIndex(sprintGoal);
  if (statusIdx === -1 || goalIdx === -1) return false;
  return statusIdx >= goalIdx;
}

function StatusPill({ status }: { status?: string }) {
  if (!status) return <span className="sprint-status-pill sprint-status-empty">—</span>;
  const lower = status.toLowerCase();
  const variant =
    lower === "done" || lower === "closed" || lower === "resolved" ? "done"
    : lower.includes("progress") ? "inprogress"
    : lower.includes("review") ? "review"
    : "todo";
  return <span className={`sprint-status-pill sprint-status-${variant}`}>{status}</span>;
}

function VarianceCell({
  eta,
  previousLoggedSeconds,
  sprintLoggedSeconds,
}: {
  eta: string;
  previousLoggedSeconds: number;
  sprintLoggedSeconds: number;
}) {
  if (!eta) return <span className="sprint-variance-na">No ETA</span>;
  const etaSeconds = parseTimeToSeconds(eta);
  if (!etaSeconds) return <span className="sprint-variance-na">No ETA</span>;
  const diff = etaSeconds - (previousLoggedSeconds + sprintLoggedSeconds);
  if (diff === 0) return <span className="sprint-variance-zero">on target</span>;
  const h = (Math.abs(diff) / 3600).toFixed(2);
  return <span className={diff < 0 ? "sprint-variance-over" : "sprint-variance-under"}>
    {diff > 0 ? `+${h}h` : `-${h}h`}
  </span>;
}

function SprintStateBadge({ state }: { state: Sprint["state"] }) {
  return (
    <span className={`sprint-state-badge sprint-state-${state}`}>
      {state}
    </span>
  );
}

function SprintDateRange({ startDate, endDate }: { startDate?: string; endDate?: string }) {
  if (!startDate && !endDate) return null;
  const fmt = (d: string) =>
    new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(d));
  return (
    <span className="sprint-date-range">
      {startDate ? fmt(startDate) : "?"} → {endDate ? fmt(endDate) : "ongoing"}
    </span>
  );
}

type TooltipPlacement = "above" | "below";

function UserTooltip({
  breakdown,
  placement = "above",
  style,
}: {
  breakdown: SprintIssue["userBreakdown"];
  placement?: TooltipPlacement;
  style?: CSSProperties;
}) {
  const className = `sprint-tooltip sprint-tooltip--${placement}`;
  if (breakdown.length === 0) {
    return (
      <div className={className} style={style}>
        <span className="sprint-tooltip-empty">No logs</span>
      </div>
    );
  }
  return (
    <div className={className} style={style}>
      {breakdown.map((u) => (
        <div key={u.accountId} className="sprint-tooltip-row">
          <span>{u.displayName}</span>
          <span>{formatHours(u.loggedHours)}</span>
        </div>
      ))}
    </div>
  );
}

function FloatingUserTooltip({
  tooltip,
}: {
  tooltip: {
    x: number;
    y: number;
    placement: TooltipPlacement;
    breakdown: SprintIssue["userBreakdown"];
  } | null;
}) {
  if (!tooltip || typeof document === "undefined") return null;
  return createPortal(
    <UserTooltip
      breakdown={tooltip.breakdown}
      placement={tooltip.placement}
      style={{ left: tooltip.x, top: tooltip.y }}
    />,
    document.body
  );
}

type SprintIssueAggregate = {
  etaSeconds: number;
  previousLoggedSeconds: number;
  previousLoggedHours: number;
  sprintLoggedSeconds: number;
  sprintLoggedHours: number;
  previousUserBreakdown: SprintIssue["previousUserBreakdown"];
  userBreakdown: SprintIssue["userBreakdown"];
};

type SprintIssueRow =
  | { kind: "issue"; issue: SprintIssue }
  | { kind: "story"; issue: SprintIssue; children: SprintIssue[]; aggregate: SprintIssueAggregate };

function isStoryIssue(issue: SprintIssue): boolean {
  return (issue.issueTypeName ?? "").toLowerCase() === "story";
}

function IssueTypeBadge({ issueTypeName }: { issueTypeName?: string }) {
  const label = issueTypeName || "Task";
  const normalized = label.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return (
    <span className={`sprint-issue-type-badge sprint-issue-type-badge--${normalized}`}>
      {label}
    </span>
  );
}

function combineBreakdowns(
  issues: SprintIssue[],
  key: "previousUserBreakdown" | "userBreakdown"
): SprintIssue["userBreakdown"] {
  const map = new Map<string, { displayName: string; seconds: number }>();
  for (const issue of issues) {
    for (const entry of issue[key]) {
      const current = map.get(entry.accountId);
      if (current) {
        current.seconds += entry.loggedSeconds;
      } else {
        map.set(entry.accountId, {
          displayName: entry.displayName,
          seconds: entry.loggedSeconds,
        });
      }
    }
  }
  return Array.from(map.entries())
    .map(([accountId, { displayName, seconds }]) => ({
      accountId,
      displayName,
      loggedSeconds: seconds,
      loggedHours: Math.round((seconds / 3600) * 100) / 100,
    }))
    .sort((a, b) => b.loggedSeconds - a.loggedSeconds);
}

function aggregateChildIssues(children: SprintIssue[]): SprintIssueAggregate {
  const etaSeconds = children.reduce((sum, child) => sum + (parseTimeToSeconds(child.eta) ?? 0), 0);
  const previousLoggedSeconds = children.reduce((sum, child) => sum + child.previousLoggedSeconds, 0);
  const sprintLoggedSeconds = children.reduce((sum, child) => sum + child.sprintLoggedSeconds, 0);
  return {
    etaSeconds,
    previousLoggedSeconds,
    previousLoggedHours: Math.round((previousLoggedSeconds / 3600) * 100) / 100,
    sprintLoggedSeconds,
    sprintLoggedHours: Math.round((sprintLoggedSeconds / 3600) * 100) / 100,
    previousUserBreakdown: combineBreakdowns(children, "previousUserBreakdown"),
    userBreakdown: combineBreakdowns(children, "userBreakdown"),
  };
}

function buildSprintRows(issues: SprintIssue[]): SprintIssueRow[] {
  const issueByKey = new Map(issues.map((issue) => [issue.key, issue]));
  const childrenByParent = new Map<string, SprintIssue[]>();

  for (const issue of issues) {
    if (!issue.parentKey) continue;
    const parent = issueByKey.get(issue.parentKey);
    if (!parent || !isStoryIssue(parent)) continue;
    const children = childrenByParent.get(issue.parentKey) ?? [];
    children.push(issue);
    childrenByParent.set(issue.parentKey, children);
  }

  const childKeys = new Set(
    Array.from(childrenByParent.values()).flat().map((issue) => issue.key)
  );

  return issues
    .filter((issue) => !childKeys.has(issue.key))
    .map((issue) => {
      const children = childrenByParent.get(issue.key) ?? [];
      if (isStoryIssue(issue) && children.length > 0) {
        return {
          kind: "story",
          issue,
          children,
          aggregate: aggregateChildIssues(children),
        };
      }
      return { kind: "issue", issue };
    });
}

function VarianceFromSeconds({
  etaSeconds,
  previousLoggedSeconds,
  sprintLoggedSeconds,
}: {
  etaSeconds: number;
  previousLoggedSeconds: number;
  sprintLoggedSeconds: number;
}) {
  if (!etaSeconds) return <span className="sprint-variance-na">No ETA</span>;
  const diff = etaSeconds - (previousLoggedSeconds + sprintLoggedSeconds);
  if (diff === 0) return <span className="sprint-variance-zero">on target</span>;
  const h = (Math.abs(diff) / 3600).toFixed(2);
  return <span className={diff < 0 ? "sprint-variance-over" : "sprint-variance-under"}>
    {diff > 0 ? `+${h}h` : `-${h}h`}
  </span>;
}

function SprintOverview({ issues }: { issues: SprintIssue[] }) {
  const goalsMet = issues.filter((i) => isGoalAchieved(i.statusName, i.sprintGoal)).length;
  const goalsSet = issues.filter((i) => i.sprintGoal).length;
  const totalLoggedSeconds = issues.reduce((sum, i) => sum + i.sprintLoggedSeconds, 0);
  const totalLoggedHours = (totalLoggedSeconds / 3600).toFixed(1);
  const unstarted = issues.filter((i) => i.sprintLoggedHours === 0).length;

  return (
    <div className="sprint-overview">
      <div className="sprint-overview-card">
        <span className="sprint-overview-value">{goalsMet} / {goalsSet || issues.length}</span>
        <span className="sprint-overview-label">Sprint Goals Met</span>
      </div>
      <div className="sprint-overview-card">
        <span className="sprint-overview-value">{totalLoggedHours}h</span>
        <span className="sprint-overview-label">Time Logged (Sprint)</span>
      </div>
      <div className={`sprint-overview-card ${unstarted > 0 ? "sprint-overview-card--warn" : ""}`}>
        <span className="sprint-overview-value">{unstarted}</span>
        <span className="sprint-overview-label">Unstarted Tasks</span>
      </div>
    </div>
  );
}

function MultiSelect({
  label,
  options,
  selected,
  onToggle,
  loading,
  renderOption
}: {
  label: string;
  options: { value: string; label: string; meta?: string }[];
  selected: Set<string>;
  onToggle: (value: string) => void;
  loading?: boolean;
  renderOption?: (opt: { value: string; label: string; meta?: string }) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const selectedCount = options.filter((opt) => selected.has(opt.value)).length;

  return (
    <div className="multi-select-wrap" ref={ref}>
      <button
        type="button"
        className="multi-select-trigger"
        onClick={() => setOpen((o) => !o)}
      >
        <span>
          {selectedCount === 0 ? label : `${selectedCount} selected`}
        </span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div className="multi-select-dropdown">
          {loading ? (
            <div className="multi-select-loading">Loading…</div>
          ) : options.length === 0 ? (
            <div className="multi-select-loading">No options</div>
          ) : (
            options.map((opt) => (
              <label key={opt.value} className="multi-select-option">
                <input
                  type="checkbox"
                  checked={selected.has(opt.value)}
                  onChange={() => onToggle(opt.value)}
                />
                {renderOption ? renderOption(opt) : (
                  <span className="multi-select-label">{opt.label}</span>
                )}
              </label>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export function SprintShell() {
  const [projects, setProjects] = useState<SprintProject[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(true);

  const [selectedProjectKeys, setSelectedProjectKeys] = useState<Set<string>>(new Set());

  const [sprintsMap, setSprintsMap] = useState<Record<string, Sprint[]>>({});
  const [sprintsLoading, setSprintsLoading] = useState<Record<string, boolean>>({});

  const [selectedSprintIds, setSelectedSprintIds] = useState<Set<string>>(new Set());
  const sprintById = useRef<Map<number, Sprint & { projectKey: string; projectName: string }>>(new Map());

  const [results, setResults] = useState<SprintResult[]>([]);
  const [applying, setApplying] = useState(false);

  const [tooltip, setTooltip] = useState<{
    x: number;
    y: number;
    placement: TooltipPlacement;
    breakdown: SprintIssue["userBreakdown"];
  } | null>(null);
  const [expandedStoryKeys, setExpandedStoryKeys] = useState<Set<string>>(new Set());

  function showTooltip(
    target: HTMLElement,
    breakdown: SprintIssue["userBreakdown"]
  ) {
    const rect = target.getBoundingClientRect();
    const placement: TooltipPlacement = rect.top > 150 ? "above" : "below";
    setTooltip({
    x: rect.left + rect.width / 2,
      y: placement === "above" ? rect.top : rect.bottom,
      placement,
      breakdown,
    });
  }

  function toggleStoryRow(storyKey: string) {
    setExpandedStoryKeys((prev) => {
      const next = new Set(prev);
      if (next.has(storyKey)) next.delete(storyKey);
      else next.add(storyKey);
      return next;
    });
  }

  useEffect(() => {
    fetch("/api/sprints/projects")
      .then((r) => readJsonArray<SprintProject>(r))
      .then((data: SprintProject[]) => {
        setProjects(data);
        setProjectsLoading(false);
      })
      .catch(() => setProjectsLoading(false));
  }, []);

  async function readJsonArray<T>(response: Response): Promise<T[]> {
    if (!response.ok) return [];
    const text = await response.text();
    if (!text) return [];
    try {
      const parsed = JSON.parse(text);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  async function loadSprintsForProject(projectKey: string) {
    if (sprintsMap[projectKey] !== undefined) return;
    setSprintsLoading((prev) => ({ ...prev, [projectKey]: true }));
    try {
      const boards: SprintBoard[] = await fetch(
        `/api/sprints/boards?projectKey=${encodeURIComponent(projectKey)}`
      ).then((r) => readJsonArray<SprintBoard>(r));

      const allSprintArrays: Sprint[][] = await Promise.all(
        boards.map((b) =>
          fetch(`/api/sprints/board/${b.id}/sprints`)
            .then((r) => readJsonArray<Sprint>(r))
            .then((sprints: Sprint[]) => sprints.map((s) => ({ ...s, boardId: b.id })))
        )
      );

      const seen = new Set<number>();
      const merged: Sprint[] = [];
      const project = projects.find((p) => p.key === projectKey);
      const projectName = project?.name ?? projectKey;

      for (const arr of allSprintArrays) {
        for (const s of arr) {
          if (!seen.has(s.id)) {
            seen.add(s.id);
            merged.push(s);
            sprintById.current.set(s.id, { ...s, projectKey, projectName });
          }
        }
      }

      merged.sort((a, b) => {
        const order = { active: 0, future: 1, closed: 2 };
        return (order[a.state] ?? 3) - (order[b.state] ?? 3);
      });

      setSprintsMap((prev) => ({ ...prev, [projectKey]: merged }));
    } finally {
      setSprintsLoading((prev) => ({ ...prev, [projectKey]: false }));
    }
  }

  function toggleProject(projectKey: string) {
    setSelectedProjectKeys((prev) => {
      const next = new Set(prev);
      if (next.has(projectKey)) {
        next.delete(projectKey);
        setSelectedSprintIds((ids) => {
          const nextIds = new Set(ids);
          for (const sprint of sprintsMap[projectKey] ?? []) {
            nextIds.delete(String(sprint.id));
          }
          return nextIds;
        });
      } else {
        next.add(projectKey);
        loadSprintsForProject(projectKey);
      }
      return next;
    });
  }

  function toggleSprint(sprintId: string) {
    setSelectedSprintIds((prev) => {
      const next = new Set(prev);
      if (next.has(sprintId)) next.delete(sprintId);
      else next.add(sprintId);
      return next;
    });
  }

  async function handleApply() {
    if (selectedSprintIds.size === 0) return;
    setApplying(true);
    setResults([]);

    const sprintEntries = Array.from(selectedSprintIds)
      .map((id) => sprintById.current.get(Number(id)))
      .filter(Boolean) as (Sprint & { projectKey: string; projectName: string })[];

    const fetched = await Promise.all(
      sprintEntries.map(async (sprint) => {
        const params = new URLSearchParams();
        if (sprint.startDate) params.set("startDate", sprint.startDate.slice(0, 10));
        if (sprint.endDate) params.set("endDate", sprint.endDate.slice(0, 10));
        const issues: SprintIssue[] = await fetch(
          `/api/sprints/sprint/${sprint.id}/issues?${params.toString()}`
        ).then((r) => readJsonArray<SprintIssue>(r));

        return {
          sprintId: sprint.id,
          sprintName: sprint.name,
          state: sprint.state,
          startDate: sprint.startDate,
          endDate: sprint.endDate,
          projectKey: sprint.projectKey,
          projectName: sprint.projectName,
          issues
        } satisfies SprintResult;
      })
    );

    const grouped = new Map<string, SprintResult[]>();
    for (const r of fetched) {
      const arr = grouped.get(r.projectKey) ?? [];
      arr.push(r);
      grouped.set(r.projectKey, arr);
    }

    setResults(fetched);
    setApplying(false);
  }

  const projectOptions = projects.map((p) => ({ value: p.key, label: p.name }));

  const groupedResults = new Map<string, SprintResult[]>();
  for (const r of results) {
    const arr = groupedResults.get(r.projectKey) ?? [];
    arr.push(r);
    groupedResults.set(r.projectKey, arr);
  }

  const canApply = selectedSprintIds.size > 0 && !applying;

  function renderIssueRow(issue: SprintIssue, result: SprintResult, options?: { child?: boolean }) {
    const cellKey = `${result.sprintId}-${issue.key}`;
    const noLogs = issue.sprintLoggedHours === 0;
    const rowClass = [
      "sprint-issue-row",
      options?.child ? "sprint-issue-row--child" : "",
      noLogs ? "sprint-issue-row--no-logs" : "",
    ].filter(Boolean).join(" ");

    return (
      <div key={issue.key} className={rowClass}>
        <div className="sprint-issue-name-cell">
          <a
            href={`${process.env.NEXT_PUBLIC_JIRA_BASE_URL}/browse/${issue.key}`}
            target="_blank"
            rel="noopener noreferrer"
            className="sprint-issue-link"
          >
            <div className="sprint-issue-summary">{issue.summary}</div>
            <div className="sprint-issue-meta-line">
              <IssueTypeBadge issueTypeName={issue.issueTypeName} />
              <span className="sprint-issue-key">{issue.key}</span>
            </div>
          </a>
        </div>

        <span className="sprint-goal-cell">
          {issue.sprintGoal ? (
            <>
              <span className={`sprint-goal-dot sprint-goal-dot--${isGoalAchieved(issue.statusName, issue.sprintGoal) ? "achieved" : "pending"}`} />
              {issue.sprintGoal}
            </>
          ) : "No sprint goal"}
        </span>

        <span className="sprint-eta-cell">{issue.eta || "No ETA"}</span>

        <div
          className="sprint-time-cell-wrap"
          onMouseEnter={(event) => showTooltip(event.currentTarget, issue.previousUserBreakdown)}
          onMouseLeave={() => setTooltip(null)}
        >
          <span className="sprint-time-logged">
            {formatHours(issue.previousLoggedHours)}
          </span>
        </div>

        <div
          className="sprint-time-cell-wrap"
          onMouseEnter={(event) => {
            if (!noLogs) showTooltip(event.currentTarget, issue.userBreakdown);
          }}
          onMouseLeave={() => setTooltip(null)}
        >
          <span className={`sprint-time-logged${noLogs ? " sprint-time-logged--empty" : ""}`}>
            {noLogs ? "No logs" : formatHours(issue.sprintLoggedHours)}
          </span>
        </div>

        <VarianceCell
          eta={issue.eta}
          previousLoggedSeconds={issue.previousLoggedSeconds}
          sprintLoggedSeconds={issue.sprintLoggedSeconds}
        />

        <div className="sprint-status-cell">
          <StatusPill status={issue.statusName} />
        </div>
      </div>
    );
  }

  function renderStoryRow(row: Extract<SprintIssueRow, { kind: "story" }>, result: SprintResult) {
    const storyKey = `${result.sprintId}-${row.issue.key}`;
    const expanded = expandedStoryKeys.has(storyKey);
    const achieved = row.children.filter((child) => isGoalAchieved(child.statusName, child.sprintGoal)).length;
    const noLogs = row.aggregate.sprintLoggedHours === 0;
    const rowClass = [
      "sprint-issue-row",
      "sprint-issue-row--story",
      noLogs ? "sprint-issue-row--no-logs" : "",
    ].filter(Boolean).join(" ");

    return (
      <div key={row.issue.key} className={rowClass}>
        <div className="sprint-issue-name-cell">
          <div className="sprint-story-title-row">
            <div className="sprint-story-title-main">
              <a
                href={`${process.env.NEXT_PUBLIC_JIRA_BASE_URL}/browse/${row.issue.key}`}
                target="_blank"
                rel="noopener noreferrer"
                className="sprint-issue-link sprint-story-link"
              >
                <span className="sprint-issue-summary">{row.issue.summary}</span>
                <span className="sprint-issue-meta-line">
                  <IssueTypeBadge issueTypeName={row.issue.issueTypeName} />
                  <span className="sprint-issue-key">{row.issue.key}</span>
                </span>
              </a>
            </div>
            <button
              type="button"
              className="sprint-story-toggle"
              onClick={() => toggleStoryRow(storyKey)}
              aria-expanded={expanded}
            >
              <span className={`sprint-story-chevron ${expanded ? "sprint-story-chevron--open" : ""}`}>▾</span>
              {expanded ? "Hide tasks" : `View ${row.children.length} tasks`}
            </button>
          </div>
        </div>

        <span className="sprint-goal-cell sprint-goal-cell--story">
          {achieved}/{row.children.length} sprint goal achieved
        </span>

        <span className="sprint-eta-cell">
          {row.aggregate.etaSeconds ? formatHours(row.aggregate.etaSeconds / 3600) : "No ETA"}
        </span>

        <div
          className="sprint-time-cell-wrap"
          onMouseEnter={(event) => showTooltip(event.currentTarget, row.aggregate.previousUserBreakdown)}
          onMouseLeave={() => setTooltip(null)}
        >
          <span className="sprint-time-logged">
            {formatHours(row.aggregate.previousLoggedHours)}
          </span>
        </div>

        <div
          className="sprint-time-cell-wrap"
          onMouseEnter={(event) => {
            if (!noLogs) showTooltip(event.currentTarget, row.aggregate.userBreakdown);
          }}
          onMouseLeave={() => setTooltip(null)}
        >
          <span className={`sprint-time-logged${noLogs ? " sprint-time-logged--empty" : ""}`}>
            {noLogs ? "No logs" : formatHours(row.aggregate.sprintLoggedHours)}
          </span>
        </div>

        <VarianceFromSeconds
          etaSeconds={row.aggregate.etaSeconds}
          previousLoggedSeconds={row.aggregate.previousLoggedSeconds}
          sprintLoggedSeconds={row.aggregate.sprintLoggedSeconds}
        />

        <div className="sprint-status-cell">
          <StatusPill status={row.issue.statusName} />
        </div>
      </div>
    );
  }

  return (
    <div className="sprint-shell">
      <div className="sprint-filter-bar">
        <div className="field-group">
          <label className="field-label">Spaces</label>
          <MultiSelect
            label="Select spaces"
            options={projectOptions}
            selected={selectedProjectKeys}
            onToggle={toggleProject}
            loading={projectsLoading}
          />
        </div>

        {Array.from(selectedProjectKeys).map((projectKey) => {
          const project = projects.find((p) => p.key === projectKey);
          const sprints = sprintsMap[projectKey] ?? [];
          const loading = sprintsLoading[projectKey] ?? false;
          const sprintOptions = sprints.map((s) => ({
            value: String(s.id),
            label: s.name,
            meta: s.state
          }));

          return (
            <div key={projectKey} className="field-group">
              <label className="field-label">{project?.name ?? projectKey}</label>
              <MultiSelect
                label="Select sprints"
                options={sprintOptions}
                selected={selectedSprintIds}
                onToggle={toggleSprint}
                loading={loading}
                renderOption={(opt) => (
                  <span className="multi-select-label">
                    {opt.label}
                    {opt.meta && (
                      <span className={`sprint-state-dot sprint-state-dot-${opt.meta}`} />
                    )}
                  </span>
                )}
              />
            </div>
          );
        })}

        <div className="field-group sprint-apply-group">
          <label className="field-label">&nbsp;</label>
          <button
            type="button"
            className="apply-button"
            disabled={!canApply}
            onClick={handleApply}
          >
            {applying ? "Loading…" : "Apply"}
          </button>
        </div>
      </div>

      {results.length === 0 && !applying && (
        <div className="sprint-empty-state">
          {selectedSprintIds.size === 0
            ? "Select spaces and sprints above, then click Apply."
            : "Click Apply to load sprint data."}
        </div>
      )}

      {Array.from(groupedResults.entries()).map(([projectKey, sprintResults]) => (
        <div key={projectKey} className="sprint-space-section">
          <div className="sprint-space-header">
            <div className="sprint-space-dot" />
            <span className="sprint-space-name">{sprintResults[0]?.projectName ?? projectKey}</span>
            <span className="sprint-space-key">{projectKey}</span>
          </div>

          {sprintResults.map((result) => (
            <div key={result.sprintId} className="sprint-card">
              <div className="sprint-card-header">
                <div className="sprint-card-meta">
                  <span className="sprint-card-name">{result.sprintName}</span>
                  <SprintStateBadge state={result.state} />
                  <SprintDateRange startDate={result.startDate} endDate={result.endDate} />
                </div>
                <span className="sprint-issue-count">{result.issues.length} issues</span>
              </div>

              {result.issues.length > 0 && (
                <SprintOverview issues={result.issues} />
              )}

              {result.issues.length === 0 ? (
                <div className="sprint-no-issues">No issues in this sprint.</div>
              ) : (
                <div className="sprint-issue-table">
                  <div className="sprint-issue-head">
                    <span>Task</span>
                    <span>Sprint Goal</span>
                    <span>Original ETA</span>
                    <span>Logged Till Now</span>
                    <span>Logged This Sprint</span>
                    <span>Variance</span>
                    <span>Status</span>
                  </div>

                  {buildSprintRows(result.issues).map((row) => {
                    if (row.kind === "issue") {
                      return renderIssueRow(row.issue, result);
                    }

                    const storyKey = `${result.sprintId}-${row.issue.key}`;
                    const expanded = expandedStoryKeys.has(storyKey);

                    return (
                      <div key={row.issue.key} className="sprint-story-group">
                        {renderStoryRow(row, result)}
                        {expanded && row.children.map((child) => renderIssueRow(child, result, { child: true }))}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      ))}
      <FloatingUserTooltip tooltip={tooltip} />
    </div>
  );
}
