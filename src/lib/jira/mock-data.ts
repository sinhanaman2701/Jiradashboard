import type { JiraIssue, JiraUser, JiraWorklog } from "@/lib/jira/types";

export const mockUsers: JiraUser[] = [
  { accountId: "u1", displayName: "Alex Johnson", active: true },
  { accountId: "u2", displayName: "Priya Sharma", active: true },
  { accountId: "u3", displayName: "Sam Lee", active: true },
  { accountId: "u4", displayName: "Inactive Demo User", active: false }
];

export const mockIssues: JiraIssue[] = [
  {
    id: "10001",
    key: "ENG-101",
    summary: "Implement dashboard summary cards",
    projectKey: "ENG",
    projectName: "Engineering",
    statusName: "In Progress",
    epicKey: "ENG-50",
    epicSummary: "Dashboard Q2 Initiative"
  },
  {
    id: "10002",
    key: "ENG-102",
    summary: "Integrate Jira users endpoint",
    projectKey: "ENG",
    projectName: "Engineering",
    statusName: "In Review",
    epicKey: "ENG-50",
    epicSummary: "Dashboard Q2 Initiative"
  },
  {
    id: "10003",
    key: "OPS-44",
    summary: "Investigate missing worklogs in leadership view",
    projectKey: "OPS",
    projectName: "Operations",
    statusName: "Done"
  }
];

export const mockWorklogs: JiraWorklog[] = [
  {
    id: "1",
    issueId: "10001",
    issueKey: "ENG-101",
    issueSummary: "Implement dashboard summary cards",
    projectKey: "ENG",
    authorAccountId: "u1",
    authorDisplayName: "Alex Johnson",
    started: "2026-04-14T09:00:00.000+0530",
    timeSpentSeconds: 14400
  },
  {
    id: "2",
    issueId: "10002",
    issueKey: "ENG-102",
    issueSummary: "Integrate Jira users endpoint",
    projectKey: "ENG",
    authorAccountId: "u1",
    authorDisplayName: "Alex Johnson",
    started: "2026-04-14T14:00:00.000+0530",
    timeSpentSeconds: 10800
  },
  {
    id: "3",
    issueId: "10001",
    issueKey: "ENG-101",
    issueSummary: "Implement dashboard summary cards",
    projectKey: "ENG",
    authorAccountId: "u2",
    authorDisplayName: "Priya Sharma",
    started: "2026-04-14T10:00:00.000+0530",
    timeSpentSeconds: 28800
  },
  {
    id: "4",
    issueId: "10003",
    issueKey: "OPS-44",
    issueSummary: "Investigate missing worklogs in leadership view",
    projectKey: "OPS",
    authorAccountId: "u3",
    authorDisplayName: "Sam Lee",
    started: "2026-04-14T11:00:00.000+0530",
    timeSpentSeconds: 7200
  },
  {
    id: "5",
    issueId: "10003",
    issueKey: "OPS-44",
    issueSummary: "Investigate missing worklogs in leadership view",
    projectKey: "OPS",
    authorAccountId: "u3",
    authorDisplayName: "Sam Lee",
    started: "2026-04-15T10:00:00.000+0530",
    timeSpentSeconds: 21600
  },
  {
    id: "6",
    issueId: "10002",
    issueKey: "ENG-102",
    issueSummary: "Integrate Jira users endpoint",
    projectKey: "ENG",
    authorAccountId: "u2",
    authorDisplayName: "Priya Sharma",
    started: "2026-04-15T09:30:00.000+0530",
    timeSpentSeconds: 27000
  }
];
