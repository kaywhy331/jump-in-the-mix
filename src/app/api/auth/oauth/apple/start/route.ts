import { NextResponse } from "next/server";
import { createSocialAuthorization } from "@/lib/social-auth";

export async function GET(request: Request) {
  try {
    const url = await createSocialAuthorization("APPLE", new URL(request.url).searchParams.get("returnTo"));
    return NextResponse.redirect(url);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Apple sign-in could not be started.";
    return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(message)}`, request.url));
  }
}
