export interface AtlassianTeam {
  id: string;
  name: string;
  members: string[]; // accountIds
}

function getAuth(): string {
  const email = process.env.JIRA_EMAIL ?? "";
  const token = process.env.JIRA_API_TOKEN ?? "";
  return `Basic ${Buffer.from(`${email}:${token}`).toString("base64")}`;
}

const HEADERS = {
  Authorization: getAuth(),
  Accept: "application/json",
  "Content-Type": "application/json",
};

async function fetchTeamMemberIds(orgId: string, teamId: string): Promise<string[]> {
  const accountIds: string[] = [];
  let cursor: string | undefined;

  while (true) {
    const body: Record<string, unknown> = { maxResults: 50 };
    if (cursor) body.after = cursor;

    const res = await fetch(
      `https://api.atlassian.com/gateway/api/public/teams/v1/org/${orgId}/teams/${teamId}/members`,
      { method: "POST", headers: HEADERS, body: JSON.stringify(body), cache: "no-store" }
    );
    if (!res.ok) break;

    const data = await res.json() as {
      results: { accountId: string }[];
      pageInfo: { hasNextPage: boolean; endCursor?: string };
    };

    for (const m of data.results) accountIds.push(m.accountId);

    if (!data.pageInfo.hasNextPage) break;
    cursor = data.pageInfo.endCursor;
  }

  return accountIds;
}

export async function fetchAtlassianTeams(): Promise<AtlassianTeam[]> {
  const orgId = process.env.ATLASSIAN_ORG_ID ?? "";
  if (!orgId) return [];

  const res = await fetch(
    `https://api.atlassian.com/gateway/api/public/teams/v1/org/${orgId}/teams`,
    { headers: HEADERS, cache: "no-store" }
  );
  if (!res.ok) return [];

  const data = await res.json() as {
    entities: { teamId: string; displayName: string; state: string }[];
  };

  const active = data.entities.filter((t) => t.state === "ACTIVE");

  const teams = await Promise.all(
    active.map(async (t) => ({
      id: t.teamId,
      name: t.displayName,
      members: await fetchTeamMemberIds(orgId, t.teamId),
    }))
  );

  return teams.sort((a, b) => a.name.localeCompare(b.name));
}
