import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { TimeLogShell } from "@/components/TimeLogShell";

export default async function TimeLoggingPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return <TimeLogShell user={user} />;
}
