import { AppointmentStatus, VisitType } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { getAllStoreChoices, getStoreViewShell } from "@/lib/store-views";

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

function formatTime(date: Date | null) {
  if (!date) return "—";

  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}

function formatTimeInputValue(date: Date) {
  const hours = `${date.getHours()}`.padStart(2, "0");
  const minutes = `${date.getMinutes()}`.padStart(2, "0");
  return `${hours}:${minutes}`;
}

function formatDuration(start: Date, end: Date | null) {
  const effectiveEnd = end ?? new Date();

  const diffMs = effectiveEnd.getTime() - start.getTime();
  const totalMinutes = Math.max(Math.round(diffMs / 60000), 0);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (!hours) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}

function durationInMinutes(start: Date, end: Date | null) {
  const effectiveEnd = end ?? new Date();
  return Math.max(Math.round((effectiveEnd.getTime() - start.getTime()) / 60000), 0);
}

function normalizeKey(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function dedupeByLabel<T extends { label: string }>(items: T[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = normalizeKey(item.label);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function dedupeByName<T extends { name: string }>(items: T[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = normalizeKey(item.name);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function getLatestYearWithLeadSource(appointments: Array<{ appointmentDate: Date; leadSourceLabel: string | null }>) {
  const years = appointments
    .filter((appointment) => appointment.leadSourceLabel)
    .map((appointment) => appointment.appointmentDate.getFullYear());

  return years.length ? Math.max(...years) : null;
}

function sortOptionsByYearFrequency<T extends { id: string; label: string }>(
  options: T[],
  appointments: Array<{ appointmentDate: Date; leadSourceLabel: string | null }>
) {
  const latestYear = getLatestYearWithLeadSource(appointments);
  if (!latestYear) {
    return options.slice().sort((a, b) => a.label.localeCompare(b.label));
  }

  const counts = appointments.reduce((acc, appointment) => {
    if (!appointment.leadSourceLabel || appointment.appointmentDate.getFullYear() !== latestYear) {
      return acc;
    }

    const key = normalizeKey(appointment.leadSourceLabel);
    acc.set(key, (acc.get(key) || 0) + 1);
    return acc;
  }, new Map<string, number>());

  return options.slice().sort((a, b) => {
    const countDifference = (counts.get(normalizeKey(b.label)) || 0) - (counts.get(normalizeKey(a.label)) || 0);
    if (countDifference !== 0) return countDifference;
    return a.label.localeCompare(b.label);
  });
}

export async function getDashboardData(storeSlug: string) {
  const shell = await getStoreViewShell(storeSlug);
  if (!shell) {
    return null;
  }
  const store = shell.store;

  const today = new Date();
  const dayStart = startOfDay(today);
  const dayEnd = endOfDay(today);

  const todaysAppointments = await prisma.appointment.findMany({
    where: {
      storeId: {
        in: shell.storeIds
      },
      appointmentDate: {
        gte: dayStart,
        lte: dayEnd
      }
    },
    include: {
      customer: true,
      assignedStaffMember: true,
      location: true
    },
    orderBy: [{ status: "asc" }, { timeIn: "asc" }]
  });

  const historicalAppointments = await prisma.appointment.findMany({
    where: {
      storeId: {
        in: shell.storeIds
      }
    },
    include: {
      customer: true,
      assignedStaffMember: true,
      location: true
    },
    orderBy: [{ appointmentDate: "desc" }, { timeIn: "desc" }]
  });

  const currentCustomers = todaysAppointments
    .filter(
      (appointment) =>
        appointment.status === AppointmentStatus.ACTIVE ||
        appointment.status === AppointmentStatus.WAITING
    )
    .sort((a, b) => {
      if (a.status === AppointmentStatus.WAITING && b.status !== AppointmentStatus.WAITING) return -1;
      if (a.status !== AppointmentStatus.WAITING && b.status === AppointmentStatus.WAITING) return 1;
      return durationInMinutes(b.timeIn, b.timeOut) - durationInMinutes(a.timeIn, a.timeOut);
    });

  const checkedOutCount = todaysAppointments.filter(
    (appointment) => appointment.status === AppointmentStatus.COMPLETE
  ).length;
  const comebacksScheduledCount = todaysAppointments.filter(
    (appointment) => appointment.cbAppointmentScheduled || Boolean(appointment.cbAppointmentAt)
  ).length;

  const soldTodayCount = todaysAppointments.filter((appointment) => appointment.purchased === true).length;

  const activeNowCount = currentCustomers.filter(
    (appointment) => appointment.status === AppointmentStatus.ACTIVE
  ).length;

  const waitingCount = currentCustomers.filter(
    (appointment) => appointment.status === AppointmentStatus.WAITING
  ).length;

  const completedAppointments = todaysAppointments.filter((appointment) => appointment.timeOut);
  const averageDurationMinutes = completedAppointments.length
    ? Math.round(
        completedAppointments.reduce((sum, appointment) => {
          const end = appointment.timeOut ?? appointment.timeIn;
          return sum + Math.max(Math.round((end.getTime() - appointment.timeIn.getTime()) / 60000), 0);
        }, 0) / completedAppointments.length
      )
    : 0;

  const storeConfigs = shell.sourceStores.map((sourceStore) => ({
    storeId: sourceStore.id,
    slug: sourceStore.slug,
    name: sourceStore.name,
    staffMembers: sourceStore.staffMembers.map((staffMember) => ({
      id: staffMember.id,
      fullName: staffMember.fullName,
      role: staffMember.role
    })),
    leadSources: sourceStore.options
      .filter((option) => option.kind === "LEAD_SOURCE")
      .map((option) => ({ id: option.id, label: option.label })),
    pricePoints: sourceStore.options
      .filter((option) => option.kind === "PRICE_POINT")
      .map((option) => ({ id: option.id, label: option.label })),
    sizes: sourceStore.options
      .filter((option) => option.kind === "SIZE")
      .map((option) => ({ id: option.id, label: option.label })),
    appointmentTypes: sourceStore.options
      .filter((option) => option.kind === "APPOINTMENT_TYPE")
      .map((option) => ({ id: option.id, label: option.label })),
    walkInTypes: sourceStore.options
      .filter((option) => option.kind === "WALK_IN_TYPE")
      .map((option) => ({ id: option.id, label: option.label })),
    reasonDidNotBuyOptions: sourceStore.options
      .filter((option) => option.kind === "REASON_DID_NOT_BUY")
      .map((option) => ({ id: option.id, label: option.label })),
      locations: sourceStore.locations.map((location) => ({ id: location.id, label: location.name }))
  })).map((config) => ({
    ...config,
    leadSources: sortOptionsByYearFrequency(
      config.leadSources,
      historicalAppointments.filter((appointment) => appointment.storeId === config.storeId)
    )
  }));

  const quickCheckInOptions = {
    storeId: shell.isVirtualStore ? "" : store.id,
    isVirtualStore: shell.isVirtualStore,
    storeConfigs,
    staffMembers: dedupeByLabel(
      storeConfigs.flatMap((entry) =>
        entry.staffMembers.map((staffMember) => ({
          id: staffMember.id,
          label: staffMember.fullName,
          fullName: staffMember.fullName,
          role: staffMember.role
        }))
      )
    ).map(({ id, fullName, role }) => ({ id, fullName, role })),
    leadSources: sortOptionsByYearFrequency(
      dedupeByLabel(storeConfigs.flatMap((entry) => entry.leadSources)),
      historicalAppointments
    ),
    pricePoints: dedupeByLabel(storeConfigs.flatMap((entry) => entry.pricePoints)),
    sizes: dedupeByLabel(storeConfigs.flatMap((entry) => entry.sizes)),
    appointmentTypes: dedupeByLabel(storeConfigs.flatMap((entry) => entry.appointmentTypes)),
    walkInTypes: dedupeByLabel(storeConfigs.flatMap((entry) => entry.walkInTypes)),
    reasonDidNotBuyOptions: dedupeByLabel(storeConfigs.flatMap((entry) => entry.reasonDidNotBuyOptions)),
    locations: dedupeByLabel(storeConfigs.flatMap((entry) => entry.locations))
  };

  const appointmentMix = Array.from(
    todaysAppointments.reduce((acc, appointment) => {
      const label = appointment.appointmentTypeLabel || "Unknown";
      acc.set(label, (acc.get(label) || 0) + 1);
      return acc;
    }, new Map<string, number>())
  )
    .sort((a, b) => b[1] - a[1])
    .map(([label, value]) => ({ label, value }));

  const latestProfilesByGuest = new Map<
    string,
    {
      id: string;
      guestName: string;
      normalizedGuestName: string;
      lastVisitDate: string;
      appointmentType: string;
      visitType: "Appointment" | "Walk-in";
      assignedTo: string;
      location: string;
      wearDate: string;
      heardAbout: string;
      pricePoint: string;
      size: string;
      purchased: string;
      otherSale: string;
      comments: string;
      hasPreviousPurchase: boolean;
      storeId: string;
      storeName: string;
    }
  >();

  historicalAppointments.forEach((appointment) => {
    const normalizedGuestName = appointment.customer.normalizedFullName;
    if (!normalizedGuestName || latestProfilesByGuest.has(normalizedGuestName)) {
      return;
    }

    const hasPreviousPurchase = historicalAppointments.some(
      (candidate) =>
        candidate.customer.normalizedFullName === normalizedGuestName && candidate.purchased === true
    );

    latestProfilesByGuest.set(normalizedGuestName, {
      id: appointment.id,
      guestName: appointment.customer.fullName,
      normalizedGuestName,
      lastVisitDate: appointment.appointmentDate.toISOString().slice(0, 10),
      appointmentType: appointment.appointmentTypeLabel,
      visitType: appointment.visitType === VisitType.WALK_IN ? "Walk-in" : "Appointment",
      assignedTo: appointment.assignedStaffMember?.fullName || "",
      location: appointment.location?.name || "",
      wearDate: appointment.wearDate ? appointment.wearDate.toISOString().slice(0, 10) : "",
      heardAbout: appointment.leadSourceLabel || "",
      pricePoint: appointment.pricePointLabel || "",
      size: appointment.sizeLabel || "",
      purchased:
        appointment.purchased === null ? "" : appointment.purchased ? "Yes" : "No",
      otherSale:
        appointment.otherPurchase === null ? "" : appointment.otherPurchase ? "Yes" : "No",
      comments: appointment.comments || "",
      hasPreviousPurchase,
      storeId: appointment.storeId,
      storeName: shell.sourceStores.find((entry) => entry.id === appointment.storeId)?.name || store.name
    });
  });

  const firstVisitByGuest = new Map<
    string,
    {
      date: string;
      comment: string;
    }
  >();

  historicalAppointments
    .slice()
    .reverse()
    .forEach((appointment) => {
      const normalizedGuestName = appointment.customer.normalizedFullName;
      if (!normalizedGuestName || firstVisitByGuest.has(normalizedGuestName)) {
        return;
      }

      firstVisitByGuest.set(normalizedGuestName, {
        date: appointment.appointmentDate.toISOString().slice(0, 10),
        comment: appointment.comments || ""
      });
    });

  return {
    store: {
      slug: store.slug,
      name: store.name
    },
    stores: await getAllStoreChoices(),
    summary: {
      checkedInToday: todaysAppointments.length,
      checkedOutToday: checkedOutCount,
      comebacksScheduled: comebacksScheduledCount,
      soldToday: soldTodayCount,
      activeNow: activeNowCount,
      waiting: waitingCount,
      averageDuration: averageDurationMinutes
    },
    quickCheckInOptions,
    appointmentMix,
    previousCustomerProfiles: Array.from(latestProfilesByGuest.values()),
    todayEntries: todaysAppointments
      .slice()
      .sort((a, b) => a.timeIn.getTime() - b.timeIn.getTime())
      .map((appointment) => ({
        id: appointment.id,
        guestName: appointment.customer.fullName,
        storeName: shell.sourceStores.find((entry) => entry.id === appointment.storeId)?.name || store.name,
        assignedTo: appointment.assignedStaffMember?.fullName || "—",
        appointmentType: appointment.appointmentTypeLabel,
        location: appointment.location?.name || "—",
        timeIn: formatTime(appointment.timeIn),
        timeOut: appointment.timeOut ? formatTime(appointment.timeOut) : "In store",
        purchased:
          appointment.purchased === null ? "Pending" : appointment.purchased ? "Yes" : "No",
        otherSale:
          appointment.otherPurchase === null ? "Pending" : appointment.otherPurchase ? "Yes" : "No",
        comments: appointment.comments || "—",
        status:
          appointment.status === AppointmentStatus.COMPLETE
            ? "Checked out"
            : appointment.status === AppointmentStatus.WAITING
              ? "Waiting"
              : "Active"
      })),
    currentCustomers: currentCustomers.map((appointment) => ({
      id: appointment.id,
      appointmentDate: appointment.appointmentDate.toISOString().slice(0, 10),
      timeInValue: formatTimeInputValue(appointment.timeIn),
      guestName: appointment.customer.fullName,
      storeName: shell.sourceStores.find((entry) => entry.id === appointment.storeId)?.name || store.name,
      assignedTo: appointment.assignedStaffMember?.fullName || "Unassigned",
      assignedStaffMemberId: appointment.assignedStaffMember?.id || "",
      assignmentRole: appointment.assignedStaffMember?.role || null,
      location: appointment.location?.name || "Unassigned",
      appointmentType: appointment.appointmentTypeLabel,
      visitType: appointment.visitType === VisitType.WALK_IN ? "Walk-in" : "Appointment",
      status: appointment.status,
      timeIn: formatTime(appointment.timeIn),
      durationMinutes: durationInMinutes(appointment.timeIn, appointment.timeOut),
      duration: formatDuration(appointment.timeIn, appointment.timeOut),
      wearDateRaw: appointment.wearDate ? appointment.wearDate.toISOString().slice(0, 10) : "",
      leadSourceOptionId: appointment.leadSourceOptionId || "",
      leadSourceLabel: appointment.leadSourceLabel || "",
      pricePointOptionId: appointment.pricePointOptionId || "",
      pricePointLabel: appointment.pricePointLabel || "",
      sizeOptionId: appointment.sizeOptionId || "",
      sizeLabel: appointment.sizeLabel || "",
      comments: appointment.comments,
      purchased: appointment.purchased,
      otherPurchase: appointment.otherPurchase,
      reasonDidNotBuyLabel: appointment.reasonDidNotBuyLabel || "",
      previousVisitDate:
        appointment.appointmentTypeLabel.toLowerCase().includes("comeback")
          ? firstVisitByGuest.get(appointment.customer.normalizedFullName)?.date || ""
          : "",
      previousVisitComment:
        appointment.appointmentTypeLabel.toLowerCase().includes("comeback")
          ? firstVisitByGuest.get(appointment.customer.normalizedFullName)?.comment || ""
          : ""
    }))
  };
}
