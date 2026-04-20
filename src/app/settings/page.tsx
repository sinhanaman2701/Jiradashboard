import { SettingsShell } from "@/components/SettingsShell";
import { getCachedUsers } from "@/lib/jira/client";
import { mockUsers } from "@/lib/jira/mock-data";
import { isJiraConfigured } from "@/lib/jira/client";

export default async function SettingsPage() {
  const users = isJiraConfigured() ? await getCachedUsers() : mockUsers;
  return <SettingsShell users={users} />;
}
