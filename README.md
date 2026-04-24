# Jira Dashboard

Standalone Jira Cloud worklog dashboard for manager and operations visibility.

This product reads Jira Cloud users, issues, and worklogs and shows how logged hours compare against an expected `8h` weekday target. It is built as a separate product and is not part of `productportal`.

## Current Product Scope

The current implementation includes:

- live Jira Cloud integration through API token auth
- mock fallback mode when Jira credentials are missing
- IST-locked date handling using `Asia/Kolkata`
- dashboard route at `/`
- settings route at `/settings`
- sprint view route at `/sprints`
- date presets for `Today`, `Yesterday`, `Last Week`, `Last Month`, and `Custom`
- team filter on the dashboard pulled live from Atlassian Teams API
- expandable user rows with segmented hour bars based on logged tickets
- task links that open the original Jira issue
- sprint board and issue tracking with worklog breakdowns per user

## Product Behavior

### Expected hours

- `8 hours` per working day
- `Saturday` and `Sunday` are off days
- no holiday, leave, shift, or half-day adjustments in the current version

### Dashboard

The dashboard shows:

- summary strip with members, expected hours, logged hours, coverage, and below-target count
- date filter and team filter
- one expandable row per user
- expected, logged, and variance values per user
- average-hours-per-day bar segmented by ticket
- task table under each expanded row

### Settings

The settings page shows:

- teams pulled live from Atlassian Teams API (read-only, no local overrides)
- user search
- all visible users
- current team assignments per user

### Sprints

The sprint view shows:

- project and board selector
- active, closed, and future sprints per board
- per-sprint issue list with worklog breakdowns per user
- hours logged per issue segmented by assignee

## Data Sources

All data is fetched live from Jira Cloud and Atlassian APIs — no local database.

### Jira Cloud REST APIs

- `GET /rest/api/3/users`
- `POST /rest/api/3/search/jql`
- `GET /rest/api/3/issue/{issueIdOrKey}/worklog`
- `GET /rest/agile/1.0/board`
- `GET /rest/agile/1.0/board/{boardId}/sprint`
- `GET /rest/agile/1.0/sprint/{sprintId}/issue`

### Atlassian Teams API

- `GET /gateway/api/public/teams/v1/org/{orgId}/teams`
- `POST /gateway/api/public/teams/v1/org/{orgId}/teams/{teamId}/members`

The server-side aggregation layer lives in `src/lib/jira/dashboard.ts`.

## Tech Stack

- Next.js 15
- React 19
- TypeScript

## Runtime

- Recommended Node.js: `22.x LTS`
- Package manager: `npm`

## Run Locally

1. Install dependencies
2. Provide the deployment or local environment file separately
3. Start the dev server

```bash
npm install
npm run dev
```

Default local URL:

```text
http://127.0.0.1:3006
```

## DevOps Commands

Install dependencies:

```bash
npm install
```

Run in development:

```bash
npm run dev
```

Build for production:

```bash
npm run build
```

Start the production server:

```bash
npm run start
```

Validation:

```bash
npm run typecheck
```

Notes:

- `npm run dev` runs the app on `127.0.0.1:3006`
- `npm run start` also binds to `127.0.0.1:3006`, so hosting may need a process manager or command override if the server should listen on a different host or port
- this app requires server-side hosting; it is not a static export

## Local Storage Keys

- `jd-preset-v1`
  - stores the last selected date preset

## Project Structure

```text
src/app/page.tsx                                    Dashboard route
src/app/settings/page.tsx                           Settings route
src/app/sprints/page.tsx                            Sprint view route
src/app/api/teams/route.ts                          Teams API route (proxies Atlassian Teams API)
src/app/api/sprints/boards/route.ts                 Sprint boards API route
src/app/api/sprints/board/[boardId]/sprints/        Sprint list for a board
src/app/api/sprints/sprint/[sprintId]/issues/       Issues for a sprint
src/components/DateFilterBar.tsx                    Date preset and custom range controls
src/components/DashboardShell.tsx                   Dashboard shell
src/components/SettingsShell.tsx                    Settings shell
src/components/SprintShell.tsx                      Sprint view shell
src/lib/date-utils.ts                               IST date helpers
src/lib/jira/client.ts                              Jira REST API client
src/lib/jira/dashboard.ts                           Aggregation and weekday logic
src/lib/jira/atlassian-teams.ts                     Atlassian Teams API client
src/lib/jira/sprints.ts                             Sprint and board fetching logic
src/lib/jira/types.ts                               Shared dashboard types
src/lib/jira/sprint-types.ts                        Shared sprint types
src/lib/teams.ts                                    Shared UI helpers (avatars, colors)
```

## Notes

- Team data is fetched live from the Atlassian Teams API — no local database or browser storage for teams.
- Jira app/bot accounts are filtered out from the user listing.
- Worklogs are attributed to the authenticated Jira user used for the API call.
- This dashboard is intended for worklog visibility, not productivity scoring or attendance enforcement.
