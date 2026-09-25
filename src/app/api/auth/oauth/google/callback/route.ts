import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createSession } from "@/lib/auth";
import { knownDeviceCookie, knownDeviceCookieName } from "@/lib/rate-limit";
import { completeSocialAuthorization, socialAuthFailurePath } from "@/lib/social-auth";

export async function GET(request: Request) {
  const url = new URL(request.url);
  let destination: string;
  try {
    const result = await completeSocialAuthorization({ provider: "GOOGLE", state: url.searchParams.get("state") ?? "", code: url.searchParams.get("code") ?? "", canceled: Boolean(url.searchParams.get("error")) });
    await createSession(result.userId);
    // This browser has now signed in to the account: the sign-in abuse limits no longer apply to it.
    const store = await cookies();
    const device = knownDeviceCookie(store.get(knownDeviceCookieName())?.value, result.userId);
    store.set(device.name, device.value, device.options);
    destination = result.returnTo;
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error;
    // Only our own fixed wording is signed for the page: back to the invitation the sign-up started from, else to sign-in.
    destination = await socialAuthFailurePath("GOOGLE", error);
  }
  redirect(destination);
}
