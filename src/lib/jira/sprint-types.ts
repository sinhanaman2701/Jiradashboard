export interface SprintProject {
  id: string;
  key: string;
  name: string;
}

export interface SprintBoard {
  id: number;
  name: string;
  projectKey: string;
  projectName: string;
}

export interface Sprint {
  id: number;
  name: string;
  state: "active" | "closed" | "future";
  startDate?: string;
  endDate?: string;
  boardId: number;
}

export interface SprintIssueUserBreakdown {
  accountId: string;
  displayName: string;
  loggedSeconds: number;
  loggedHours: number;
}

export interface SprintIssue {
  id: string;
  key: string;
  summary: string;
  issueTypeName?: string;
  parentKey?: string;
  parentSummary?: string;
  assigneeAccountId?: string;
  assigneeDisplayName?: string;
  statusName?: string;
  eta: string;
  sprintGoal: string; // value from Sprint Goal select field, e.g. "In Progress"
  previousLoggedSeconds: number;
  previousLoggedHours: number;
  sprintLoggedSeconds: number;
  sprintLoggedHours: number;
  totalLoggedSeconds: number;
  totalLoggedHours: number;
  previousUserBreakdown: SprintIssueUserBreakdown[];
  userBreakdown: SprintIssueUserBreakdown[];
}

export interface SprintResult {
  sprintId: number;
  sprintName: string;
  state: "active" | "closed" | "future";
  startDate?: string;
  endDate?: string;
  projectKey: string;
  projectName: string;
  issues: SprintIssue[];
}
