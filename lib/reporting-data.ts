import { AppointmentStatus, StaffRole, StoreOptionKind } from "@prisma/client";

import { reportingAppointmentSelect } from "@/lib/appointment-selects";
import { prisma } from "@/lib/prisma";
import {
  applyAppointmentFilters,
  countByLabel,
  formatDate,
  formatDuration,
  formatMinutes,
  formatPercent,
  formatTime,
  getCloseRateValue,
  getDateRange,
  getFilterSummary,
  getPricePointSortValue,
  getSizeSortValue,
  hasMeaningfulStylistMetrics,
  isBridesSeenType,
  resolveReportingFilters,
  stylistMetricsFromAppointments,
  type ReportingAppointment,
  uniqueGuestCounts
} from "@/lib/reporting";
import { runTimed } from "@/lib/server-performance";
import { getStoreViewShell } from "@/lib/store-views";

function hasMeaningfulReportingSearchParams(searchParams?: Record<string, string | string[] | undefined>) {
  if (!searchParams) return false;

  return ["view", "day", "week", "twoWeek", "month", "year", "pricePoint", "visitType", "appointmentType"].some((key) => {
    const value = searchParams[key];
    if (Array.isArray(value)) return value.length > 0;
    return typeof value === "string" && value.length > 0;
  });
}

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

function getStoreSnapshotCounts(appointments: Array<{ status: AppointmentStatus; purchased: boolean | null }>) {
  return {
    activeNow: appointments.filter((entry) => entry.status === AppointmentStatus.ACTIVE).length,
    waiting: appointments.filter((entry) => entry.status === AppointmentStatus.WAITING).length,
    soldToday: appointments.filter((entry) => entry.purchased === true).length
  };
}

function normalizeSortDirection(value?: string) {
  return value === "asc" ? "asc" : "desc";
}

function getSortValue(row: Record<string, string | number>, key: string) {
  return row[key] ?? 0;
}

function compareSortValues(a: string | number, b: string | number, direction: "asc" | "desc") {
  if (typeof a === "string" || typeof b === "string") {
    const result = String(a).localeCompare(String(b));
    return direction === "asc" ? result : -result;
  }

  const result = Number(a) - Number(b);
  return direction === "asc" ? result : -result;
}

function getAvailableStylistNames(
  staffMembers: Array<{ fullName: string; role: StaffRole }>,
  appointments: ReportingAppointment[]
) {
  const names = new Set(
    staffMembers.filter((member) => member.role === StaffRole.STYLIST).map((member) => member.fullName)
  );

  appointments.forEach((appointment) => {
    if (appointment.assignedStaffMember?.fullName) {
      names.add(appointment.assignedStaffMember.fullName);
    }
  });

  return Array.from(names).sort((a, b) => a.localeCompare(b));
}

async function getReportingStaffMembers(storeIds: string[]) {
  return prisma.staffMember.findMany({
    where: {
      storeId: {
        in: storeIds
      },
      role: StaffRole.STYLIST
    },
    select: {
      fullName: true,
      role: true
    },
    orderBy: [{ fullName: "asc" }]
  });
}

export async function getStoreShellData(storeSlug: string) {
  const shell = await getStoreViewShell(storeSlug);
  if (!shell) {
    return null;
  }

  const today = new Date();
  const todaysAppointments = await prisma.appointment.findMany({
    where: {
      storeId: {
        in: shell.storeIds
      },
      deletedAt: null,
      appointmentDate: {
        gte: startOfDay(today),
        lte: endOfDay(today)
      }
    },
    select: {
      status: true,
      purchased: true
    }
  });

  return {
    ...shell,
    snapshot: getStoreSnapshotCounts(todaysAppointments)
  };
}

export async function getAnalyticsData(
  storeSlug: string,
  searchParams?: Record<string, string | string[] | undefined>
) {
  return runTimed(`getAnalyticsData:${storeSlug}`, async () => {
    const shell = await getStoreShellData(storeSlug);
    if (!shell) return null;

    let effectiveSearchParams = searchParams;
    if (!hasMeaningfulReportingSearchParams(searchParams)) {
      const latestAppointment = await prisma.appointment.findFirst({
        where: {
          storeId: {
            in: shell.storeIds
          },
          deletedAt: null
        },
        orderBy: [{ appointmentDate: "desc" }],
        select: { appointmentDate: true }
      });

      if (latestAppointment) {
        effectiveSearchParams = {
          ...(searchParams || {}),
          view: "year",
          year: String(latestAppointment.appointmentDate.getFullYear())
        };
      }
    }

    const filters = resolveReportingFilters(effectiveSearchParams);
    const dateRange = getDateRange(filters);
    const sortKey = typeof searchParams?.sortKey === "string" ? searchParams.sortKey : "closeRate";
    const sortDirection = normalizeSortDirection(
      typeof searchParams?.sortDirection === "string" ? searchParams.sortDirection : "desc"
    );

    const [appointments, reportingStaffMembers] = await Promise.all([
      prisma.appointment.findMany({
        where: {
          storeId: {
            in: shell.storeIds
          },
          deletedAt: null,
          appointmentDate: {
            gte: dateRange.start,
            lte: dateRange.end
          }
        },
        select: reportingAppointmentSelect,
        orderBy: [{ appointmentDate: "desc" }, { timeIn: "desc" }]
      }),
      getReportingStaffMembers(shell.storeIds)
    ]);

    const filteredAppointments = applyAppointmentFilters(appointments as ReportingAppointment[], filters);
    const stylistNames = getAvailableStylistNames(
      reportingStaffMembers,
      filteredAppointments as ReportingAppointment[]
    );

  const leaderboard = stylistNames
    .map((name) => stylistMetricsFromAppointments(name, filteredAppointments as ReportingAppointment[], filters))
    .map((entry) => ({
      ...entry,
      guestsSeen: entry.appointmentsCount
    }))
    .filter(hasMeaningfulStylistMetrics)
    .sort((a, b) => {
      const primary = compareSortValues(
        getSortValue(a as unknown as Record<string, string | number>, sortKey),
        getSortValue(b as unknown as Record<string, string | number>, sortKey),
        sortDirection
      );
      if (primary !== 0) return primary;
      return a.name.localeCompare(b.name);
    });

  const bridesSeen = filteredAppointments.filter((appointment) =>
    isBridesSeenType(appointment.appointmentTypeLabel)
  ).length;
  const bridesSold = leaderboard.reduce((sum, row) => sum + row.bridesSold, 0);
  const closeRateSeen = leaderboard.reduce((sum, row) => sum + row.closeRateSeenCount, 0);
  const topCloser = leaderboard.reduce<(typeof leaderboard)[number] | null>(
    (best, row) => {
      if (!row.bridesSeen) return best;
      if (!best) return row;
      if (row.closeRate !== best.closeRate) {
        return row.closeRate > best.closeRate ? row : best;
      }
      if (row.bridesSold !== best.bridesSold) {
        return row.bridesSold > best.bridesSold ? row : best;
      }
      return row.name.localeCompare(best.name) < 0 ? row : best;
    },
    null
  );
  const topSeller = leaderboard.reduce<(typeof leaderboard)[number] | null>(
    (best, row) => {
      if (!best) return row;
      if (row.bridesSold !== best.bridesSold) {
        return row.bridesSold > best.bridesSold ? row : best;
      }
      if (row.bridesSeen !== best.bridesSeen) {
        return row.bridesSeen > best.bridesSeen ? row : best;
      }
      return row.name.localeCompare(best.name) < 0 ? row : best;
    },
    null
  );
  const topAddOn = leaderboard.reduce<(typeof leaderboard)[number] | null>(
    (best, row) => {
      if (!row.appointmentsCount) return best;
      if (!best) return row;
      if (row.addOnRate !== best.addOnRate) {
        return row.addOnRate > best.addOnRate ? row : best;
      }
      if (row.appointmentsCount !== best.appointmentsCount) {
        return row.appointmentsCount > best.appointmentsCount ? row : best;
      }
      return row.name.localeCompare(best.name) < 0 ? row : best;
    },
    null
  );
  const unassignedAppointmentsCount = filteredAppointments.filter(
    (appointment) => !appointment.assignedStaffMember
  ).length;
  const storeCloseRate = getCloseRateValue(closeRateSeen, bridesSold);
  const insights = [
    topCloser
      ? `${topCloser.name} has the strongest close rate at ${formatPercent(topCloser.closeRate)} in this reporting window.`
      : "No stylist activity is available for the current filters.",
    topSeller
      ? `${topSeller.name} leads bridal sales with ${topSeller.bridesSold} brides sold.`
      : `${bridesSold} bridal sales are contributing to close rate in this reporting window.`,
    topAddOn
      ? `${topAddOn.name} is leading add-on performance at ${formatPercent(topAddOn.addOnRate)}.`
      : `${bridesSeen} bridal appointments count toward Brides Seen under the current rules.`,
    unassignedAppointmentsCount
      ? `${unassignedAppointmentsCount} appointment${unassignedAppointmentsCount === 1 ? "" : "s"} in this window are still unassigned, so they are excluded from stylist leaderboard results.`
      : leaderboard.length
        ? `Store close rate is ${formatPercent(storeCloseRate)} for this reporting window.`
        : `${filteredAppointments.length} total guests are included in this reporting window.`
  ];

  const bridalAppointments = filteredAppointments.filter((appointment) =>
    isBridesSeenType(appointment.appointmentTypeLabel)
  );
  const reasonTallies = countByLabel(filteredAppointments, (appointment) => appointment.reasonDidNotBuyLabel);
  const bridalPriceBreakdown = buildBreakdownRows(
    filteredAppointments,
    filters,
    countByLabel(bridalAppointments, (appointment) => appointment.pricePointLabel)
      .sort(
        (a, b) =>
          getPricePointSortValue(a.label) - getPricePointSortValue(b.label) ||
          a.label.localeCompare(b.label)
      )
      .map((entry) => ({
        label: entry.label,
        matcher: (appointment: ReportingAppointment) => appointment.pricePointLabel === entry.label
      }))
  );
  const bridalSizeBreakdown = buildBreakdownRows(
    filteredAppointments,
    filters,
    countByLabel(bridalAppointments, (appointment) => appointment.sizeLabel)
      .sort((a, b) => getSizeSortValue(a.label) - getSizeSortValue(b.label) || a.label.localeCompare(b.label))
      .map((entry) => ({
        label: entry.label,
        matcher: (appointment: ReportingAppointment) => appointment.sizeLabel === entry.label
      }))
  );

    return {
      ...shell,
      filters,
      filterSummary: getFilterSummary(filters),
      filteredAppointmentsCount: filteredAppointments.length,
      unassignedAppointmentsCount,
      availableStylistCount: stylistNames.length,
      appointmentTypeOptions: shell.store.options
        .filter((option) => option.kind === StoreOptionKind.APPOINTMENT_TYPE || option.kind === StoreOptionKind.WALK_IN_TYPE)
        .map((option) => option.label),
      pricePointOptions: shell.store.options
        .filter((option) => option.kind === StoreOptionKind.PRICE_POINT)
        .map((option) => option.label),
      leaderboardSort: {
        key: sortKey,
        direction: sortDirection
      },
      summaryCards: [
        { label: "Reporting Window", value: getFilterSummary(filters), compact: true },
        { label: "Guests Seen", value: String(filteredAppointments.length) },
        { label: "Brides Seen", value: String(bridesSeen) },
        { label: "Brides Sold", value: String(bridesSold) },
        { label: "Store Close Rate", value: formatPercent(storeCloseRate) }
      ],
      leaderboard,
      insights,
      leadSourceMix: uniqueGuestCounts(filteredAppointments, (appointment) => appointment.leadSourceLabel),
      bridalPriceMix: uniqueGuestCounts(bridalAppointments, (appointment) => appointment.pricePointLabel).sort(
        (a, b) =>
          getPricePointSortValue(a.label) - getPricePointSortValue(b.label) ||
          b.value - a.value ||
          a.label.localeCompare(b.label)
      ),
      bridalSizeMix: uniqueGuestCounts(bridalAppointments, (appointment) => appointment.sizeLabel).sort(
        (a, b) =>
          getSizeSortValue(a.label) - getSizeSortValue(b.label) ||
          b.value - a.value ||
          a.label.localeCompare(b.label)
      ),
      bridalPriceBreakdown,
      bridalSizeBreakdown,
      reasonTallies
    };
  });
}

function buildBreakdownRows(
  appointments: ReportingAppointment[],
  filters: ReturnType<typeof resolveReportingFilters>,
  categories: Array<{
    label: string;
    matcher: (appointment: ReportingAppointment) => boolean;
  }>
) {
  return categories
    .map((category) => {
      const matching = appointments.filter(category.matcher);
      const metrics = {
        bridesSeen: matching.filter((appointment) =>
          filters.appointmentType === "Comeback Bride"
            ? appointment.appointmentTypeLabel === "Comeback Bride"
            : isBridesSeenType(appointment.appointmentTypeLabel)
        ).length,
        bridesSold: matching.filter((appointment) => {
          if (filters.appointmentType === "Comeback Bride") {
            return (
              (appointment.appointmentTypeLabel === "Comeback Bride" ||
                appointment.appointmentTypeLabel === "Comeback Bride - Same Day") &&
              appointment.purchased === true
            );
          }

          return (
            (appointment.appointmentTypeLabel === "New Bride" ||
              appointment.appointmentTypeLabel === "Comeback Bride" ||
              appointment.appointmentTypeLabel === "Comeback Bride - Same Day") &&
            appointment.purchased === true
          );
        }).length
      };

      return {
        label: category.label,
        ...metrics,
        closeRate: getCloseRateValue(metrics.bridesSeen, metrics.bridesSold)
      };
    })
    .filter((row) => row.bridesSeen || row.bridesSold);
}

export async function getStylistsData(
  storeSlug: string,
  searchParams?: Record<string, string | string[] | undefined>
) {
  return runTimed(`getStylistsData:${storeSlug}`, async () => {
    const analytics = await getAnalyticsData(storeSlug, searchParams);
    if (!analytics) return null;

  const populatedLeaderboard = analytics.leaderboard.filter((entry) => entry.appointmentsCount > 0);

  const selectedStylist =
    typeof searchParams?.stylist === "string"
      ? searchParams.stylist
      : "";

  const selectedMetrics = analytics.leaderboard.find((entry) => entry.name === selectedStylist) || null;
  const stylistAppointments = selectedMetrics?.appointments || [];
  const appointmentRows = stylistAppointments.map((appointment) => ({
    id: appointment.id,
    storeLabel:
      analytics.storeIds.length > 1
        ? analytics.sourceStores.find((entry) => entry.id === appointment.storeId)?.name || analytics.store.name
        : "",
    date: formatDate(appointment.appointmentDate),
    guestName: appointment.customer.fullName,
    appointmentType: appointment.appointmentTypeLabel,
    visitType: appointment.visitType === "WALK_IN" ? "Walk-in" : "Appointment",
    location: appointment.location?.name || "Unassigned",
    timeIn: formatTime(appointment.timeIn),
    timeOut: formatTime(appointment.timeOut),
    duration: formatDuration(appointment.timeIn, appointment.timeOut),
    purchased: appointment.purchased === null ? "Pending" : appointment.purchased ? "Yes" : "No",
    otherSale: appointment.otherPurchase === null ? "Pending" : appointment.otherPurchase ? "Yes" : "No",
    comment: appointment.comments || "—"
  }));

  const visitTypeBreakdown = buildBreakdownRows(stylistAppointments, analytics.filters, [
    {
      label: "New Bride",
      matcher: (appointment) => appointment.appointmentTypeLabel === "New Bride" && appointment.visitType === "APPOINTMENT"
    },
    {
      label: "Comeback Bride",
      matcher: (appointment) =>
        (appointment.appointmentTypeLabel === "Comeback Bride" ||
          appointment.appointmentTypeLabel === "Comeback Bride - Same Day") &&
        appointment.visitType === "APPOINTMENT"
    },
    {
      label: "Walk-in Bride",
      matcher: (appointment) =>
        appointment.visitType === "WALK_IN" &&
        (appointment.appointmentTypeLabel === "New Bride" ||
          appointment.appointmentTypeLabel === "Comeback Bride" ||
          appointment.appointmentTypeLabel === "Comeback Bride - Same Day")
    }
  ]);

  const priceBreakdown = buildBreakdownRows(
    stylistAppointments,
    analytics.filters,
    countByLabel(
      stylistAppointments.filter((appointment) => isBridesSeenType(appointment.appointmentTypeLabel)),
      (appointment) => appointment.pricePointLabel
    )
      .sort(
        (a, b) =>
          getPricePointSortValue(a.label) - getPricePointSortValue(b.label) || a.label.localeCompare(b.label)
      )
      .map((entry) => ({
        label: entry.label,
        matcher: (appointment: ReportingAppointment) => appointment.pricePointLabel === entry.label
      }))
  );

  const sizeBreakdown = buildBreakdownRows(
    stylistAppointments,
    analytics.filters,
    countByLabel(
      stylistAppointments.filter((appointment) => isBridesSeenType(appointment.appointmentTypeLabel)),
      (appointment) => appointment.sizeLabel
    )
      .sort((a, b) => getSizeSortValue(a.label) - getSizeSortValue(b.label) || a.label.localeCompare(b.label))
      .map((entry) => ({
        label: entry.label,
        matcher: (appointment: ReportingAppointment) => appointment.sizeLabel === entry.label
      }))
  );

    return {
      ...analytics,
      selectedStylist,
      selectedMetrics,
      hasStylistData: analytics.leaderboard.length > 0,
      detailSummaryCards: selectedMetrics
        ? [
            { label: "Reporting Window", value: analytics.filterSummary, compact: true },
            { label: "Total Appointments", value: String(selectedMetrics.appointmentsCount) },
            { label: "Bridal Close Rate", value: formatPercent(selectedMetrics.closeRate) },
            { label: "Average Duration", value: formatMinutes(selectedMetrics.averageDuration) }
          ]
        : [],
      visitTypeBreakdown,
      priceBreakdown,
      sizeBreakdown,
      detailReasonTallies: countByLabel(stylistAppointments, (appointment) => appointment.reasonDidNotBuyLabel),
      appointmentRows
    };
  });
}

export async function getSettingsData(storeSlug: string) {
  const shell = await getStoreShellData(storeSlug);
  if (!shell) return null;
  const accountStores = shell.sourceStores.map((store) => ({
    id: store.id,
    slug: store.slug,
    name: store.name
  }));
  const accountStoreIds = shell.isVirtualStore ? shell.storeIds : shell.sourceStores.map((store) => store.id);
  const users = await prisma.user.findMany({
    where: {
      OR: [
        {
          storeId: {
            in: accountStoreIds
          }
        },
        { role: "ADMIN" }
      ]
    },
    include: {
      store: {
        select: {
          name: true
        }
      },
      staffMember: {
        select: {
          fullName: true
        }
      }
    },
    orderBy: [{ isActive: "desc" }, { role: "asc" }, { fullName: "asc" }]
  });

  const optionGroups = [
    {
      title: "Stylists",
      formKind: "staff-stylist",
      inputPlaceholder: "Add stylist name",
      items: shell.store.staffMembers
        .filter((entry) => entry.role === StaffRole.STYLIST)
        .map((entry) => ({ id: entry.id, label: entry.fullName }))
    },
    {
      title: "Seamstresses",
      formKind: "staff-seamstress",
      inputPlaceholder: "Add seamstress name",
      items: shell.store.staffMembers
        .filter((entry) => entry.role === StaffRole.SEAMSTRESS)
        .map((entry) => ({ id: entry.id, label: entry.fullName }))
    },
    {
      title: "Locations",
      formKind: "location",
      inputPlaceholder: "Add location",
      items: shell.store.locations.map((entry) => ({ id: entry.id, label: entry.name }))
    },
    {
      title: "Appointment Types",
      formKind: "option-appointment-type",
      inputPlaceholder: "Add appointment type",
      items: shell.store.options
        .filter((entry) => entry.kind === StoreOptionKind.APPOINTMENT_TYPE)
        .map((entry) => ({ id: entry.id, label: entry.label }))
    },
    {
      title: "Walk-In Types",
      formKind: "option-walk-in-type",
      inputPlaceholder: "Add walk-in type",
      items: shell.store.options
        .filter((entry) => entry.kind === StoreOptionKind.WALK_IN_TYPE)
        .map((entry) => ({ id: entry.id, label: entry.label }))
    },
    {
      title: "Heard From",
      formKind: "option-lead-source",
      inputPlaceholder: "Add heard-from option",
      items: shell.store.options
        .filter((entry) => entry.kind === StoreOptionKind.LEAD_SOURCE)
        .map((entry) => ({ id: entry.id, label: entry.label }))
    },
    {
      title: "Price Points",
      formKind: "option-price-point",
      inputPlaceholder: "Add price point",
      items: shell.store.options
        .filter((entry) => entry.kind === StoreOptionKind.PRICE_POINT)
        .map((entry) => ({ id: entry.id, label: entry.label }))
    },
    {
      title: "Sizes",
      formKind: "option-size",
      inputPlaceholder: "Add size",
      items: shell.store.options
        .filter((entry) => entry.kind === StoreOptionKind.SIZE)
        .map((entry) => ({ id: entry.id, label: entry.label }))
    },
    {
      title: "Reasons Did Not Buy",
      formKind: "option-reason-did-not-buy",
      inputPlaceholder: "Add reason did not buy",
      items: shell.store.options
        .filter((entry) => entry.kind === StoreOptionKind.REASON_DID_NOT_BUY)
        .map((entry) => ({ id: entry.id, label: entry.label }))
    }
  ];

  return {
    ...shell,
    isVirtualStore: shell.isVirtualStore,
    accountStores,
    users: users.map((user) => ({
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      role: user.role,
      storeName: user.store?.name || "All stores",
      stylistName: user.staffMember?.fullName || "",
      isActive: user.isActive
    })),
    optionGroups
  };
}

export async function getAdminViewData(searchParams?: Record<string, string | string[] | undefined>) {
  return runTimed("getAdminViewData", async () => {
    const filters = resolveReportingFilters(searchParams);
    const dateRange = getDateRange(filters);
    const sortKey = typeof searchParams?.sortKey === "string" ? searchParams.sortKey : "closeRate";
    const sortDirection = normalizeSortDirection(
      typeof searchParams?.sortDirection === "string" ? searchParams.sortDirection : "desc"
    );
    const storeSortKey = typeof searchParams?.storeSortKey === "string" ? searchParams.storeSortKey : "storeLabel";
    const storeSortDirection = normalizeSortDirection(
      typeof searchParams?.storeSortDirection === "string" ? searchParams?.storeSortDirection : "asc"
    );
    const stores = await prisma.store.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      include: {
        staffMembers: {
          where: { role: StaffRole.STYLIST },
          orderBy: { fullName: "asc" }
        },
        options: {
          where: { isActive: true },
          orderBy: [{ kind: "asc" }, { sortOrder: "asc" }, { label: "asc" }]
        }
      }
    });
    const filteredStores = filters.store ? stores.filter((store) => store.slug === filters.store) : stores;
    const filteredStoreIds = filteredStores.map((store) => store.id);

    const appointments = await prisma.appointment.findMany({
      where: {
        storeId: {
          in: filteredStoreIds
        },
        deletedAt: null,
        appointmentDate: {
          gte: dateRange.start,
          lte: dateRange.end
        }
      },
      select: reportingAppointmentSelect,
      orderBy: [{ appointmentDate: "desc" }, { timeIn: "desc" }]
    });

    const appointmentsByStore = appointments.reduce((acc, appointment) => {
      const bucket = acc.get(appointment.storeId);
      if (bucket) {
        bucket.push(appointment as ReportingAppointment);
      } else {
        acc.set(appointment.storeId, [appointment as ReportingAppointment]);
      }
      return acc;
    }, new Map<string, ReportingAppointment[]>());

    const perStoreMetrics = filteredStores.map((store) => {
      const appointments = appointmentsByStore.get(store.id) || [];

      const filteredAppointments = applyAppointmentFilters(appointments as ReportingAppointment[], filters);
      const stylistRows = getAvailableStylistNames(
        store.staffMembers.map((member) => ({ fullName: member.fullName, role: member.role })),
        filteredAppointments as ReportingAppointment[]
      )
        .map((name) => stylistMetricsFromAppointments(name, filteredAppointments as ReportingAppointment[], filters))
        .map((row) => ({ ...row, storeLabel: store.name, guestsSeen: row.appointmentsCount }))
        .filter(hasMeaningfulStylistMetrics);

      const bridesSeen = filteredAppointments.filter((appointment) =>
        isBridesSeenType(appointment.appointmentTypeLabel)
      ).length;
      const bridesSold = stylistRows.reduce((sum, row) => sum + row.bridesSold, 0);
      const closeRateSeen = stylistRows.reduce((sum, row) => sum + row.closeRateSeenCount, 0);
      const cbEligible = filteredAppointments.filter(
        (appointment) => appointment.appointmentTypeLabel === "New Bride" && appointment.purchased === false
      );
      const cbScheduled = cbEligible.filter(
        (appointment) => appointment.cbAppointmentScheduled || Boolean(appointment.cbAppointmentAt)
      );
      const addOnCount = filteredAppointments.filter((appointment) => appointment.otherPurchase === true).length;
      const durationPool = filteredAppointments.filter(
        (appointment) =>
          (appointment.appointmentTypeLabel === "New Bride" || appointment.appointmentTypeLabel === "Comeback Bride") &&
          Boolean(appointment.timeOut)
      );

      return {
        storeId: store.id,
        storeLabel: store.name,
        appointments: filteredAppointments,
        stylistRows,
        guestsSeen: filteredAppointments.length,
        bridesSeen,
        bridesSold,
        closeRate: getCloseRateValue(closeRateSeen, bridesSold),
        cbRate: cbEligible.length ? cbScheduled.length / cbEligible.length : 0,
        addOnRate: filteredAppointments.length ? addOnCount / filteredAppointments.length : 0,
        averageDuration: durationPool.length
          ? Math.round(
              durationPool.reduce((sum, appointment) => {
                if (!appointment.timeOut) return sum;
                return sum + Math.max(Math.round((appointment.timeOut.getTime() - appointment.timeIn.getTime()) / 60000), 0);
              }, 0) / durationPool.length
            )
          : 0
      };
    });

  const storeRows = perStoreMetrics.slice().sort((a, b) => {
    const primary = compareSortValues(
      getSortValue(a as unknown as Record<string, string | number>, storeSortKey),
      getSortValue(b as unknown as Record<string, string | number>, storeSortKey),
      storeSortDirection
    );
    if (primary !== 0) return primary;
    return a.storeLabel.localeCompare(b.storeLabel);
  });

  const leaderboard = perStoreMetrics
    .flatMap((metric) => metric.stylistRows)
    .filter(hasMeaningfulStylistMetrics)
    .sort((a, b) => {
      const primary = compareSortValues(
        getSortValue(a as unknown as Record<string, string | number>, sortKey),
        getSortValue(b as unknown as Record<string, string | number>, sortKey),
        sortDirection
      );
      if (primary !== 0) return primary;
      const secondary = a.storeLabel.localeCompare(b.storeLabel);
      if (secondary !== 0) return secondary;
      return a.name.localeCompare(b.name);
    });

  const combinedGuestsSeen = perStoreMetrics.reduce((sum, metric) => sum + metric.guestsSeen, 0);
  const combinedBridesSeen = perStoreMetrics.reduce((sum, metric) => sum + metric.bridesSeen, 0);
  const combinedBridesSold = perStoreMetrics.reduce((sum, metric) => sum + metric.bridesSold, 0);
  const combinedAverageDurationPool = perStoreMetrics.filter((metric) => metric.averageDuration > 0);

    return {
      filters,
      filterSummary: getFilterSummary(filters),
      selectedStoreLabel: stores.find((store) => store.slug === filters.store)?.name || "",
      stores: storeRows,
      pricePointOptions: Array.from(
        new Set(
          filteredStores.flatMap((store) =>
            store.options
              .filter((option) => option.kind === StoreOptionKind.PRICE_POINT)
              .map((option) => option.label)
          )
        )
      ).sort((a, b) => a.localeCompare(b)),
      appointmentTypeOptions: Array.from(
        new Set(
          filteredStores.flatMap((store) =>
            store.options
              .filter(
                (option) =>
                  option.kind === StoreOptionKind.APPOINTMENT_TYPE || option.kind === StoreOptionKind.WALK_IN_TYPE
              )
              .map((option) => option.label)
          )
        )
      ).sort((a, b) => a.localeCompare(b)),
      storeOptions: stores.map((store) => ({ value: store.slug, label: store.name })),
      summaryCards: [
        { label: "Reporting Window", value: getFilterSummary(filters), compact: true },
        { label: "Guests Seen", value: String(combinedGuestsSeen) },
        { label: "Brides Seen", value: String(combinedBridesSeen) },
        { label: "Brides Sold", value: String(combinedBridesSold) },
        {
          label: "Combined Close Rate",
          value: formatPercent(getCloseRateValue(combinedBridesSeen, combinedBridesSold))
        },
        {
          label: "Average Duration",
          value: combinedAverageDurationPool.length
            ? formatMinutes(
                Math.round(
                  combinedAverageDurationPool.reduce((sum, metric) => sum + metric.averageDuration, 0) /
                    combinedAverageDurationPool.length
                )
              )
            : "0m"
        }
      ],
      leaderboard,
      totalStoreRows: perStoreMetrics.length,
      leaderboardSort: {
        key: sortKey,
        direction: sortDirection
      },
      storeSort: {
        key: storeSortKey,
        direction: storeSortDirection
      }
    };
  });
}
