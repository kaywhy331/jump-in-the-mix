import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";

export class PilotRegistrationClosedError extends Error {
  constructor() {
    super("The owner account has already been created.");
    this.name = "PilotRegistrationClosedError";
  }
}

export function registrationAllowed(pilotMode: boolean, userCount: number): boolean {
  return !pilotMode || userCount === 0;
}

export async function pilotRegistrationOpen(): Promise<boolean> {
  if (!env.pilotMode) return true;
  return registrationAllowed(true, await prisma.user.count());
}
