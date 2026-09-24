import { z } from "zod";
import { getCurrentSession } from "@/lib/auth";
import { setListingFavorite } from "@/lib/marketplace-service";
import { consumeRateLimit } from "@/lib/rate-limit";

const input = z.object({ listingId: z.string().min(1).max(160), favorite: z.boolean() }).strict();
const response = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
export async function POST(request: Request) {
  const session = await getCurrentSession(), member = session?.user.memberships[0];
  if (!session || !member) return response({ error: "Sign in to save favorites." }, 401);
  if (session.impersonation) return response({ error: "Administrator support sessions are view-only." }, 403);
  const limit = await consumeRateLimit({ scope: "api.marketplace-favorites", identifiers: [member.workspaceId, session.user.id], limit: 90, windowMs: 60000, blockMs: 60000 });
  if (!limit.allowed) return response({ error: "Too many changes. Try again shortly." }, 429);
  try {
    const raw = await request.text(); if (raw.length > 1000) return response({ error: "Invalid favorite." }, 400);
    const value = input.parse(JSON.parse(raw));
    return response(await setListingFavorite({ listingId: value.listingId, userId: session.user.id, workspaceId: member.workspaceId, favorite: value.favorite }));
  } catch (error) { return response({ error: error instanceof z.ZodError ? "Choose a share to favorite." : error instanceof Error ? error.message : "This favorite could not be saved." }, 400); }
}
