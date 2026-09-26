-- Minutes kept free before and after each appointment when checking for conflicts.
-- Existing businesses keep booking back to back until they choose a buffer.
ALTER TABLE "WorkspacePreference" ADD COLUMN IF NOT EXISTS "appointmentBufferMinutes" INTEGER NOT NULL DEFAULT 0;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'WorkspacePreference_appointment_buffer_check') THEN
    ALTER TABLE "WorkspacePreference" ADD CONSTRAINT "WorkspacePreference_appointment_buffer_check" CHECK (
      "appointmentBufferMinutes" BETWEEN 0 AND 240
    );
  END IF;
END $$;
