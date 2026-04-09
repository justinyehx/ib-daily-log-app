ALTER TABLE "Store"
ADD COLUMN IF NOT EXISTS "bridalLiveSyncedAt" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "BridalLiveToken" (
  "id" TEXT NOT NULL,
  "token" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BridalLiveToken_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "BridalLiveAppointment" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "bridalLiveId" TEXT NOT NULL,
  "bridalLiveContactId" TEXT,
  "bridalLiveEmployeeId" TEXT,
  "guestFirstName" TEXT NOT NULL,
  "guestLastName" TEXT NOT NULL,
  "guestPhone" TEXT,
  "guestEmail" TEXT,
  "appointmentDate" DATE NOT NULL,
  "scheduledStart" TIMESTAMP(3) NOT NULL,
  "scheduledEnd" TIMESTAMP(3),
  "appointmentType" TEXT NOT NULL,
  "fittingRoom" TEXT,
  "associate" TEXT,
  "eventDate" DATE,
  "howHeard" TEXT,
  "notes" TEXT,
  "status" TEXT,
  "isConfirmed" BOOLEAN NOT NULL DEFAULT false,
  "isCheckedIn" BOOLEAN NOT NULL DEFAULT false,
  "isNoShow" BOOLEAN NOT NULL DEFAULT false,
  "dailyLogEntryId" TEXT,
  "rawPayload" JSONB,
  "syncedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BridalLiveAppointment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "BridalLiveAppointment_bridalLiveId_key"
ON "BridalLiveAppointment"("bridalLiveId");

CREATE UNIQUE INDEX IF NOT EXISTS "BridalLiveAppointment_dailyLogEntryId_key"
ON "BridalLiveAppointment"("dailyLogEntryId");

CREATE INDEX IF NOT EXISTS "BridalLiveAppointment_storeId_appointmentDate_idx"
ON "BridalLiveAppointment"("storeId", "appointmentDate");

CREATE INDEX IF NOT EXISTS "BridalLiveAppointment_storeId_isNoShow_appointmentDate_idx"
ON "BridalLiveAppointment"("storeId", "isNoShow", "appointmentDate");

ALTER TABLE "BridalLiveAppointment"
ADD CONSTRAINT "BridalLiveAppointment_storeId_fkey"
FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BridalLiveAppointment"
ADD CONSTRAINT "BridalLiveAppointment_dailyLogEntryId_fkey"
FOREIGN KEY ("dailyLogEntryId") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
