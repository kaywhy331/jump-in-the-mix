-- A plan enrollment bound to one local appointment, so every follow-up it generates keeps a
-- stable identity across appointment moves (drafts, snoozes and recorded attempts stay with the
-- row). Bindings never send automatically unless the owner turns that on, can be held on their
-- own, and record their last evaluation. Appointments gain typed details for bound messages.
ALTER TABLE "CalendarEntry" ADD COLUMN     "details" TEXT,
ADD COLUMN     "link" TEXT,
ADD COLUMN     "location" TEXT,
ALTER COLUMN "updatedAt" DROP DEFAULT;

ALTER TABLE "Jump" ADD COLUMN     "appointmentBindingId" TEXT;

CREATE TABLE "AppointmentBinding" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "calendarEntryId" TEXT NOT NULL,
    "mixId" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "automaticDelivery" BOOLEAN NOT NULL DEFAULT false,
    "heldAt" TIMESTAMP(3),
    "lastEvaluatedAt" TIMESTAMP(3),
    "lastEvaluationError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppointmentBinding_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AppointmentBinding_assignmentId_key" ON "AppointmentBinding"("assignmentId");

CREATE INDEX "AppointmentBinding_workspaceId_calendarEntryId_idx" ON "AppointmentBinding"("workspaceId", "calendarEntryId");

CREATE INDEX "AppointmentBinding_contactId_idx" ON "AppointmentBinding"("contactId");

CREATE UNIQUE INDEX "AppointmentBinding_calendarEntryId_mixId_key" ON "AppointmentBinding"("calendarEntryId", "mixId");

ALTER TABLE "AppointmentBinding" ADD CONSTRAINT "AppointmentBinding_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AppointmentBinding" ADD CONSTRAINT "AppointmentBinding_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AppointmentBinding" ADD CONSTRAINT "AppointmentBinding_calendarEntryId_fkey" FOREIGN KEY ("calendarEntryId") REFERENCES "CalendarEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AppointmentBinding" ADD CONSTRAINT "AppointmentBinding_mixId_fkey" FOREIGN KEY ("mixId") REFERENCES "Mix"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AppointmentBinding" ADD CONSTRAINT "AppointmentBinding_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "MixAssignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Jump" ADD CONSTRAINT "Jump_appointmentBindingId_fkey" FOREIGN KEY ("appointmentBindingId") REFERENCES "AppointmentBinding"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Jump_appointmentBindingId_idx" ON "Jump"("appointmentBindingId");
