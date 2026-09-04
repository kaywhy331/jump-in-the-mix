import { redirect } from "next/navigation";
import { createSession } from "@/lib/auth";
import { completeSocialAuthorization } from "@/lib/social-auth";

export async function GET(request: Request) {
  const url = new URL(request.url);
  try {
    if (url.searchParams.get("error")) throw new Error("Google sign-in was canceled.");
    const result = await completeSocialAuthorization({ provider: "GOOGLE", state: url.searchParams.get("state") ?? "", code: url.searchParams.get("code") ?? "" });
    await createSession(result.userId);
    redirect(result.returnTo);
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error;
    const message = error instanceof Error ? error.message : "Google sign-in could not be completed.";
    redirect(`/login?error=${encodeURIComponent(message)}`);
  }
}
