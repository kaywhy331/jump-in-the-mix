import { cookies } from "next/headers";
import { getCurrentSession } from "@/lib/auth";
import { env } from "@/lib/env";

export async function SupportViewRecovery() {
  if (!(await cookies()).get(env.impersonationCookieName)?.value) return null;
  const session = await getCurrentSession();
  if (session?.impersonation) return null;
  return <aside className="notice info" aria-label="Previous support session">
    <p>Your previous support view has ended. Clear it to continue signing in or making changes.</p>
    <form action="/api/admin/impersonation/end" method="post"><button className="button" type="submit">Clear ended support view</button></form>
  </aside>;
}
