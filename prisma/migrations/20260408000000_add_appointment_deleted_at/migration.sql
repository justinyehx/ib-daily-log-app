ALTER TABLE "Appointment" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "Appointment_storeId_deletedAt_appointmentDate_idx"
ON "Appointment"("storeId", "deletedAt", "appointmentDate");
