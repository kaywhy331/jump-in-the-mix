import { z } from "zod";
import { getCurrentSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { setMixFavorite } from "@/lib/mix-favorites";
import { consumeRateLimit } from "@/lib/rate-limit";

const input = z.object({ kind: z.enum(["mix", "template"]), id: z.string().min(1).max(160), favorite: z.boolean() }).strict();
const response = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
export async function POST(request: Request) {
  const session = await getCurrentSession(), member = session?.user.memberships[0];
  if (!session || !member) return response({ error: "Sign in to save favorites." }, 401);
  if (session.impersonation) return response({ error: "Administrator support sessions are view-only." }, 403);
  const limit = await consumeRateLimit({ scope: "api.mix-favorites", identifiers: [member.workspaceId, session.user.id], limit: 90, windowMs: 60000, blockMs: 60000 });
  if (!limit.allowed) return response({ error: "Too many changes. Try again shortly." }, 429);
  try {
    const raw = await request.text(); if (raw.length > 1000) return response({ error: "Invalid favorite." }, 400);
    const value = input.parse(JSON.parse(raw));
    return response(await prisma.$transaction(db => setMixFavorite(db, member.workspaceId, session.user.id, value, value.favorite)));
  } catch (error) { return response({ error: error instanceof z.ZodError ? "Choose a mix to favorite." : "This favorite could not be saved. Refresh and try again." }, 400); }
}
