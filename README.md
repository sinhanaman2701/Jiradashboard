# Jira Dashboard

Standalone Jira Cloud worklog dashboard for manager and operations visibility.

This product reads Jira Cloud users, issues, and worklogs and shows how logged hours compare against an expected `8h` weekday target. It is built as a separate product and is not part of `productportal`.

## Current Product Scope

The current implementation includes:

- live Jira Cloud integration through API token auth
- mock fallback mode when Jira credentials are missing
- Atlassian OAuth login for user-authored time logging
- IST-locked date handling using `Asia/Kolkata`
- dashboard route at `/`
- settings route via `/?view=manage-team`
- sprint view route via `/?view=sprints`
- time logging route at `/time-logging`
- date presets for `Today`, `Yesterday`, `Last Week`, `Last Month`, and `Custom`
- team filter on the dashboard pulled live from Atlassian Teams API
- expandable user rows with segmented hour bars based on logged tickets
- task links that open the original Jira issue
- sprint board and issue tracking with worklog breakdowns per user
- admin team time logging with week and month drilldowns
- personal my-time-logging month summaries for both admins and users
- admin XLSX export with `This Month` and `Previous Month` workbook tabs

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

### Time Logging

The time logging feature shows:

- Atlassian OAuth-based login and session flow
- assigned-task cards for the current user
- log time modal that posts real Jira worklogs as the authenticated user
- admin-only split navigation:
  - `Team Time Logging`
  - `My Time Logging`
- admin team overview with:
  - `This week`
  - `Previous week`
  - `2 weeks ago`
  - `This month`
  - `Previous month`
- personal monthly summaries with collapsible task drilldowns
- admin workbook export button for monthly team reporting

## Data Sources

All data is fetched live from Jira Cloud and Atlassian APIs — no local database.

### Jira Cloud REST APIs

- `GET /rest/api/3/users`
- `POST /rest/api/3/search/jql`
- `GET /rest/api/3/issue/{issueIdOrKey}/worklog`
- `GET /rest/api/3/worklog/updated`
- `POST /rest/api/3/worklog/list`
- `GET /rest/agile/1.0/board`
- `GET /rest/agile/1.0/board/{boardId}/sprint`
- `GET /rest/agile/1.0/sprint/{sprintId}/issue`

### Atlassian Teams API

- `GET /gateway/api/public/teams/v1/org/{orgId}/teams`
- `POST /gateway/api/public/teams/v1/org/{orgId}/teams/{teamId}/members`

### Atlassian OAuth APIs

- `POST https://auth.atlassian.com/oauth/token`
- `GET https://api.atlassian.com/me`
- `GET https://api.atlassian.com/oauth/token/accessible-resources`

The server-side aggregation layer lives in `src/lib/jira/dashboard.ts`.

## Tech Stack

- Next.js 15
- React 19
- TypeScript

## Runtime

- Recommended Node.js: `22.x LTS`
- Package manager: `npm`
- This is a server-rendered Next.js app and must be deployed as a server app
- The current `start` script binds to `127.0.0.1:3006`

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

## Required Environment

This app expects an environment file with both read-side Jira credentials and user OAuth credentials.

Required variables:

```env
# Read-side Jira integration account
JIRA_BASE_URL=https://your-company.atlassian.net
NEXT_PUBLIC_JIRA_BASE_URL=https://your-company.atlassian.net
JIRA_EMAIL=service-account@example.com
JIRA_API_TOKEN=replace-with-your-api-token

# Atlassian Teams
ATLASSIAN_ORG_ID=your-atlassian-org-id
NEXT_PUBLIC_ATLASSIAN_ORG_ID=your-atlassian-org-id

# Atlassian OAuth 2.0 (3LO) for user time logging
ATLASSIAN_CLIENT_ID=your-oauth-client-id
ATLASSIAN_CLIENT_SECRET=your-oauth-client-secret
ATLASSIAN_REDIRECT_URI=http://127.0.0.1:3006/api/auth/callback

# Session encryption
SESSION_SECRET=your-random-secret

# App admins
ADMIN_ACCOUNT_IDS=712020:your-account-id

# Optional Jira field overrides
JIRA_ETA_FIELD_ID=customfield_10071
JIRA_PRODUCT_CLIENT_FIELD_ID=customfield_10137
```

Notes:

- `ATLASSIAN_REDIRECT_URI` must match the real deployed URL in production
- the OAuth app must be company-owned and distributed to real users
- the integration account must be able to read users, issues, worklogs, boards, sprints, and the required custom fields

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

## Deployment Notes

For DevOps / production rollout:

- deploy as a persistent Next.js server process, not a static site
- provide all required env vars through secret management
- ensure outbound access to:
  - `*.atlassian.net`
  - `auth.atlassian.com`
  - `api.atlassian.com`
- configure the production OAuth callback URL in the Atlassian developer console
- ensure the production domain uses HTTPS
- ensure the Jira integration account has the right read permissions across in-scope projects
- ensure the user-facing OAuth app has scopes required for:
  - reading user profile
  - reading Jira work
  - writing Jira worklogs
  - offline access / token refresh

Operational notes:

- admin XLSX export is generated server-side in memory
- current export is synchronous and returns a direct `.xlsx` file
- if team/worklog volume grows materially, the next scaling step should be a more streaming-oriented export path or background generation

## Local Storage Keys

- `jd-preset-v1`
  - stores the last selected date preset
- `jd-sprint-projects-v1`
  - stores selected sprint projects
- `jd-sprint-ids-v1`
  - stores selected sprint IDs

## Project Structure

```text
src/app/page.tsx                                    Dashboard route
src/app/settings/page.tsx                           Redirects to manage-team view
src/app/sprints/page.tsx                            Sprint view route
src/app/time-logging/page.tsx                       Time logging route
src/app/login/page.tsx                              Login route
src/app/api/auth/login/route.ts                     OAuth login redirect
src/app/api/auth/callback/route.ts                  OAuth callback
src/app/api/auth/logout/route.ts                    Logout
src/app/api/auth/me/route.ts                        Session user route
src/app/api/timelog/history/route.ts                Personal monthly summary payload
src/app/api/timelog/log/route.ts                    Worklog write route
src/app/api/timelog/issues/route.ts                 Assigned issue search
src/app/api/timelog/admin-overview/route.ts         Admin team overview route
src/app/api/timelog/admin-week/route.ts             Admin lazy period drilldown route
src/app/api/timelog/admin-report/route.ts           Admin XLSX export route
src/app/api/teams/route.ts                          Teams API route (proxies Atlassian Teams API)
src/app/api/sprints/boards/route.ts                 Sprint boards API route
src/app/api/sprints/board/[boardId]/sprints/        Sprint list for a board
src/app/api/sprints/sprint/[sprintId]/issues/       Issues for a sprint
src/components/DateFilterBar.tsx                    Date preset and custom range controls
src/components/DashboardShell.tsx                   Dashboard shell
src/components/SettingsShell.tsx                    Settings shell
src/components/SprintShell.tsx                      Sprint view shell
src/components/TimeLogShell.tsx                     Time logging shell
src/lib/date-utils.ts                               IST date helpers
src/lib/jira/client.ts                              Jira REST API client
src/lib/jira/dashboard.ts                           Aggregation and weekday logic
src/lib/jira/atlassian-teams.ts                     Atlassian Teams API client
src/lib/jira/sprints.ts                             Sprint and board fetching logic
src/lib/jira/timelog.ts                             User time logging logic
src/lib/jira/timelog-admin.ts                       Admin team time logging logic
src/lib/jira/types.ts                               Shared dashboard types
src/lib/jira/sprint-types.ts                        Shared sprint types
src/lib/session.ts                                  OAuth session handling
src/lib/teams.ts                                    Shared UI helpers (avatars, colors)
```

## Notes

- Team data is fetched live from the Atlassian Teams API — no local database or browser storage for teams.
- Jira app/bot accounts are filtered out from the user listing.
- Worklogs are attributed to the authenticated Jira user used for the API call.
- This dashboard is intended for worklog visibility, not productivity scoring or attendance enforcement.
- The GitHub repo documents the deployable app. Broader local product docs also exist outside the repo in `/Users/namansinha/Officework/Jira`.
