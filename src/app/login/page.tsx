import { redirect } from "next/navigation";
import { auth, isGitHubConfigured } from "~/lib/auth.server";
import { headers } from "next/headers";
import LoginForm from "./LoginForm";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const headersList = await headers();
  const session = await auth.api.getSession({ headers: headersList });

  if (session) redirect("/models");

  const { callbackUrl } = await searchParams;
  return (
    <LoginForm
      callbackUrl={callbackUrl}
      githubConfigured={isGitHubConfigured}
    />
  );
}
