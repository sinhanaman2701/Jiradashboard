export type JiraRuntimeMode = "mock" | "live";
export type JiraTrackingView = "daily" | "weekly" | "monthly";

export interface JiraUser {
  accountId: string;
  displayName: string;
  active: boolean;
  emailAddress?: string;
}

export interface JiraIssue {
  id: string;
  key: string;
  summary: string;
  projectKey: string;
  projectName?: string;
  statusName?: string;
  assigneeAccountId?: string;
  assigneeDisplayName?: string;
  epicKey?: string;
  epicSummary?: string;
  eta?: string;
}

export interface JiraWorklog {
  id: string;
  issueId: string;
  issueKey: string;
  issueSummary: string;
  projectKey: string;
  authorAccountId: string;
  authorDisplayName: string;
  started: string;
  timeSpentSeconds: number;
}

export interface JiraUserTicketSummary {
  issueKey: string;
  issueSummary: string;
  projectKey: string;
  spaceName: string;
  epicKey?: string;
  epicSummary?: string;
  loggedSeconds: number;
  loggedHours: number;
  totalLoggedSeconds: number;
  totalLoggedHours: number;
  latestLoggedAt: string;
  eta?: string;
}

export interface JiraUserDaySummary {
  date: string;
  loggedSeconds: number;
  loggedHours: number;
  expectedHours: number;
  varianceHours: number;
}

export interface JiraUserPeriodSummary {
  periodKey: string;
  label: string;
  startDate: string;
  endDate: string;
  workingDays: number;
  loggedSeconds: number;
  loggedHours: number;
  expectedHours: number;
  varianceHours: number;
}

export interface JiraUserSummary {
  accountId: string;
  displayName: string;
  active: boolean;
  emailAddress?: string;
  workingDaysInRange: number;
  expectedHours: number;
  loggedSeconds: number;
  loggedHours: number;
  varianceHours: number;
  ticketCount: number;
  status: "missing" | "under" | "complete" | "over";
  dailyBreakdown: JiraUserDaySummary[];
  periodBreakdown: JiraUserPeriodSummary[];
  ticketBreakdown: JiraUserTicketSummary[];
}

export interface JiraDashboardData {
  mode: JiraRuntimeMode;
  trackingView: JiraTrackingView;
  syncedAt: string;
  baseUrl?: string;
  from: string;
  to: string;
  selectedProjects: string[];
  summary: {
    usersCount: number;
    workingDaysInRange: number;
    expectedHours: number;
    loggedHours: number;
    varianceHours: number;
    underTargetUsers: number;
  };
  users: JiraUserSummary[];
}
