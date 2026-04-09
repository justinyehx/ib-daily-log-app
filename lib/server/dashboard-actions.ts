"use server";

import { AppointmentStatus, StoreOptionKind, VisitType } from "@prisma/client";
import { revalidatePath } from "next/cache";

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

export async function createDashboardCheckIn(formData: FormData) {
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
  const bridalLiveAppointmentId = asString(formData.get("bridalLiveAppointmentId"));

  if (!storeId || !guestName || !appointmentTypeOptionId) {
    throw new Error("Store, guest name, and appointment type are required.");
  }

  const [
    store,
    appointmentTypeOption,
    assignedStaffMember,
    location,
    leadSourceOption,
    pricePointOption,
    sizeOption,
    bridalLiveAppointment
  ] =
    await Promise.all([
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
        : Promise.resolve(null),
      bridalLiveAppointmentId
        ? prisma.bridalLiveAppointment.findFirst({
            where: {
              id: bridalLiveAppointmentId,
              storeId,
              dailyLogEntryId: null
            }
          })
        : Promise.resolve(null)
    ]);

  if (!store || !appointmentTypeOption) {
    throw new Error("Store or appointment type could not be found.");
  }

  const normalizedGuestName = normalizeName(guestName);
  const today = new Date();
  const baseDate = appointmentDateInput || today.toISOString().slice(0, 10);
  const appointmentDate = new Date(`${baseDate}T00:00:00`);
  const timeIn = buildClientDateTime(baseDate, timeInInput, timeInOffsetMinutes) ?? today;
  const timeOut = buildClientDateTime(baseDate, timeOutInput, timeOutOffsetMinutes);
  const wearDate = wearDateInput ? new Date(`${wearDateInput}T00:00:00`) : null;

  const existingCustomer =
    await prisma.customer.findFirst({
      where: {
        storeId,
        normalizedFullName: normalizedGuestName
      },
      orderBy: {
        updatedAt: "desc"
      }
    });

  const customer = existingCustomer
    ? await prisma.customer.update({
        where: { id: existingCustomer.id },
        data: {
          fullName: guestName,
          phone: bridalLiveAppointment?.guestPhone || existingCustomer.phone,
          email: bridalLiveAppointment?.guestEmail || existingCustomer.email
        }
      })
    : await prisma.customer.create({
        data: {
          storeId,
          fullName: guestName,
          normalizedFullName: normalizedGuestName,
          phone: bridalLiveAppointment?.guestPhone || null,
          email: bridalLiveAppointment?.guestEmail || null
        }
      });

  const visitType =
    visitTypeInput === VisitType.WALK_IN || appointmentTypeOption.kind === StoreOptionKind.WALK_IN_TYPE
      ? VisitType.WALK_IN
      : VisitType.APPOINTMENT;

  const shouldWait = !assignedStaffMember || location?.normalizedName === "waiting";
  const explicitStatus =
    statusInput === AppointmentStatus.COMPLETE
      ? AppointmentStatus.COMPLETE
      : statusInput === AppointmentStatus.WAITING
        ? AppointmentStatus.WAITING
        : statusInput === AppointmentStatus.ACTIVE
          ? AppointmentStatus.ACTIVE
          : null;
  const resolvedStatus = explicitStatus || (shouldWait ? AppointmentStatus.WAITING : AppointmentStatus.ACTIVE);

  const appointment = await prisma.appointment.create({
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
      managerApprovalRequired:
        appointmentTypeOption.label === "New Bride - No Try On" ||
        appointmentTypeOption.label === "Special Occasion - No Try On",
      checkedOutAt: resolvedStatus === AppointmentStatus.COMPLETE ? timeOut || timeIn : null
    }
  });

  if (bridalLiveAppointment) {
    await prisma.bridalLiveAppointment.update({
      where: { id: bridalLiveAppointment.id },
      data: {
        dailyLogEntryId: appointment.id,
        isCheckedIn: true
      }
    });
  }

  revalidatePath("/dashboard");
  revalidatePath("/daily-log");
}

export async function updateCurrentCustomerStatus(formData: FormData) {
  const appointmentId = asString(formData.get("appointmentId"));
  const nextStatusInput = asString(formData.get("nextStatus"));

  if (!appointmentId || !nextStatusInput) {
    throw new Error("Appointment and status are required.");
  }

  const nextStatus =
    nextStatusInput === AppointmentStatus.WAITING ? AppointmentStatus.WAITING : AppointmentStatus.ACTIVE;

  await prisma.appointment.update({
    where: { id: appointmentId },
    data: {
      status: nextStatus
    }
  });

  revalidatePath("/dashboard");
  revalidatePath("/daily-log");
}

export async function quickCheckoutCurrentCustomer(formData: FormData) {
  const appointmentId = asString(formData.get("appointmentId"));
  const appointmentDateInput = asString(formData.get("appointmentDate"));
  const timeOutInput = asString(formData.get("timeOut"));
  const timeOutOffsetMinutes = asString(formData.get("timeOutOffsetMinutes"));
  const purchasedInput = asString(formData.get("purchased"));
  const otherPurchaseInput = asString(formData.get("otherPurchase"));
  const comments = asString(formData.get("comments"));
  const reasonDidNotBuyOptionId = asString(formData.get("reasonDidNotBuyOptionId"));
  const assignedStaffMemberId = asString(formData.get("assignedStaffMemberId"));
  const wearDateInput = asString(formData.get("wearDate"));
  const leadSourceOptionId = asString(formData.get("leadSourceOptionId"));
  const pricePointOptionId = asString(formData.get("pricePointOptionId"));
  const sizeOptionId = asString(formData.get("sizeOptionId"));
  const cbAppointmentScheduledInput = asString(formData.get("cbAppointmentScheduled"));
  const cbAppointmentAtInput = asString(formData.get("cbAppointmentAt"));
  const approvalPassword = asString(formData.get("approvalPassword"));

  if (!appointmentId) {
    throw new Error("Appointment is required.");
  }

  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId }
  });

  if (!appointment) {
    throw new Error("Appointment could not be found.");
  }

  const baseDate = appointmentDateInput || appointment.appointmentDate.toISOString().slice(0, 10);
  const resolvedTimeOut = buildClientDateTime(baseDate, timeOutInput, timeOutOffsetMinutes) || new Date();
  const purchased = purchasedInput === "Yes" ? true : purchasedInput === "No" ? false : null;
  const otherPurchase =
    otherPurchaseInput === "Yes" ? true : otherPurchaseInput === "No" ? false : null;
  const isAlteration = appointment.appointmentTypeLabel.toLowerCase().includes("alteration");
  const requiresApproval =
    appointment.appointmentTypeLabel === "New Bride - No Try On" ||
    appointment.appointmentTypeLabel === "Special Occasion - No Try On";

  if (requiresApproval && !["manager123", "admin123"].includes(approvalPassword)) {
    throw new Error("Manager or admin approval is required for this checkout.");
  }

  const reasonDidNotBuyOption = reasonDidNotBuyOptionId
    ? await prisma.storeOption.findFirst({
        where: {
          id: reasonDidNotBuyOptionId,
          storeId: appointment.storeId,
          kind: StoreOptionKind.REASON_DID_NOT_BUY,
          isActive: true
        }
      })
    : null;

  const [assignedStaffMember, leadSourceOption, pricePointOption, sizeOption] = await Promise.all([
    assignedStaffMemberId
      ? prisma.staffMember.findFirst({
          where: {
            id: assignedStaffMemberId,
            storeId: appointment.storeId,
            isActive: true
          }
        })
      : Promise.resolve(null),
    leadSourceOptionId
      ? prisma.storeOption.findFirst({
          where: {
            id: leadSourceOptionId,
            storeId: appointment.storeId,
            kind: StoreOptionKind.LEAD_SOURCE,
            isActive: true
          }
        })
      : Promise.resolve(null),
    pricePointOptionId
      ? prisma.storeOption.findFirst({
          where: {
            id: pricePointOptionId,
            storeId: appointment.storeId,
            kind: StoreOptionKind.PRICE_POINT,
            isActive: true
          }
        })
      : Promise.resolve(null),
    sizeOptionId
      ? prisma.storeOption.findFirst({
          where: {
            id: sizeOptionId,
            storeId: appointment.storeId,
            kind: StoreOptionKind.SIZE,
            isActive: true
          }
        })
      : Promise.resolve(null)
  ]);

  const wearDate = wearDateInput ? new Date(`${wearDateInput}T00:00:00`) : null;
  const cbAppointmentAt = cbAppointmentAtInput ? new Date(cbAppointmentAtInput) : null;

  await prisma.appointment.update({
    where: { id: appointmentId },
    data: {
      assignedStaffMemberId: assignedStaffMember?.id || appointment.assignedStaffMemberId,
      status: AppointmentStatus.COMPLETE,
      timeOut: resolvedTimeOut,
      checkedOutAt: new Date(),
      wearDate: wearDate || appointment.wearDate,
      leadSourceOptionId: leadSourceOption?.id || appointment.leadSourceOptionId,
      leadSourceLabel: leadSourceOption?.label || appointment.leadSourceLabel,
      pricePointOptionId: pricePointOption?.id || appointment.pricePointOptionId,
      pricePointLabel: pricePointOption?.label || appointment.pricePointLabel,
      sizeOptionId: sizeOption?.id || appointment.sizeOptionId,
      sizeLabel: sizeOption?.label || appointment.sizeLabel,
      purchased: isAlteration ? true : purchased,
      otherPurchase,
      comments: comments || null,
      reasonDidNotBuyOptionId: !isAlteration && purchased === false ? reasonDidNotBuyOption?.id || null : null,
      reasonDidNotBuyLabel: !isAlteration && purchased === false ? reasonDidNotBuyOption?.label || null : null,
      cbAppointmentScheduled: !isAlteration && purchased === false ? cbAppointmentScheduledInput === "Yes" : false,
      cbAppointmentAt: !isAlteration && purchased === false && cbAppointmentScheduledInput === "Yes" ? cbAppointmentAt : null
    }
  });

  revalidatePath("/dashboard");
  revalidatePath("/daily-log");
}
