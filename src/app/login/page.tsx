import { redirect } from "next/navigation";
import { AnacityLogo } from "@/components/AnacityLogo";
import { getCurrentUser } from "@/lib/session";

export default async function LoginPage({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string; error_description?: string }>;
}) {
  const user = await getCurrentUser();
  if (user) redirect(user.role === "admin" ? "/" : "/time-logging");

  const params = (await searchParams) ?? {};
  const errorMessages: Record<string, string> = {
    no_code: "No authorization code received. Please try again.",
    state_mismatch: "Session mismatch. Please try again.",
    auth_failed: "Authentication failed. Please try again.",
    access_denied: "Access was denied. Please allow the required permissions.",
    unauthorized_client: "This Atlassian OAuth app is not allowed for this user yet. Check Distribution > Sharing or app ownership.",
    invalid_scope: "The Atlassian OAuth app scopes are invalid or missing. Review the configured scopes in Developer Console.",
    invalid_request: "The Atlassian OAuth request was rejected. Check the callback URL and app configuration.",
  };
  const errorMessage = params.error
    ? `${errorMessages[params.error] ?? `OAuth error: ${params.error}`}${params.error_description ? ` (${params.error_description})` : ""}`
    : null;

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-brand">
          <AnacityLogo variant="login" />
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
