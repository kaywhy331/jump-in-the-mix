import { redirect } from "next/navigation";
import { createSession } from "@/lib/auth";
import { withSignedError } from "@/lib/form-errors";
import { SocialAuthError, completeSocialAuthorization } from "@/lib/social-auth";

export async function GET(request: Request) {
  const url = new URL(request.url);
  try {
    if (url.searchParams.get("error")) throw new SocialAuthError("Google sign-in was canceled.");
    const result = await completeSocialAuthorization({ provider: "GOOGLE", state: url.searchParams.get("state") ?? "", code: url.searchParams.get("code") ?? "" });
    await createSession(result.userId);
    redirect(result.returnTo);
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error;
    // Only our own fixed wording reaches the sign-in page (signed); anything unexpected gets a fixed sentence.
    const message = error instanceof SocialAuthError ? error.message : "Google sign-in could not be completed. Please try again.";
    redirect(withSignedError("/login", message));
  }
}
