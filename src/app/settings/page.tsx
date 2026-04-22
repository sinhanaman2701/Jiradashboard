import { redirect } from "next/navigation";

export default function SettingsPage() {
  redirect("/?view=manage-team");
}
