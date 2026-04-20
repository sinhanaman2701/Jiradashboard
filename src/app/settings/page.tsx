import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { SettingsShell } from "@/components/SettingsShell";
import { getCachedUsers, isJiraConfigured } from "@/lib/jira/client";
import { mockUsers } from "@/lib/jira/mock-data";

export default async function SettingsPage() {
  const session = await getSession();
  if (!session.user) redirect("/login");
  if (session.user.role !== "admin") redirect("/time-logging");

  const users = isJiraConfigured() ? await getCachedUsers() : mockUsers;
  return <SettingsShell users={users} />;
}
