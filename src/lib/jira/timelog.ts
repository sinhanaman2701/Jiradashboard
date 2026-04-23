import { parseTimeToSeconds } from "@/lib/time-parser";

export interface JiraProject {
  id: string;
  key: string;
  name: string;
  projectTypeKey: string;
}

export interface JiraIssueOption {
  id: string;
  key: string;
  summary: string;
  projectKey: string;
  projectName: string;
  issueType: string;
  status: string;
  originalEstimateSeconds: number;
  totalLoggedSeconds: number;
  latestLoggedAt?: string;
}

export interface WorklogEntry {
  id: string;
  issueKey: string;
  issueSummary: string;
  projectKey: string;
  timeSpentSeconds: number;
  started: string; // ISO date string
  comment: string;
}

const WORKLOG_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const WORKLOG_DATE_PREFIX_RE = /^(\d{4}-\d{2}-\d{2})/;

function currentIstTimePart(): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(new Date());

  const hour = parts.find((part) => part.type === "hour")?.value ?? "12";
  const minute = parts.find((part) => part.type === "minute")?.value ?? "00";
  const second = parts.find((part) => part.type === "second")?.value ?? "00";
  return `${hour}:${minute}:${second}`;
}

function buildWorklogStarted(dateYmd: string): string {
  if (!WORKLOG_DATE_RE.test(dateYmd)) {
    throw new Error(`Invalid worklog date: ${dateYmd}`);
  }

  // Keep the provided IST date and use the current IST clock time so Jira's relative timestamp
  // reflects when the user logged it instead of a fixed synthetic hour.
  return `${dateYmd}T${currentIstTimePart()}.000+0530`;
}

function getWorklogDate(started: string): string {
  const match = WORKLOG_DATE_PREFIX_RE.exec(started);
  return match?.[1] ?? started.slice(0, 10);
}

function jiraHeaders(accessToken: string) {
  return {
    Authorization: `Bearer ${accessToken}`,
    Accept: "application/json",
    "Content-Type": "application/json",
  };
}

function baseUrl(cloudId: string): string {
  return `https://api.atlassian.com/ex/jira/${cloudId}`;
}

async function wait(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function retryDelayMs(response: Response, attempt: number): number {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds > 0) return seconds * 1000;
  }
  return Math.min(250 * 2 ** attempt, 2000);
}

async function jiraFetchWithRetry(url: string, init: RequestInit, attempts = 3): Promise<Response> {
  let lastResponse: Response | null = null;

  for (let attempt = 0; attempt < attempts; attempt++) {
    const response = await fetch(url, init);
    if (response.status !== 429 && response.status < 500) return response;
    lastResponse = response;
    if (attempt < attempts - 1) {
      await wait(retryDelayMs(response, attempt));
    }
  }

  return lastResponse!;
}

export async function fetchUserProjects(accessToken: string, cloudId: string): Promise<JiraProject[]> {
  const url = `${baseUrl(cloudId)}/rest/api/3/project?maxResults=100&orderBy=name`;
  const res = await jiraFetchWithRetry(url, {
    headers: jiraHeaders(accessToken),
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to fetch projects: ${res.status} ${body}`);
  }
  return await res.json() as JiraProject[];
}

export async function searchIssues(
  accessToken: string,
  cloudId: string,
  accountId: string,
  projectKey: string | null,
  query: string
): Promise<JiraIssueOption[]> {
  const etaFieldId = process.env.JIRA_ETA_FIELD_ID ?? "customfield_10071";
  const assigneeClause = `assignee = "${accountId}"`;
  const projectClause = projectKey ? `project = "${projectKey}" AND ` : "";
  const jql = query.trim()
    ? `${projectClause}${assigneeClause} AND (summary ~ "${query}" OR key = "${query}") ORDER BY updated DESC`
    : `${projectClause}${assigneeClause} ORDER BY updated DESC`;

  const res = await jiraFetchWithRetry(`${baseUrl(cloudId)}/rest/api/3/search/jql`, {
    method: "POST",
    headers: jiraHeaders(accessToken),
    body: JSON.stringify({
      jql,
      fields: ["summary", "project", "issuetype", "status", etaFieldId],
      maxResults: 100,
    }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Failed to search issues: ${res.status}`);

  const data = await res.json() as {
    issues: Array<{
      id: string;
      key: string;
      fields: {
        summary: string;
        project: { key: string; name: string };
        issuetype: { name: string };
        status: { name: string };
        [etaFieldId]?: string | null;
      };
    }>;
  };

  const options = data.issues.map((issue) => ({
    id: issue.id,
    key: issue.key,
    summary: issue.fields.summary,
    projectKey: issue.fields.project.key,
    projectName: issue.fields.project.name,
    issueType: issue.fields.issuetype.name,
    status: issue.fields.status.name,
    originalEstimateSeconds: parseTimeToSeconds((issue.fields[etaFieldId] as string | null | undefined) ?? "") ?? 0,
    totalLoggedSeconds: 0,
    latestLoggedAt: undefined as string | undefined,
  }));

  await Promise.all(
    options.map(async (issue) => {
      const wlRes = await jiraFetchWithRetry(
        `${baseUrl(cloudId)}/rest/api/3/issue/${issue.key}/worklog?maxResults=100`,
        { headers: jiraHeaders(accessToken), cache: "no-store" }
      );
      if (!wlRes.ok) return;

      const wlData = await wlRes.json() as {
        worklogs: Array<{
          author?: { accountId?: string };
          started?: string;
          timeSpentSeconds?: number;
        }>;
      };

      const userWorklogs = wlData.worklogs.filter((worklog) => worklog.author?.accountId === accountId);
      issue.totalLoggedSeconds = userWorklogs.reduce((sum, worklog) => sum + (worklog.timeSpentSeconds ?? 0), 0);
      issue.latestLoggedAt = userWorklogs
        .filter((worklog) => worklog.started)
        .map((worklog) => worklog.started!)
        .sort((a, b) => b.localeCompare(a))[0];
    })
  );

  return options.sort((a, b) => {
    if (a.latestLoggedAt && b.latestLoggedAt) return b.latestLoggedAt.localeCompare(a.latestLoggedAt);
    if (a.latestLoggedAt) return -1;
    if (b.latestLoggedAt) return 1;
    return a.summary.localeCompare(b.summary);
  });
}

export async function assertIssueAssignedToUser(
  accessToken: string,
  cloudId: string,
  issueKey: string,
  accountId: string
): Promise<void> {
  const res = await jiraFetchWithRetry(`${baseUrl(cloudId)}/rest/api/3/issue/${encodeURIComponent(issueKey)}?fields=assignee`, {
    headers: jiraHeaders(accessToken),
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`Failed to validate issue assignment: ${res.status}`);
  }

  const data = await res.json() as {
    fields?: { assignee?: { accountId?: string } | null };
  };
  const assigneeAccountId = data.fields?.assignee?.accountId;
  if (assigneeAccountId !== accountId) {
    throw new Error("You can only log time on tasks assigned to you.");
  }
}

export async function postWorklog(
  accessToken: string,
  cloudId: string,
  issueKey: string,
  timeSpentSeconds: number,
  dateYmd: string,
  comment: string
): Promise<void> {
  const started = buildWorklogStarted(dateYmd);

  const body: Record<string, unknown> = {
    started,
    timeSpentSeconds,
  };

  if (comment.trim()) {
    body.comment = {
      type: "doc",
      version: 1,
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: comment.trim() }],
        },
      ],
    };
  }

  const res = await jiraFetchWithRetry(`${baseUrl(cloudId)}/rest/api/3/issue/${issueKey}/worklog`, {
    method: "POST",
    headers: jiraHeaders(accessToken),
    body: JSON.stringify(body),
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Jira returned ${res.status}`);
  }
}

export async function fetchUserWorklogs(
  accessToken: string,
  cloudId: string,
  accountId: string,
  fromDate: string
): Promise<WorklogEntry[]> {
  const jql = `worklogAuthor = "${accountId}" AND worklogDate >= "${fromDate}" ORDER BY updated DESC`;

  const searchRes = await jiraFetchWithRetry(`${baseUrl(cloudId)}/rest/api/3/search/jql`, {
    method: "POST",
    headers: jiraHeaders(accessToken),
    body: JSON.stringify({ jql, fields: ["summary", "project"], maxResults: 100 }),
    cache: "no-store",
  });
  if (!searchRes.ok) return [];

  const searchData = await searchRes.json() as {
    issues: Array<{
      key: string;
      fields: { summary: string; project: { key: string } };
    }>;
  };

  const entries: WorklogEntry[] = [];

  await Promise.all(
    searchData.issues.map(async (issue) => {
      const wlRes = await jiraFetchWithRetry(
        `${baseUrl(cloudId)}/rest/api/3/issue/${issue.key}/worklog?maxResults=100`,
        { headers: jiraHeaders(accessToken), cache: "no-store" }
      );
      if (!wlRes.ok) return;

      const wlData = await wlRes.json() as {
        worklogs: Array<{
          id: string;
          author: { accountId: string };
          started: string;
          timeSpentSeconds: number;
          comment?: { content?: Array<{ content?: Array<{ text?: string }> }> };
        }>;
      };

      for (const wl of wlData.worklogs) {
        if (wl.author.accountId !== accountId) continue;
        if (getWorklogDate(wl.started) < fromDate) continue;

        let comment = "";
        const para = wl.comment?.content?.[0]?.content?.[0]?.text;
        if (para) comment = para;

        entries.push({
          id: wl.id,
          issueKey: issue.key,
          issueSummary: issue.fields.summary,
          projectKey: issue.fields.project.key,
          timeSpentSeconds: wl.timeSpentSeconds,
          started: wl.started,
          comment,
        });
      }
    })
  );

  entries.sort((a, b) => b.started.localeCompare(a.started));
  return entries;
}
