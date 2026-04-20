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
- date presets for `Today`, `Yesterday`, `Last Week`, `Last Month`, and `Custom`
- team filter on the dashboard
- team management in settings with create, edit, delete, and member assignment
- expandable user rows with segmented hour bars based on logged tickets
- task links that open the original Jira issue

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

- team list
- user search
- all visible users
- current team assignments per user
- add/remove team membership
- create/edit/delete team modal flows

## Data Sources

The dashboard is driven by Jira worklogs and currently uses these Jira Cloud REST APIs:

- `GET /rest/api/3/users`
- `POST /rest/api/3/search/jql`
- `GET /rest/api/3/issue/{issueIdOrKey}/worklog`

The server-side aggregation layer lives in `src/lib/jira/dashboard.ts`.

## Tech Stack

- Next.js 15
- React 19
- TypeScript

## Run Locally

1. Copy `.env.example` to `.env`
2. Fill in Jira Cloud credentials
3. Install dependencies
4. Start the dev server

```bash
npm install
npm run dev
```

Default local URL:

```text
http://127.0.0.1:3006
```

## Environment Variables

```env
JIRA_BASE_URL=https://your-site.atlassian.net
JIRA_EMAIL=your-atlassian-email@example.com
JIRA_API_TOKEN=your-api-token
```

## Local Storage Keys

- `jd-teams-v2`
  - stores client-side team definitions and memberships
- `jd-preset-v1`
  - stores the last selected date preset

## Project Structure

```text
src/app/page.tsx                   Dashboard route
src/app/settings/page.tsx          Settings route
src/components/DateFilterBar.tsx   Date preset and custom range controls
src/components/DashboardShell.tsx  Dashboard shell
src/components/SettingsShell.tsx   Settings shell
src/lib/jira/client.ts             Jira REST API client
src/lib/jira/dashboard.ts          Aggregation and weekday logic
src/lib/jira/types.ts              Shared dashboard types
src/lib/teams.ts                   Team storage and shared UI helpers
```

## Notes

- Team data is currently stored in browser local storage, not in Jira.
- Jira app/bot accounts are filtered out from the user listing.
- Worklogs are attributed to the authenticated Jira user used for the API call.
- This dashboard is intended for worklog visibility, not productivity scoring or attendance enforcement.
