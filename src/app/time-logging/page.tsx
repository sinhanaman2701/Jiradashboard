import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { TimeLogShell } from "@/components/TimeLogShell";

export default async function TimeLoggingPage({
  searchParams,
}: {
  searchParams?: Promise<{ view?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const params = (await searchParams) ?? {};
  const view = user.role === "admin" && params.view === "team" ? "team" : "my";
  return <TimeLogShell user={user} view={view} />;
}
