"use server";

import { VisitType } from "@prisma/client";

import { getCurrentSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { CustomerProfile } from "@/components/previous-customer-lookup";
import { getStoreViewShell } from "@/lib/store-views";

const MAX_RESULTS = 5;

/**
 * Looks up previous customers by name for the check-in forms.
 *
 * This used to be done client-side over every customer from the last 12 months,
 * which meant serialising ~2,500 profiles into every Daily Log and Dashboard
 * page load. Searching on demand keeps those pages small and fast.
 */
export async function searchPreviousCustomers(
  storeSlug: string,
  rawQuery: string
): Promise<CustomerProfile[]> {
  const session = await getCurrentSession();
  if (!session.isAuthenticated) {
    return [];
  }

  const query = rawQuery.trim().toLowerCase().replace(/\s+/g, " ");
  if (query.length < 2) {
    return [];
  }

  const shell = await getStoreViewShell(storeSlug);
  if (!shell) {
    return [];
  }

  const twelveMonthsAgo = new Date();
  twelveMonthsAgo.setFullYear(twelveMonthsAgo.getFullYear() - 1);

  const appointments = await prisma.appointment.findMany({
    where: {
      storeId: { in: shell.storeIds },
      deletedAt: null,
      appointmentDate: { gte: twelveMonthsAgo },
      customer: { normalizedFullName: { contains: query } }
    },
    distinct: ["customerId"],
    orderBy: [{ customerId: "asc" }, { appointmentDate: "desc" }, { timeIn: "desc" }],
    take: MAX_RESULTS,
    select: {
      id: true,
      customerId: true,
      storeId: true,
      appointmentDate: true,
      appointmentTypeLabel: true,
      visitType: true,
      comments: true,
      leadSourceLabel: true,
      pricePointLabel: true,
      sizeLabel: true,
      purchased: true,
      otherPurchase: true,
      wearDate: true,
      customer: { select: { fullName: true, normalizedFullName: true } },
      assignedStaffMember: { select: { fullName: true } },
      location: { select: { name: true } }
    }
  });

  if (!appointments.length) {
    return [];
  }

  // "Has this customer ever purchased?" — only for the handful we're returning.
  const purchased = await prisma.appointment.findMany({
    where: {
      customerId: { in: appointments.map((a) => a.customerId) },
      deletedAt: null,
      purchased: true
    },
    distinct: ["customerId"],
    select: { customerId: true }
  });
  const purchasedIds = new Set(purchased.map((p) => p.customerId));
  const storeNamesById = new Map(shell.sourceStores.map((s) => [s.id, s.name]));

  return appointments.map((appointment) => ({
    id: appointment.id,
    guestName: appointment.customer.fullName,
    normalizedGuestName: appointment.customer.normalizedFullName,
    lastVisitDate: appointment.appointmentDate.toISOString().slice(0, 10),
    appointmentType: appointment.appointmentTypeLabel,
    visitType: (appointment.visitType === VisitType.WALK_IN ? "Walk-in" : "Appointment") as
      | "Appointment"
      | "Walk-in",
    assignedTo: appointment.assignedStaffMember?.fullName || "",
    location: appointment.location?.name || "",
    wearDate: appointment.wearDate ? appointment.wearDate.toISOString().slice(0, 10) : "",
    heardAbout: appointment.leadSourceLabel || "",
    pricePoint: appointment.pricePointLabel || "",
    size: appointment.sizeLabel || "",
    purchased: appointment.purchased === null ? "" : appointment.purchased ? "Yes" : "No",
    otherSale: appointment.otherPurchase === null ? "" : appointment.otherPurchase ? "Yes" : "No",
    comments: appointment.comments || "",
    hasPreviousPurchase: purchasedIds.has(appointment.customerId),
    storeId: appointment.storeId,
    storeName: storeNamesById.get(appointment.storeId) || ""
  }));
}
