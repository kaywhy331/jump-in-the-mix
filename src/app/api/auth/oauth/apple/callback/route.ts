import { redirect } from "next/navigation";
import { createSession } from "@/lib/auth";
import { withSignedError } from "@/lib/form-errors";
import { SocialAuthError, completeSocialAuthorization } from "@/lib/social-auth";

async function complete(request: Request) {
  const values = request.method === "POST"
    ? await request.formData()
    : new URL(request.url).searchParams;
  try {
    if (values.get("error")) throw new SocialAuthError("Apple sign-in was canceled.");
    const result = await completeSocialAuthorization({
      provider: "APPLE",
      state: String(values.get("state") ?? ""),
      code: String(values.get("code") ?? ""),
      appleUser: values.get("user") ? String(values.get("user")) : null
    });
    await createSession(result.userId);
    redirect(result.returnTo);
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error;
    // Only our own fixed wording reaches the sign-in page (signed); anything unexpected gets a fixed sentence.
    const message = error instanceof SocialAuthError ? error.message : "Apple sign-in could not be completed. Please try again.";
    redirect(withSignedError("/login", message));
  }
}

export async function GET(request: Request) { return complete(request); }
export async function POST(request: Request) { return complete(request); }
