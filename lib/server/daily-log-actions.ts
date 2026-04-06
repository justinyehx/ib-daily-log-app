"use server";

import { AppointmentStatus, StoreOptionKind, VisitType } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { normalizeName } from "@/lib/strings";

function asString(value: FormDataEntryValue | null) {
  if (typeof value !== "string") return "";
  return value.trim();
}

function buildClientDateTime(baseDate: string, timeValue: string, offsetMinutesInput: string) {
  if (!timeValue) return null;

  const [year, month, day] = baseDate.split("-").map((value) => Number.parseInt(value, 10));
  const [hours, minutes] = timeValue.split(":").map((value) => Number.parseInt(value, 10));
  const offsetMinutes = Number.parseInt(offsetMinutesInput || "0", 10);

  return new Date(Date.UTC(year, month - 1, day, hours, minutes) + offsetMinutes * 60_000);
}

async function resolveAppointmentRelations({
  storeId,
  appointmentTypeOptionId,
  assignedStaffMemberId,
  locationId,
  leadSourceOptionId,
  pricePointOptionId,
  sizeOptionId
}: {
  storeId: string;
  appointmentTypeOptionId: string;
  assignedStaffMemberId: string;
  locationId: string;
  leadSourceOptionId: string;
  pricePointOptionId: string;
  sizeOptionId: string;
}) {
  const [
    store,
    appointmentTypeOption,
    assignedStaffMember,
    location,
    leadSourceOption,
    pricePointOption,
    sizeOption
  ] = await Promise.all([
    prisma.store.findUnique({
      where: { id: storeId }
    }),
    prisma.storeOption.findFirst({
      where: {
        id: appointmentTypeOptionId,
        storeId,
        kind: {
          in: [StoreOptionKind.APPOINTMENT_TYPE, StoreOptionKind.WALK_IN_TYPE]
        }
      }
    }),
    assignedStaffMemberId
      ? prisma.staffMember.findFirst({
          where: {
            id: assignedStaffMemberId,
            storeId,
            isActive: true
          }
        })
      : Promise.resolve(null),
    locationId
      ? prisma.location.findFirst({
          where: {
            id: locationId,
            storeId,
            isActive: true
          }
        })
      : Promise.resolve(null),
    leadSourceOptionId
      ? prisma.storeOption.findFirst({
          where: {
            id: leadSourceOptionId,
            storeId,
            kind: StoreOptionKind.LEAD_SOURCE,
            isActive: true
          }
        })
      : Promise.resolve(null),
    pricePointOptionId
      ? prisma.storeOption.findFirst({
          where: {
            id: pricePointOptionId,
            storeId,
            kind: StoreOptionKind.PRICE_POINT,
            isActive: true
          }
        })
      : Promise.resolve(null),
    sizeOptionId
      ? prisma.storeOption.findFirst({
          where: {
            id: sizeOptionId,
            storeId,
            kind: StoreOptionKind.SIZE,
            isActive: true
          }
        })
      : Promise.resolve(null)
  ]);

  if (!store || !appointmentTypeOption) {
    throw new Error("Store or appointment type could not be found.");
  }

  return {
    store,
    appointmentTypeOption,
    assignedStaffMember,
    location,
    leadSourceOption,
    pricePointOption,
    sizeOption
  };
}

export async function createDailyLogEntry(formData: FormData) {
  const storeId = asString(formData.get("storeId"));
  const guestName = asString(formData.get("guestName"));
  const visitTypeInput = asString(formData.get("visitType"));
  const appointmentTypeOptionId = asString(formData.get("appointmentTypeOptionId"));
  const assignedStaffMemberId = asString(formData.get("assignedStaffMemberId"));
  const locationId = asString(formData.get("locationId"));
  const leadSourceOptionId = asString(formData.get("leadSourceOptionId"));
  const pricePointOptionId = asString(formData.get("pricePointOptionId"));
  const sizeOptionId = asString(formData.get("sizeOptionId"));
  const comments = asString(formData.get("comments"));
  const appointmentDateInput = asString(formData.get("appointmentDate"));
  const timeInInput = asString(formData.get("timeIn"));
  const timeInOffsetMinutes = asString(formData.get("timeInOffsetMinutes"));
  const timeOutInput = asString(formData.get("timeOut"));
  const timeOutOffsetMinutes = asString(formData.get("timeOutOffsetMinutes"));
  const wearDateInput = asString(formData.get("wearDate"));
  const statusInput = asString(formData.get("status"));

  if (!storeId || !guestName || !appointmentTypeOptionId || !appointmentDateInput || !timeInInput) {
    throw new Error("Store, guest name, appointment type, date, and time in are required.");
  }

  const {
    appointmentTypeOption,
    assignedStaffMember,
    location,
    leadSourceOption,
    pricePointOption,
    sizeOption
  } = await resolveAppointmentRelations({
    storeId,
    appointmentTypeOptionId,
    assignedStaffMemberId,
    locationId,
    leadSourceOptionId,
    pricePointOptionId,
    sizeOptionId
  });

  const normalizedGuestName = normalizeName(guestName);
  const appointmentDate = new Date(`${appointmentDateInput}T00:00:00`);
  const timeIn = buildClientDateTime(appointmentDateInput, timeInInput, timeInOffsetMinutes);
  const timeOut = buildClientDateTime(appointmentDateInput, timeOutInput, timeOutOffsetMinutes);
  const wearDate = wearDateInput ? new Date(`${wearDateInput}T00:00:00`) : null;

  if (!timeIn) {
    throw new Error("Time in is required.");
  }

  const customer =
    (await prisma.customer.findFirst({
      where: {
        storeId,
        normalizedFullName: normalizedGuestName
      },
      orderBy: {
        updatedAt: "desc"
      }
    })) ||
    (await prisma.customer.create({
      data: {
        storeId,
        fullName: guestName,
        normalizedFullName: normalizedGuestName
      }
    }));

  const visitType =
    visitTypeInput === VisitType.WALK_IN || appointmentTypeOption.kind === StoreOptionKind.WALK_IN_TYPE
      ? VisitType.WALK_IN
      : VisitType.APPOINTMENT;

  const resolvedStatus =
    statusInput === AppointmentStatus.COMPLETE
      ? AppointmentStatus.COMPLETE
      : statusInput === AppointmentStatus.WAITING
        ? AppointmentStatus.WAITING
        : AppointmentStatus.ACTIVE;

  await prisma.appointment.create({
    data: {
      storeId,
      customerId: customer.id,
      assignedStaffMemberId: assignedStaffMember?.id || null,
      locationId: location?.id || null,
      appointmentDate,
      timeIn,
      timeOut,
      wearDate,
      visitType,
      appointmentTypeOptionId: appointmentTypeOption.id,
      appointmentTypeLabel: appointmentTypeOption.label,
      leadSourceOptionId: leadSourceOption?.id || null,
      leadSourceLabel: leadSourceOption?.label || null,
      pricePointOptionId: pricePointOption?.id || null,
      pricePointLabel: pricePointOption?.label || null,
      sizeOptionId: sizeOption?.id || null,
      sizeLabel: sizeOption?.label || null,
      status: resolvedStatus,
      comments: comments || null,
      checkedOutAt: resolvedStatus === AppointmentStatus.COMPLETE ? timeOut || timeIn : null
    }
  });

  revalidatePath("/dashboard");
  revalidatePath("/daily-log");
}

export async function updateDailyLogEntry(formData: FormData) {
  const appointmentId = asString(formData.get("appointmentId"));
  const guestName = asString(formData.get("guestName"));
  const appointmentTypeOptionId = asString(formData.get("appointmentTypeOptionId"));
  const assignedStaffMemberId = asString(formData.get("assignedStaffMemberId"));
  const locationId = asString(formData.get("locationId"));
  const leadSourceOptionId = asString(formData.get("leadSourceOptionId"));
  const pricePointOptionId = asString(formData.get("pricePointOptionId"));
  const sizeOptionId = asString(formData.get("sizeOptionId"));
  const comments = asString(formData.get("comments"));
  const appointmentDateInput = asString(formData.get("appointmentDate"));
  const timeInInput = asString(formData.get("timeIn"));
  const timeInOffsetMinutes = asString(formData.get("timeInOffsetMinutes"));
  const timeOutInput = asString(formData.get("timeOut"));
  const timeOutOffsetMinutes = asString(formData.get("timeOutOffsetMinutes"));
  const wearDateInput = asString(formData.get("wearDate"));
  const visitTypeInput = asString(formData.get("visitType"));
  const statusInput = asString(formData.get("status"));

  if (!appointmentId || !guestName || !appointmentTypeOptionId || !appointmentDateInput || !timeInInput) {
    throw new Error("Appointment, guest name, appointment type, date, and time in are required.");
  }

  const existingAppointment = await prisma.appointment.findUnique({
    where: { id: appointmentId }
  });

  if (!existingAppointment) {
    throw new Error("Appointment could not be found.");
  }

  const {
    appointmentTypeOption,
    assignedStaffMember,
    location,
    leadSourceOption,
    pricePointOption,
    sizeOption
  } = await resolveAppointmentRelations({
    storeId: existingAppointment.storeId,
    appointmentTypeOptionId,
    assignedStaffMemberId,
    locationId,
    leadSourceOptionId,
    pricePointOptionId,
    sizeOptionId
  });

  const normalizedGuestName = normalizeName(guestName);
  const appointmentDate = new Date(`${appointmentDateInput}T00:00:00`);
  const timeIn = buildClientDateTime(appointmentDateInput, timeInInput, timeInOffsetMinutes);
  const timeOut = buildClientDateTime(appointmentDateInput, timeOutInput, timeOutOffsetMinutes);
  const wearDate = wearDateInput ? new Date(`${wearDateInput}T00:00:00`) : null;

  if (!timeIn) {
    throw new Error("Time in is required.");
  }

  const customer =
    (await prisma.customer.findFirst({
      where: {
        storeId: existingAppointment.storeId,
        normalizedFullName: normalizedGuestName
      },
      orderBy: {
        updatedAt: "desc"
      }
    })) ||
    (await prisma.customer.create({
      data: {
        storeId: existingAppointment.storeId,
        fullName: guestName,
        normalizedFullName: normalizedGuestName
      }
    }));

  const visitType =
    visitTypeInput === VisitType.WALK_IN || appointmentTypeOption.kind === StoreOptionKind.WALK_IN_TYPE
      ? VisitType.WALK_IN
      : VisitType.APPOINTMENT;

  const resolvedStatus =
    statusInput === AppointmentStatus.COMPLETE
      ? AppointmentStatus.COMPLETE
      : statusInput === AppointmentStatus.WAITING
        ? AppointmentStatus.WAITING
        : AppointmentStatus.ACTIVE;

  await prisma.appointment.update({
    where: { id: appointmentId },
    data: {
      customerId: customer.id,
      assignedStaffMemberId: assignedStaffMember?.id || null,
      locationId: location?.id || null,
      appointmentDate,
      timeIn,
      timeOut,
      wearDate,
      visitType,
      appointmentTypeOptionId: appointmentTypeOption.id,
      appointmentTypeLabel: appointmentTypeOption.label,
      leadSourceOptionId: leadSourceOption?.id || null,
      leadSourceLabel: leadSourceOption?.label || null,
      pricePointOptionId: pricePointOption?.id || null,
      pricePointLabel: pricePointOption?.label || null,
      sizeOptionId: sizeOption?.id || null,
      sizeLabel: sizeOption?.label || null,
      status: resolvedStatus,
      comments: comments || null,
      checkedOutAt: resolvedStatus === AppointmentStatus.COMPLETE ? timeOut || timeIn : null
    }
  });

  revalidatePath("/dashboard");
  revalidatePath("/daily-log");
}

export async function deleteDailyLogEntry(formData: FormData) {
  const appointmentId = asString(formData.get("appointmentId"));
  const returnTo = asString(formData.get("returnTo"));

  if (!appointmentId) {
    throw new Error("Appointment is required.");
  }

  await prisma.appointment.delete({
    where: { id: appointmentId }
  });

  revalidatePath("/dashboard");
  revalidatePath("/daily-log");

  redirect(`/daily-log${returnTo || ""}`);
}
