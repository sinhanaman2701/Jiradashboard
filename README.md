# Jira Dashboard

Standalone Jira Cloud dashboard for user-wise time tracking visibility.

This project connects to Jira Cloud REST APIs and shows:

- user-wise logged hours against an 8-hour weekday expectation
- date filters for `Yesterday`, `Last Week`, `Last Month`, and `Custom Date`
- expandable user tiles with colored ticket-based hour bars
- task-level drilldown linked back to the original Jira issues
- local team management with multi-team membership and homepage team filtering

The dashboard is designed for leadership visibility, not attendance enforcement. It uses Jira worklogs as the source of truth and treats Saturday and Sunday as off days in the expected-hours calculation.

## Features

- live Jira Cloud integration with API token auth
- mock fallback mode when Jira credentials are absent
- IST-locked date handling using `Asia/Kolkata`
- user listing with per-ticket hour segmentation
- ticket drilldown with direct Jira issue links
- team creation and membership management from the UI

## Tech Stack

- Next.js 15
- React 19
- TypeScript

## Run Locally

1. Copy `.env.example` to `.env`
2. Fill in your Jira Cloud credentials
3. Install dependencies
4. Start the dev server

```bash
npm install
npm run dev
```

App URL:

```text
http://127.0.0.1:3006
```

## Environment Variables

```env
JIRA_BASE_URL=https://your-site.atlassian.net
JIRA_EMAIL=your-atlassian-email@example.com
JIRA_API_TOKEN=your-api-token
```

## Jira APIs Used

- `GET /rest/api/3/users`
- `POST /rest/api/3/search/jql`
- `GET /rest/api/3/issue/{issueIdOrKey}/worklog`

## Project Structure

```text
src/app/page.tsx                  Main dashboard page
src/components/DateFilterBar.tsx Date filter controls
src/components/DashboardShell.tsx Team filter, settings, and user tiles
src/lib/jira/client.ts           Jira REST API client
src/lib/jira/dashboard.ts        Aggregation and weekday logic
src/lib/jira/types.ts            Shared dashboard types
```

## Notes

- Team data is currently stored in browser local storage.
- Jira app/bot accounts are filtered out from the human user listing.
- Worklogs are attributed to the authenticated Jira user used for the API call.
