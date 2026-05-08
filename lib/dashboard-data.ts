import { AppointmentStatus, VisitType } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { runTimed } from "@/lib/server-performance";
import { normalizeKey } from "@/lib/strings";
import { endOfLocalDay, startOfLocalDay } from "@/lib/tz-utils";
import { getAllStoreChoices, getStoreViewShell } from "@/lib/store-views";

function formatTime(date: Date | null) {
  if (!date) return "—";

  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
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

function dedupeByLabel<T extends { label: string }>(items: T[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = normalizeKey(item.label);
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

export async function getDashboardData(storeSlug: string, timezone = "UTC") {
  return runTimed(`getDashboardData:${storeSlug}`, async () => {
    const shell = await getStoreViewShell(storeSlug);
    if (!shell) {
      return null;
    }
    const store = shell.store;

    const today = new Date();
    // Use the browser's timezone (passed from cookie) so date boundaries match
    // what staff see on their devices, not the server's UTC clock.
    const dayStart = startOfLocalDay(timezone);
    const dayEnd = endOfLocalDay(timezone);

    const twelveMonthsAgo = new Date(today);
    twelveMonthsAgo.setFullYear(twelveMonthsAgo.getFullYear() - 1);

    const [todaysAppointments, activeAppointments, latestCustomerAppointments, purchasedCustomers, stores] = await Promise.all([
      // Today's appointments — drives the log table, summary stats, and appointment mix.
      prisma.appointment.findMany({
        where: {
          storeId: { in: shell.storeIds },
          deletedAt: null,
          appointmentDate: { gte: dayStart, lte: dayEnd }
        },
        select: {
          id: true,
          customerId: true,
          storeId: true,
          appointmentDate: true,
          status: true,
          timeIn: true,
          timeOut: true,
          appointmentTypeLabel: true,
          visitType: true,
          cbAppointmentScheduled: true,
          cbAppointmentAt: true,
          purchased: true,
          otherPurchase: true,
          reasonDidNotBuyLabel: true,
          leadSourceOptionId: true,
          leadSourceLabel: true,
          pricePointOptionId: true,
          pricePointLabel: true,
          sizeOptionId: true,
          sizeLabel: true,
          comments: true,
          wearDate: true,
          customer: { select: { fullName: true, normalizedFullName: true } },
          assignedStaffMember: { select: { id: true, fullName: true, role: true } },
          location: { select: { name: true } }
        },
        orderBy: [{ status: "asc" }, { timeIn: "asc" }]
      }),

      // All ACTIVE/WAITING appointments regardless of date — anyone not explicitly
      // checked out stays visible on the floor panel until the front desk clears them.
      // Uses the @@index([storeId, deletedAt, status, appointmentDate]) prefix.
      prisma.appointment.findMany({
        where: {
          storeId: { in: shell.storeIds },
          deletedAt: null,
          status: { in: [AppointmentStatus.ACTIVE, AppointmentStatus.WAITING] }
        },
        select: {
          id: true,
          customerId: true,
          storeId: true,
          appointmentDate: true,
          status: true,
          timeIn: true,
          timeOut: true,
          appointmentTypeLabel: true,
          visitType: true,
          cbAppointmentScheduled: true,
          cbAppointmentAt: true,
          purchased: true,
          otherPurchase: true,
          reasonDidNotBuyLabel: true,
          leadSourceOptionId: true,
          leadSourceLabel: true,
          pricePointOptionId: true,
          pricePointLabel: true,
          sizeOptionId: true,
          sizeLabel: true,
          comments: true,
          wearDate: true,
          customer: { select: { fullName: true, normalizedFullName: true } },
          assignedStaffMember: { select: { id: true, fullName: true, role: true } },
          location: { select: { name: true } }
        },
        orderBy: [{ status: "asc" }, { timeIn: "asc" }]
      }),

      // Latest appointment per customer (12 months) — drives the previous-customer
      // lookup and lead-source frequency sort. Replaces a separate leadSourceHistory
      // query since both needed the same fields.
      prisma.appointment.findMany({
        where: {
          storeId: { in: shell.storeIds },
          deletedAt: null,
          appointmentDate: { gte: twelveMonthsAgo }
        },
        distinct: ["customerId"],
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
        },
        orderBy: [{ customerId: "asc" }, { appointmentDate: "desc" }, { timeIn: "desc" }]
      }),

      // Distinct customer IDs that have ever purchased — used to flag returning buyers.
      prisma.appointment.findMany({
        where: {
          storeId: { in: shell.storeIds },
          deletedAt: null,
          appointmentDate: { gte: twelveMonthsAgo },
          purchased: true
        },
        distinct: ["customerId"],
        select: { customerId: true }
      }),

      // All store choices for the store switcher — fetched in parallel instead of
      // sequentially awaited at return time.
      getAllStoreChoices()
    ]);

    // Pre-build a storeId → storeName map to avoid repeated .find() calls in loops.
    const storeNameMap = new Map(shell.sourceStores.map((s) => [s.id, s.name]));
    const storeName = (storeId: string) => storeNameMap.get(storeId) ?? store.name;

    const currentCustomers = activeAppointments
      .slice()
      .sort((a, b) => {
        if (a.status === AppointmentStatus.WAITING && b.status !== AppointmentStatus.WAITING) return -1;
        if (a.status !== AppointmentStatus.WAITING && b.status === AppointmentStatus.WAITING) return 1;
        return durationInMinutes(b.timeIn, b.timeOut) - durationInMinutes(a.timeIn, a.timeOut);
      });

    const checkedOutCount = todaysAppointments.filter(
      (a) => a.status === AppointmentStatus.COMPLETE
    ).length;
    const comebacksScheduledCount = todaysAppointments.filter(
      (a) => a.cbAppointmentScheduled || Boolean(a.cbAppointmentAt)
    ).length;
    const soldTodayCount = todaysAppointments.filter((a) => a.purchased === true).length;
    const activeNowCount = currentCustomers.filter((a) => a.status === AppointmentStatus.ACTIVE).length;
    const waitingCount = currentCustomers.filter((a) => a.status === AppointmentStatus.WAITING).length;

    const completedAppointments = todaysAppointments.filter((a) => a.timeOut);
    const averageDurationMinutes = completedAppointments.length
      ? Math.round(
          completedAppointments.reduce((sum, a) => {
            const end = a.timeOut ?? a.timeIn;
            return sum + Math.max(Math.round((end.getTime() - a.timeIn.getTime()) / 60000), 0);
          }, 0) / completedAppointments.length
        )
      : 0;

    // latestCustomerAppointments doubles as the lead-source history source —
    // same fields needed, one less query.
    const storeConfigs = shell.sourceStores.map((sourceStore) => ({
      storeId: sourceStore.id,
      slug: sourceStore.slug,
      name: sourceStore.name,
      staffMembers: sourceStore.staffMembers.map((m) => ({
        id: m.id,
        fullName: m.fullName,
        role: m.role
      })),
      leadSources: sourceStore.options
        .filter((o) => o.kind === "LEAD_SOURCE")
        .map((o) => ({ id: o.id, label: o.label })),
      pricePoints: sourceStore.options
        .filter((o) => o.kind === "PRICE_POINT")
        .map((o) => ({ id: o.id, label: o.label })),
      sizes: sourceStore.options
        .filter((o) => o.kind === "SIZE")
        .map((o) => ({ id: o.id, label: o.label })),
      appointmentTypes: sourceStore.options
        .filter((o) => o.kind === "APPOINTMENT_TYPE")
        .map((o) => ({ id: o.id, label: o.label })),
      walkInTypes: sourceStore.options
        .filter((o) => o.kind === "WALK_IN_TYPE")
        .map((o) => ({ id: o.id, label: o.label })),
      reasonDidNotBuyOptions: sourceStore.options
        .filter((o) => o.kind === "REASON_DID_NOT_BUY")
        .map((o) => ({ id: o.id, label: o.label })),
      locations: sourceStore.locations.map((l) => ({ id: l.id, label: l.name }))
    })).map((config) => ({
      ...config,
      leadSources: sortOptionsByYearFrequency(
        config.leadSources,
        latestCustomerAppointments.filter((a) => a.storeId === config.storeId)
      )
    }));

    const quickCheckInOptions = {
      storeId: shell.isVirtualStore ? "" : store.id,
      isVirtualStore: shell.isVirtualStore,
      storeConfigs,
      staffMembers: dedupeByLabel(
        storeConfigs.flatMap((c) =>
          c.staffMembers.map((m) => ({ id: m.id, label: m.fullName, fullName: m.fullName, role: m.role }))
        )
      ).map(({ id, fullName, role }) => ({ id, fullName, role })),
      leadSources: sortOptionsByYearFrequency(
        dedupeByLabel(storeConfigs.flatMap((c) => c.leadSources)),
        latestCustomerAppointments
      ),
      pricePoints: dedupeByLabel(storeConfigs.flatMap((c) => c.pricePoints)),
      sizes: dedupeByLabel(storeConfigs.flatMap((c) => c.sizes)),
      appointmentTypes: dedupeByLabel(storeConfigs.flatMap((c) => c.appointmentTypes)),
      walkInTypes: dedupeByLabel(storeConfigs.flatMap((c) => c.walkInTypes)),
      reasonDidNotBuyOptions: dedupeByLabel(storeConfigs.flatMap((c) => c.reasonDidNotBuyOptions)),
      locations: dedupeByLabel(storeConfigs.flatMap((c) => c.locations))
    };

    const appointmentMix = Array.from(
      todaysAppointments.reduce((acc, a) => {
        const label = a.appointmentTypeLabel || "Unknown";
        acc.set(label, (acc.get(label) || 0) + 1);
        return acc;
      }, new Map<string, number>())
    )
      .sort((a, b) => b[1] - a[1])
      .map(([label, value]) => ({ label, value }));

    const purchasedCustomerIds = new Set(purchasedCustomers.map((a) => a.customerId));
    const previousCustomerProfiles = latestCustomerAppointments
      .filter((a) => a.customer.normalizedFullName)
      .map((a) => ({
        id: a.id,
        guestName: a.customer.fullName,
        normalizedGuestName: a.customer.normalizedFullName,
        lastVisitDate: a.appointmentDate.toISOString().slice(0, 10),
        appointmentType: a.appointmentTypeLabel,
        visitType: (a.visitType === VisitType.WALK_IN ? "Walk-in" : "Appointment") as "Appointment" | "Walk-in",
        assignedTo: a.assignedStaffMember?.fullName || "",
        location: a.location?.name || "",
        wearDate: a.wearDate ? a.wearDate.toISOString().slice(0, 10) : "",
        heardAbout: a.leadSourceLabel || "",
        pricePoint: a.pricePointLabel || "",
        size: a.sizeLabel || "",
        purchased: a.purchased === null ? "" : a.purchased ? "Yes" : "No",
        otherSale: a.otherPurchase === null ? "" : a.otherPurchase ? "Yes" : "No",
        comments: a.comments || "",
        hasPreviousPurchase: purchasedCustomerIds.has(a.customerId),
        storeId: a.storeId,
        storeName: storeName(a.storeId)
      }));

    // For comeback customers on the floor, look up their original visit in parallel.
    const comebackCustomerIds = currentCustomers
      .filter((a) => a.appointmentTypeLabel.toLowerCase().includes("comeback"))
      .map((a) => a.customerId);

    const firstVisitAppointments = comebackCustomerIds.length
      ? await prisma.appointment.findMany({
          where: { customerId: { in: comebackCustomerIds }, deletedAt: null },
          distinct: ["customerId"],
          select: {
            customerId: true,
            appointmentDate: true,
            comments: true,
            customer: { select: { normalizedFullName: true } }
          },
          orderBy: [{ customerId: "asc" }, { appointmentDate: "asc" }, { timeIn: "asc" }]
        })
      : [];

    const firstVisitByGuest = new Map<string, { date: string; comment: string }>();
    for (const a of firstVisitAppointments) {
      const name = a.customer.normalizedFullName;
      if (name && !firstVisitByGuest.has(name)) {
        firstVisitByGuest.set(name, {
          date: a.appointmentDate.toISOString().slice(0, 10),
          comment: a.comments || ""
        });
      }
    }

    return {
      store: { slug: store.slug, name: store.name },
      stores,
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
      previousCustomerProfiles,
      todayEntries: todaysAppointments
        .slice()
        .sort((a, b) => a.timeIn.getTime() - b.timeIn.getTime())
        .map((a) => ({
          id: a.id,
          guestName: a.customer.fullName,
          storeName: storeName(a.storeId),
          assignedTo: a.assignedStaffMember?.fullName || "—",
          appointmentType: a.appointmentTypeLabel,
          location: a.location?.name || "—",
          timeIn: formatTime(a.timeIn),
          timeOut: a.timeOut ? formatTime(a.timeOut) : "In store",
          purchased: a.purchased === null ? "Pending" : a.purchased ? "Yes" : "No",
          otherSale: a.otherPurchase === null ? "Pending" : a.otherPurchase ? "Yes" : "No",
          comments: a.comments || "—",
          status:
            a.status === AppointmentStatus.COMPLETE
              ? "Checked out"
              : a.status === AppointmentStatus.WAITING
                ? "Waiting"
                : "Active"
        })),
      currentCustomers: currentCustomers.map((a) => ({
        id: a.id,
        appointmentDate: a.appointmentDate.toISOString().slice(0, 10),
        timeInAt: a.timeIn.toISOString(),
        guestName: a.customer.fullName,
        storeName: storeName(a.storeId),
        assignedTo: a.assignedStaffMember?.fullName || "Unassigned",
        assignedStaffMemberId: a.assignedStaffMember?.id || "",
        assignmentRole: a.assignedStaffMember?.role || null,
        location: a.location?.name || "Unassigned",
        appointmentType: a.appointmentTypeLabel,
        visitType: a.visitType === VisitType.WALK_IN ? "Walk-in" : "Appointment",
        status: a.status,
        timeIn: formatTime(a.timeIn),
        durationMinutes: durationInMinutes(a.timeIn, a.timeOut),
        duration: formatDuration(a.timeIn, a.timeOut),
        wearDateRaw: a.wearDate ? a.wearDate.toISOString().slice(0, 10) : "",
        leadSourceOptionId: a.leadSourceOptionId || "",
        leadSourceLabel: a.leadSourceLabel || "",
        pricePointOptionId: a.pricePointOptionId || "",
        pricePointLabel: a.pricePointLabel || "",
        sizeOptionId: a.sizeOptionId || "",
        sizeLabel: a.sizeLabel || "",
        comments: a.comments,
        purchased: a.purchased,
        otherPurchase: a.otherPurchase,
        reasonDidNotBuyLabel: a.reasonDidNotBuyLabel || "",
        previousVisitDate:
          a.appointmentTypeLabel.toLowerCase().includes("comeback")
            ? firstVisitByGuest.get(a.customer.normalizedFullName)?.date || ""
            : "",
        previousVisitComment:
          a.appointmentTypeLabel.toLowerCase().includes("comeback")
            ? firstVisitByGuest.get(a.customer.normalizedFullName)?.comment || ""
            : ""
      }))
    };
  });
}
