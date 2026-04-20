import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { TimeLogShell } from "@/components/TimeLogShell";

export default async function TimeLoggingPage() {
  const session = await getSession();
  if (!session.user) redirect("/login");
  return <TimeLogShell user={session.user} />;
}
