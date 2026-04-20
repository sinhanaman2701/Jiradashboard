import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";

export default async function LoginPage({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string }>;
}) {
  const session = await getSession();
  if (session.user) {
    redirect(session.user.role === "admin" ? "/" : "/time-logging");
  }

  const params = (await searchParams) ?? {};
  const errorMessages: Record<string, string> = {
    no_code: "No authorization code received. Please try again.",
    state_mismatch: "Session mismatch. Please try again.",
    auth_failed: "Authentication failed. Please try again.",
    access_denied: "Access was denied. Please allow the required permissions.",
  };
  const errorMessage = params.error ? (errorMessages[params.error] ?? "Something went wrong.") : null;

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-brand">
          <div className="logo-mark" aria-hidden="true">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <rect x="1" y="1" width="5" height="5" rx="1.2" fill="white" opacity="0.9" />
              <rect x="8" y="1" width="5" height="5" rx="1.2" fill="white" opacity="0.6" />
              <rect x="1" y="8" width="5" height="5" rx="1.2" fill="white" opacity="0.6" />
              <rect x="8" y="8" width="5" height="5" rx="1.2" fill="white" opacity="0.3" />
            </svg>
          </div>
          <span className="login-app-name">Worklog</span>
        </div>

        <h1 className="login-title">Sign in to continue</h1>
        <p className="login-copy">
          Connect your Atlassian account to log work and view your team&apos;s activity.
        </p>

        {errorMessage && <div className="login-error">{errorMessage}</div>}

        <a href="/api/auth/login" className="atlassian-login-button">
          <svg width="18" height="18" viewBox="0 0 32 32" fill="none">
            <path d="M15.252 2.003c-.362-.488-1.073-.49-1.437-.003L7.07 11.67A10.01 10.01 0 0 0 5.5 17c0 5.799 4.7 10.5 10.5 10.5S26.5 22.8 26.5 17a10.01 10.01 0 0 0-1.57-5.33L15.252 2.003ZM16 22a5 5 0 1 1 0-10 5 5 0 0 1 0 10Z" fill="#0052CC" />
          </svg>
          Sign in with Atlassian
        </a>

        <p className="login-footer">
          Your credentials are used only to log work on your behalf in Jira.
        </p>
      </div>
    </div>
  );
}
