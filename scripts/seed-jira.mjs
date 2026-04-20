/**
 * Jira seed script — creates classic scrum projects, sprints, issues, and worklogs.
 *
 * Users:
 *   Naman Sinha  — 712020:af9fa904-5bed-407a-90a3-aa92aba2f066
 *   Testuser1    — 712020:c7ae439b-a226-4cb7-988a-24d8f506df2d
 */

import { readFileSync } from "fs";
import { resolve } from "path";

// ── Load .env ────────────────────────────────────────────────────────────────
const envPath = resolve(process.cwd(), ".env");
const envContent = readFileSync(envPath, "utf-8");
const env = Object.fromEntries(
  envContent
    .split("\n")
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => {
      const idx = l.indexOf("=");
      return [l.slice(0, idx).trim(), l.slice(idx + 1).trim()];
    })
);

const BASE = env.JIRA_BASE_URL.replace(/\/$/, "");
const AUTH = "Basic " + Buffer.from(`${env.JIRA_EMAIL}:${env.JIRA_API_TOKEN}`).toString("base64");
const HEADERS = { Authorization: AUTH, Accept: "application/json", "Content-Type": "application/json" };

// ── Jira helpers ─────────────────────────────────────────────────────────────
async function req(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: HEADERS,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${text}`);
  return text ? JSON.parse(text) : null;
}

const get  = (path)       => req("GET", path);
const post = (path, body) => req("POST", path, body);
const put  = (path, body) => req("PUT", path, body);

function log(msg) { console.log(`  ${msg}`); }
function section(title) { console.log(`\n▶ ${title}`); }

// ── Constants ─────────────────────────────────────────────────────────────────
const NAMAN    = "712020:af9fa904-5bed-407a-90a3-aa92aba2f066";
const TESTUSER = "712020:c7ae439b-a226-4cb7-988a-24d8f506df2d";

const PROJECTS_TO_CREATE = [
  {
    key: "SCRUM1",
    name: "Sprint Team Alpha",
    sprints: [
      {
        name: "SCRUM1 — Sprint 1",
        state: "closed",
        startDate: "2026-04-01T09:00:00.000+05:30",
        endDate:   "2026-04-07T18:00:00.000+05:30",
        issues: [
          { summary: "Set up monitoring dashboard",      assignee: NAMAN,    logs: [{ hours: 4, day: "2026-04-01" }, { hours: 3, day: "2026-04-02" }] },
          { summary: "Configure alert thresholds",       assignee: TESTUSER,  logs: [{ hours: 6, day: "2026-04-02" }, { hours: 2, day: "2026-04-03" }] },
          { summary: "Write API integration docs",       assignee: NAMAN,    logs: [{ hours: 3, day: "2026-04-03" }, { hours: 3, day: "2026-04-04" }] },
          { summary: "Fix authentication token expiry",  assignee: TESTUSER,  logs: [{ hours: 5, day: "2026-04-04" }, { hours: 3, day: "2026-04-07" }] },
        ],
      },
      {
        name: "SCRUM1 — Sprint 2",
        state: "active",
        startDate: "2026-04-14T09:00:00.000+05:30",
        endDate:   "2026-04-28T18:00:00.000+05:30",
        issues: [
          { summary: "Implement user settings page",     assignee: NAMAN,    logs: [{ hours: 4, day: "2026-04-14" }, { hours: 4, day: "2026-04-15" }] },
          { summary: "Add CSV export for reports",       assignee: TESTUSER,  logs: [{ hours: 3, day: "2026-04-14" }, { hours: 5, day: "2026-04-16" }] },
          { summary: "Refactor auth middleware",         assignee: NAMAN,    logs: [{ hours: 6, day: "2026-04-17" }, { hours: 2, day: "2026-04-18" }] },
          { summary: "Update dashboard summary cards",   assignee: TESTUSER,  logs: [{ hours: 4, day: "2026-04-18" }, { hours: 4, day: "2026-04-21" }] },
          { summary: "Add pagination to user list",      assignee: NAMAN,    logs: [{ hours: 3, day: "2026-04-21" }, { hours: 3, day: "2026-04-22" }] },
        ],
      },
    ],
  },
  {
    key: "SCRUM2",
    name: "Product Roadmap Board",
    sprints: [
      {
        name: "SCRUM2 — Sprint 1",
        state: "closed",
        startDate: "2026-04-01T09:00:00.000+05:30",
        endDate:   "2026-04-07T18:00:00.000+05:30",
        issues: [
          { summary: "Define Q2 product roadmap",        assignee: NAMAN,    logs: [{ hours: 5, day: "2026-04-01" }, { hours: 3, day: "2026-04-02" }] },
          { summary: "Conduct stakeholder interviews",    assignee: TESTUSER,  logs: [{ hours: 4, day: "2026-04-02" }, { hours: 4, day: "2026-04-03" }] },
          { summary: "Competitive landscape analysis",   assignee: NAMAN,    logs: [{ hours: 6, day: "2026-04-03" }, { hours: 2, day: "2026-04-04" }] },
          { summary: "Draft product spec v1",            assignee: TESTUSER,  logs: [{ hours: 3, day: "2026-04-04" }, { hours: 5, day: "2026-04-07" }] },
        ],
      },
      {
        name: "SCRUM2 — Sprint 2",
        state: "active",
        startDate: "2026-04-14T09:00:00.000+05:30",
        endDate:   "2026-04-28T18:00:00.000+05:30",
        issues: [
          { summary: "Design system component audit",    assignee: TESTUSER,  logs: [{ hours: 4, day: "2026-04-14" }, { hours: 4, day: "2026-04-15" }] },
          { summary: "Feature prioritisation workshop",  assignee: NAMAN,    logs: [{ hours: 5, day: "2026-04-15" }, { hours: 3, day: "2026-04-16" }] },
          { summary: "Write sprint planning templates",  assignee: TESTUSER,  logs: [{ hours: 3, day: "2026-04-17" }, { hours: 5, day: "2026-04-18" }] },
          { summary: "OKR alignment with leadership",    assignee: NAMAN,    logs: [{ hours: 6, day: "2026-04-21" }, { hours: 2, day: "2026-04-22" }] },
        ],
      },
    ],
  },
];

// ── Project helpers ───────────────────────────────────────────────────────────
async function ensureProject(key, name) {
  // Try to get existing project first
  try {
    const existing = await get(`/rest/api/3/project/${key}`);
    log(`Using existing project "${existing.name}" (key: ${existing.key})`);
    return existing;
  } catch {
    // Doesn't exist, create it
  }

  const project = await post("/rest/api/3/project", {
    key,
    name,
    projectTypeKey: "software",
    projectTemplateKey: "com.pyxis.greenhopper.jira:gh-scrum-template",
    leadAccountId: NAMAN,
  });
  log(`Created scrum project "${name}" (key: ${project.key}, id: ${project.id})`);
  return project;
}

async function getBoardForProject(projectKey) {
  // Retry a few times as board creation can be async
  for (let attempt = 0; attempt < 6; attempt++) {
    const data = await get(`/rest/agile/1.0/board?projectKeyOrId=${projectKey}&type=scrum`);
    if (data.values && data.values.length > 0) {
      const board = data.values[0];
      log(`Found board "${board.name}" (id: ${board.id}) for ${projectKey}`);
      return board;
    }
    log(`No board yet for ${projectKey}, waiting… (attempt ${attempt + 1}/6)`);
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error(`No scrum board found for project ${projectKey} after retries`);
}

// ── Sprint helpers ────────────────────────────────────────────────────────────
async function createSprint(boardId, name, startDate, endDate) {
  const sprint = await post("/rest/agile/1.0/sprint", {
    name,
    originBoardId: boardId,
    startDate,
    endDate,
  });
  log(`Created sprint "${name}" (id: ${sprint.id})`);
  return sprint;
}

async function startSprint(sprintId, name, startDate, endDate) {
  await put(`/rest/agile/1.0/sprint/${sprintId}`, {
    name,
    state: "active",
    startDate,
    endDate,
  });
  log(`Started sprint ${sprintId}`);
}

async function closeSprint(sprintId, name, startDate, endDate) {
  await put(`/rest/agile/1.0/sprint/${sprintId}`, { name, state: "closed", startDate, endDate });
  log(`Closed sprint ${sprintId}`);
}

async function moveIssuesToSprint(sprintId, issueKeys) {
  await post(`/rest/agile/1.0/sprint/${sprintId}/issue`, { issues: issueKeys });
  log(`Moved ${issueKeys.join(", ")} → sprint ${sprintId}`);
}

// ── Issue helpers ─────────────────────────────────────────────────────────────
async function createIssue(projectKey, summary, assigneeAccountId) {
  const issue = await post("/rest/api/3/issue", {
    fields: {
      project: { key: projectKey },
      summary,
      issuetype: { name: "Story" },
      assignee: { accountId: assigneeAccountId },
    },
  });
  log(`Created ${issue.key}: "${summary}" → ${assigneeAccountId === NAMAN ? "Naman" : "Testuser1"}`);
  return issue;
}

async function logWork(issueKey, hours, day) {
  const started = `${day}T09:00:00.000+0530`;
  await post(`/rest/api/3/issue/${issueKey}/worklog`, {
    timeSpentSeconds: hours * 3600,
    started,
  });
  log(`  ↳ Logged ${hours}h on ${issueKey} (${day})`);
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function seed() {
  console.log("🌱 Jira seed starting…\n");

  for (const projectDef of PROJECTS_TO_CREATE) {
    section(`Project: ${projectDef.name} (${projectDef.key})`);

    await ensureProject(projectDef.key, projectDef.name);

    // Get the auto-created scrum board
    const board = await getBoardForProject(projectDef.key);

    for (const sprintDef of projectDef.sprints) {
      console.log(`\n  Sprint: "${sprintDef.name}"`);

      const sprint = await createSprint(board.id, sprintDef.name, sprintDef.startDate, sprintDef.endDate);

      // Create all issues
      const issueKeys = [];
      for (const issueDef of sprintDef.issues) {
        const issue = await createIssue(projectDef.key, issueDef.summary, issueDef.assignee);
        issueKeys.push(issue.key);
      }

      // Move issues into sprint
      await moveIssuesToSprint(sprint.id, issueKeys);

      // Transition sprint state
      if (sprintDef.state === "active" || sprintDef.state === "closed") {
        await startSprint(sprint.id, sprintDef.name, sprintDef.startDate, sprintDef.endDate);
      }
      if (sprintDef.state === "closed") {
        await closeSprint(sprint.id, sprintDef.name, sprintDef.startDate, sprintDef.endDate);
      }

      // Log work on each issue
      for (let i = 0; i < sprintDef.issues.length; i++) {
        const issueDef = sprintDef.issues[i];
        const issueKey = issueKeys[i];
        for (const entry of issueDef.logs) {
          await logWork(issueKey, entry.hours, entry.day);
        }
      }
    }
  }

  console.log("\n✅ Seed complete.");
}

seed().catch((err) => {
  console.error("❌ Seed failed:", err.message);
  process.exit(1);
});
