import { redirect } from "next/navigation";
import { createSession } from "@/lib/auth";
import { completeSocialAuthorization } from "@/lib/social-auth";

async function complete(request: Request) {
  const values = request.method === "POST"
    ? await request.formData()
    : new URL(request.url).searchParams;
  try {
    if (values.get("error")) throw new Error("Apple sign-in was canceled.");
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
    const message = error instanceof Error ? error.message : "Apple sign-in could not be completed.";
    redirect(`/login?error=${encodeURIComponent(message)}`);
  }
}

export async function GET(request: Request) { return complete(request); }
export async function POST(request: Request) { return complete(request); }
