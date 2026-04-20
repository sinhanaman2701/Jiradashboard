import type { Metadata } from "next";
import "@/app/globals.css";

export const metadata: Metadata = {
  title: "Jira Dashboard",
  description: "Standalone Jira dashboard MVP v1 for worklog visibility."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
