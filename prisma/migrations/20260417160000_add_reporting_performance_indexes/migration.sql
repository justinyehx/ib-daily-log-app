CREATE INDEX IF NOT EXISTS "Appointment_storeId_deletedAt_status_appointmentDate_idx"
ON "Appointment"("storeId", "deletedAt", "status", "appointmentDate");

CREATE INDEX IF NOT EXISTS "Appointment_storeId_deletedAt_visitType_appointmentDate_idx"
ON "Appointment"("storeId", "deletedAt", "visitType", "appointmentDate");

CREATE INDEX IF NOT EXISTS "Appointment_storeId_deletedAt_assignedStaffMemberId_appointmentDate_idx"
ON "Appointment"("storeId", "deletedAt", "assignedStaffMemberId", "appointmentDate");

CREATE INDEX IF NOT EXISTS "BridalLiveAppointment_storeId_appointmentDate_isNoShow_isCheckedIn_idx"
ON "BridalLiveAppointment"("storeId", "appointmentDate", "isNoShow", "isCheckedIn");
