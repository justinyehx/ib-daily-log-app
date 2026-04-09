import { type Store, VisitType } from "@prisma/client";

import { postBridalLive } from "@/lib/bridallive/client";
import {
  resolveBridalLiveDailyLogLabel,
  resolveBridalLiveVisitType
} from "@/lib/bridallive/type-mapping";
import type { BridalLiveAppointmentRecord, BridalLiveListResult } from "@/lib/bridallive/types";
import { prisma } from "@/lib/prisma";

function startOfDay(date: Date) {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
}

function endOfDay(date: Date) {
  const value = new Date(date);
  value.setHours(23, 59, 59, 999);
  return value;
}

function parseIsoDate(value: string | undefined | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getGuestNameParts(appointment: BridalLiveAppointmentRecord) {
  const firstName = appointment.contact?.firstName?.trim() || "";
  const lastName = appointment.contact?.lastName?.trim() || "";
  if (firstName || lastName) {
    return { firstName, lastName };
  }

  const fullName = appointment.contactName?.trim() || "";
  if (!fullName) {
    return { firstName: "Unknown", lastName: "Guest" };
  }

  const [first, ...rest] = fullName.split(/\s+/);
  return {
    firstName: first || "Unknown",
    lastName: rest.join(" ") || "Guest"
  };
}

function getAppointmentTypeLabel(appointment: BridalLiveAppointmentRecord) {
  return (
    appointment.typeDescription?.trim() ||
    appointment.appointmentType?.description?.trim() ||
    appointment.appointmentType?.name?.trim() ||
    "Unknown"
  );
}

export async function syncBridalLiveAppointmentsForStore(store: Pick<Store, "id" | "slug" | "name">, date = new Date()) {
  const start = startOfDay(date);
  const end = endOfDay(date);

  const response = await postBridalLive<
    BridalLiveListResult<BridalLiveAppointmentRecord>,
    {
      startDateTime: string;
      endDateTime: string;
    }
  >(
    store.slug,
    "/api/appointments/list",
    {
      startDateTime: start.toISOString(),
      endDateTime: end.toISOString()
    },
    {
      page: "1",
      size: "250",
      sortField: "startDateTime",
      sortDirection: "asc"
    }
  );

  const appointments = response.result || [];
  let imported = 0;
  let updated = 0;
  let skipped = 0;
  const unmappedTypes = new Set<string>();

  for (const appointment of appointments) {
    const bridalLiveId = String(appointment.id);
    const existing = await prisma.bridalLiveAppointment.findUnique({
      where: { bridalLiveId },
      select: { id: true, dailyLogEntryId: true }
    });

    if (existing?.dailyLogEntryId) {
      skipped += 1;
      continue;
    }

    const { firstName, lastName } = getGuestNameParts(appointment);
    const appointmentType = getAppointmentTypeLabel(appointment);
    if (!resolveBridalLiveDailyLogLabel(appointmentType)) {
      unmappedTypes.add(appointmentType);
    }

    const scheduledStart = parseIsoDate(appointment.startDateTime) || start;
    const scheduledEnd = parseIsoDate(appointment.endDateTime);
    const eventDate = parseIsoDate(appointment.contactEventDate);
    const appointmentDate = new Date(scheduledStart.toISOString().slice(0, 10));

    await prisma.bridalLiveAppointment.upsert({
      where: { bridalLiveId },
      update: {
        guestFirstName: firstName,
        guestLastName: lastName,
        guestPhone:
          appointment.mobilePhoneNumber || appointment.bestPhoneNumber || appointment.contact?.mobilePhoneNumber || null,
        guestEmail: appointment.email || appointment.emailAddress || appointment.contact?.emailAddress || null,
        bridalLiveContactId: appointment.contactId ? String(appointment.contactId) : null,
        bridalLiveEmployeeId: appointment.employeeId ? String(appointment.employeeId) : null,
        appointmentDate,
        scheduledStart,
        scheduledEnd,
        appointmentType,
        fittingRoom: appointment.fittingRoomDescription || null,
        associate:
          appointment.employeeName || appointment.employee?.employeeFullName || null,
        eventDate: eventDate ? new Date(eventDate.toISOString().slice(0, 10)) : null,
        howHeard: appointment.howHeardDescription || null,
        notes: appointment.notes || null,
        status: appointment.status || null,
        isConfirmed: Boolean(appointment.confirmed),
        isCheckedIn: Boolean(appointment.checkedIn),
        rawPayload: appointment,
        syncedAt: new Date()
      },
      create: {
        storeId: store.id,
        bridalLiveId,
        guestFirstName: firstName,
        guestLastName: lastName,
        guestPhone:
          appointment.mobilePhoneNumber || appointment.bestPhoneNumber || appointment.contact?.mobilePhoneNumber || null,
        guestEmail: appointment.email || appointment.emailAddress || appointment.contact?.emailAddress || null,
        bridalLiveContactId: appointment.contactId ? String(appointment.contactId) : null,
        bridalLiveEmployeeId: appointment.employeeId ? String(appointment.employeeId) : null,
        appointmentDate,
        scheduledStart,
        scheduledEnd,
        appointmentType,
        fittingRoom: appointment.fittingRoomDescription || null,
        associate:
          appointment.employeeName || appointment.employee?.employeeFullName || null,
        eventDate: eventDate ? new Date(eventDate.toISOString().slice(0, 10)) : null,
        howHeard: appointment.howHeardDescription || null,
        notes: appointment.notes || null,
        status: appointment.status || null,
        isConfirmed: Boolean(appointment.confirmed),
        isCheckedIn: Boolean(appointment.checkedIn),
        isNoShow: false,
        rawPayload: appointment,
        syncedAt: new Date()
      }
    });

    if (existing) {
      updated += 1;
    } else {
      imported += 1;
    }
  }

  await prisma.store.update({
    where: { id: store.id },
    data: {
      bridalLiveSyncedAt: new Date()
    }
  });

  return {
    storeSlug: store.slug,
    storeName: store.name,
    imported,
    updated,
    skipped,
    total: appointments.length,
    unmappedTypes: Array.from(unmappedTypes).sort()
  };
}

export function buildBridalLivePrefillVisitType(label: string) {
  return (resolveBridalLiveVisitType(label) === VisitType.WALK_IN ? "WALK_IN" : "APPOINTMENT") as
    | "WALK_IN"
    | "APPOINTMENT";
}
