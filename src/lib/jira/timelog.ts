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
  issueType: string;
  status: string;
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

function jiraHeaders(accessToken: string) {
  return {
    Authorization: `Bearer ${accessToken}`,
    Accept: "application/json",
    "Content-Type": "application/json",
  };
}

function baseUrl(): string {
  return (process.env.JIRA_BASE_URL ?? "").replace(/\/$/, "");
}

export async function fetchUserProjects(accessToken: string): Promise<JiraProject[]> {
  const res = await fetch(`${baseUrl()}/rest/api/3/project?maxResults=100&orderBy=name`, {
    headers: jiraHeaders(accessToken),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Failed to fetch projects: ${res.status}`);
  const data = await res.json() as JiraProject[];
  return data;
}

export async function searchIssues(
  accessToken: string,
  projectKey: string,
  query: string
): Promise<JiraIssueOption[]> {
  const jql = query.trim()
    ? `project = "${projectKey}" AND (summary ~ "${query}" OR key = "${query}") ORDER BY updated DESC`
    : `project = "${projectKey}" ORDER BY updated DESC`;

  const res = await fetch(`${baseUrl()}/rest/api/3/search/jql`, {
    method: "POST",
    headers: jiraHeaders(accessToken),
    body: JSON.stringify({
      jql,
      fields: ["summary", "issuetype", "status"],
      maxResults: 20,
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
        issuetype: { name: string };
        status: { name: string };
      };
    }>;
  };

  return data.issues.map((issue) => ({
    id: issue.id,
    key: issue.key,
    summary: issue.fields.summary,
    issueType: issue.fields.issuetype.name,
    status: issue.fields.status.name,
  }));
}

export async function postWorklog(
  accessToken: string,
  issueKey: string,
  timeSpentSeconds: number,
  dateYmd: string,
  comment: string
): Promise<void> {
  // Convert YYYY-MM-DD to IST 09:00 started timestamp
  const started = `${dateYmd}T09:00:00.000+0530`;

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

  const res = await fetch(`${baseUrl()}/rest/api/3/issue/${issueKey}/worklog`, {
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
  accountId: string,
  fromDate: string
): Promise<WorklogEntry[]> {
  // Find issues this user has logged on
  const jql = `worklogAuthor = "${accountId}" AND worklogDate >= "${fromDate}" ORDER BY updated DESC`;

  const searchRes = await fetch(`${baseUrl()}/rest/api/3/search/jql`, {
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
      const wlRes = await fetch(
        `${baseUrl()}/rest/api/3/issue/${issue.key}/worklog?maxResults=100`,
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
        if (wl.started < fromDate) continue;

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

  entries.sort((a, b) => a.started.localeCompare(b.started));
  return entries;
}
