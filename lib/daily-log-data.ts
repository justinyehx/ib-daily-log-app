import { AppointmentStatus, StoreOptionKind, VisitType } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { getAllStoreChoices, getStoreViewShell } from "@/lib/store-views";

export type DailyLogView = "day" | "week" | "month" | "year";

type DailyLogFilters = {
  view: DailyLogView;
  day: string;
  week: string;
  month: string;
  year: string;
  visitType: string;
  appointmentType: string;
  customerName: string;
};

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

function getStartOfWeek(date: Date) {
  const value = startOfDay(date);
  const day = value.getDay();
  const distance = day === 0 ? -6 : 1 - day;
  value.setDate(value.getDate() + distance);
  return value;
}

function getEndOfWeek(date: Date) {
  const value = getStartOfWeek(date);
  value.setDate(value.getDate() + 6);
  return endOfDay(value);
}

function parseWeekValue(weekValue: string) {
  const [yearPart, weekPart] = weekValue.split("-W");
  const year = Number(yearPart);
  const week = Number(weekPart);

  if (!year || !week) return null;

  const firstThursday = new Date(year, 0, 4);
  const start = getStartOfWeek(firstThursday);
  start.setDate(start.getDate() + (week - 1) * 7);
  return {
    start,
    end: getEndOfWeek(start)
  };
}

function formatTime(date: Date | null) {
  if (!date) return "—";

  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}

function formatDate(date: Date | null) {
  if (!date) return "—";

  return new Intl.DateTimeFormat("en-US", {
    month: "numeric",
    day: "numeric",
    year: "numeric"
  }).format(date);
}

function formatDuration(start: Date, end: Date | null) {
  if (!end) return "In progress";

  const diffMs = end.getTime() - start.getTime();
  const totalMinutes = Math.max(Math.round(diffMs / 60000), 0);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (!hours) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
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

function getLatestYearWithLeadSource(
  appointments: Array<{ appointmentDate: Date; leadSourceLabel: string | null }>
) {
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

function getDefaultFilters() {
  const now = new Date();
  const year = now.getFullYear().toString();
  const month = `${year}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const weekStart = getStartOfWeek(now);
  const firstDayOfYear = new Date(now.getFullYear(), 0, 1);
  const weekNumber =
    Math.ceil(((weekStart.getTime() - getStartOfWeek(firstDayOfYear).getTime()) / 86400000 + 1) / 7) || 1;

  return {
    view: "day" as DailyLogView,
    day: month + `-${String(now.getDate()).padStart(2, "0")}`,
    week: `${year}-W${String(weekNumber).padStart(2, "0")}`,
    month,
    year,
    visitType: "",
    appointmentType: "",
    customerName: ""
  };
}

function resolveFilters(searchParams?: Record<string, string | string[] | undefined>) {
  const defaults = getDefaultFilters();
  const read = (key: keyof typeof defaults) => {
    const value = searchParams?.[key];
    return Array.isArray(value) ? value[0] : value;
  };

  const view = read("view");

  return {
    view: view === "week" || view === "month" || view === "year" ? view : defaults.view,
    day: read("day") || defaults.day,
    week: read("week") || defaults.week,
    month: read("month") || defaults.month,
    year: read("year") || defaults.year,
    visitType: read("visitType") || "",
    appointmentType: read("appointmentType") || "",
    customerName: read("customerName") || ""
  } satisfies DailyLogFilters;
}

function hasMeaningfulReportingSearchParams(searchParams?: Record<string, string | string[] | undefined>) {
  if (!searchParams) return false;

  return ["view", "day", "week", "month", "year", "visitType", "appointmentType", "customerName"].some((key) => {
    const value = searchParams[key];
    if (Array.isArray(value)) return value.length > 0;
    return typeof value === "string" && value.length > 0;
  });
}

function getDateRange(filters: DailyLogFilters) {
  if (filters.view === "day") {
    const date = new Date(filters.day);
    return { start: startOfDay(date), end: endOfDay(date) };
  }

  if (filters.view === "week") {
    const parsed = parseWeekValue(filters.week);
    if (parsed) return parsed;
  }

  if (filters.view === "month") {
    const [yearPart, monthPart] = filters.month.split("-");
    const year = Number(yearPart);
    const month = Number(monthPart) - 1;
    const start = new Date(year, month, 1);
    const end = new Date(year, month + 1, 0);
    return { start: startOfDay(start), end: endOfDay(end) };
  }

  const start = new Date(Number(filters.year), 0, 1);
  const end = new Date(Number(filters.year), 11, 31);
  return { start: startOfDay(start), end: endOfDay(end) };
}

function getFilterSummary(filters: DailyLogFilters) {
  let summary = filters.view === "day" ? filters.day : filters.view === "week" ? filters.week : filters.view === "month" ? filters.month : filters.year;
  if (filters.visitType) {
    summary += ` • Visit: ${filters.visitType === "WALK_IN" ? "Walk-in" : "Appointment"}`;
  }
  if (filters.appointmentType) {
    summary += ` • Type: ${filters.appointmentType}`;
  }
  if (filters.customerName) {
    summary += ` • Guest: ${filters.customerName}`;
  }
  return summary;
}

function buildPreviousCustomerProfiles(
  appointments: Array<{
    id: string;
    appointmentDate: Date;
    appointmentTypeLabel: string;
    visitType: VisitType;
    comments: string | null;
    leadSourceLabel: string | null;
    pricePointLabel: string | null;
    sizeLabel: string | null;
    purchased: boolean | null;
    otherPurchase: boolean | null;
    storeId: string;
    wearDate: Date | null;
    customer: {
      fullName: string;
      normalizedFullName: string;
    };
    assignedStaffMember: {
      fullName: string;
    } | null;
    location: {
      name: string;
    } | null;
  }>,
  storeNamesById: Map<string, string>
) {
  const purchasedGuestNames = new Set(
    appointments
      .filter((appointment) => appointment.purchased === true)
      .map((appointment) => appointment.customer.normalizedFullName)
      .filter(Boolean)
  );
  const latestByGuest = new Map<
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

  appointments.forEach((appointment) => {
    const normalizedGuestName = appointment.customer.normalizedFullName;
    if (!normalizedGuestName || latestByGuest.has(normalizedGuestName)) {
      return;
    }

    latestByGuest.set(normalizedGuestName, {
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
      hasPreviousPurchase: purchasedGuestNames.has(normalizedGuestName),
      storeId: appointment.storeId,
      storeName: storeNamesById.get(appointment.storeId) || ""
    });
  });

  return Array.from(latestByGuest.values());
}

export async function getDailyLogData(
  storeSlug: string,
  searchParams?: Record<string, string | string[] | undefined>
) {
  const shell = await getStoreViewShell(storeSlug);
  if (!shell) {
    return null;
  }
  const store = shell.store;

  const today = new Date();
  const todayStart = startOfDay(today);
  const todayEnd = endOfDay(today);

  const todaysSummary = await prisma.appointment.findMany({
    where: {
      storeId: {
        in: shell.storeIds
      },
      appointmentDate: {
        gte: todayStart,
        lte: todayEnd
      }
    },
    select: {
      status: true,
      purchased: true
    }
  });

  let effectiveSearchParams = searchParams;
  if (!hasMeaningfulReportingSearchParams(searchParams)) {
    const latestAppointment = await prisma.appointment.findFirst({
      where: {
        storeId: {
          in: shell.storeIds
        }
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

  const filters = resolveFilters(effectiveSearchParams);
  const dateRange = getDateRange(filters);

  const appointments = await prisma.appointment.findMany({
    where: {
      storeId: {
        in: shell.storeIds
      },
      appointmentDate: {
        gte: dateRange.start,
        lte: dateRange.end
      },
      ...(filters.appointmentType
        ? {
            appointmentTypeLabel: filters.appointmentType
          }
        : {}),
      ...(filters.visitType
        ? {
            visitType: filters.visitType === "WALK_IN" ? VisitType.WALK_IN : VisitType.APPOINTMENT
          }
        : {}),
      ...(filters.customerName
        ? {
            customer: {
              normalizedFullName: {
                contains: filters.customerName.trim().toLowerCase().replace(/\s+/g, " ")
              }
            }
          }
        : {})
    },
    include: {
      customer: true,
      assignedStaffMember: true,
      location: true
    },
    orderBy: [{ appointmentDate: "desc" }, { timeIn: "desc" }]
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
  const storeNamesById = new Map(shell.sourceStores.map((entry) => [entry.id, entry.name]));

  return {
    store: {
      slug: store.slug,
      name: store.name
    },
    stores: await getAllStoreChoices(),
    snapshot: {
      activeNow: todaysSummary.filter((entry) => entry.status === AppointmentStatus.ACTIVE).length,
      waiting: todaysSummary.filter((entry) => entry.status === AppointmentStatus.WAITING).length,
      soldToday: todaysSummary.filter((entry) => entry.purchased === true).length
    },
    filters,
    filterSummary: getFilterSummary(filters),
    appointmentTypeOptions: store.options
      .filter((option) => option.kind === "APPOINTMENT_TYPE" || option.kind === "WALK_IN_TYPE")
      .map((option) => option.label),
    workflowOptions: {
      storeId: shell.isVirtualStore ? "" : store.id,
      isVirtualStore: shell.isVirtualStore,
      storeConfigs: shell.sourceStores.map((sourceStore) => ({
        storeId: sourceStore.id,
        slug: sourceStore.slug,
        name: sourceStore.name,
        appointmentTypes: sourceStore.options
          .filter((option) => option.kind === StoreOptionKind.APPOINTMENT_TYPE)
          .map((option) => ({ id: option.id, label: option.label })),
        walkInTypes: sourceStore.options
          .filter((option) => option.kind === StoreOptionKind.WALK_IN_TYPE)
          .map((option) => ({ id: option.id, label: option.label })),
        leadSources: sourceStore.options
          .filter((option) => option.kind === StoreOptionKind.LEAD_SOURCE)
          .map((option) => ({ id: option.id, label: option.label })),
        pricePoints: sourceStore.options
          .filter((option) => option.kind === StoreOptionKind.PRICE_POINT)
          .map((option) => ({ id: option.id, label: option.label })),
        sizes: sourceStore.options
          .filter((option) => option.kind === StoreOptionKind.SIZE)
          .map((option) => ({ id: option.id, label: option.label })),
        staffMembers: sourceStore.staffMembers.map((staffMember) => ({
          id: staffMember.id,
          fullName: staffMember.fullName,
          role: staffMember.role
        })),
        locations: sourceStore.locations.map((location) => ({
          id: location.id,
          name: location.name
        }))
      })).map((config) => ({
        ...config,
        leadSources: sortOptionsByYearFrequency(
          config.leadSources,
          historicalAppointments.filter((appointment) => appointment.storeId === config.storeId)
        )
      })),
      appointmentTypes: dedupeByLabel(
        shell.sourceStores.flatMap((sourceStore) =>
          sourceStore.options
            .filter((option) => option.kind === StoreOptionKind.APPOINTMENT_TYPE)
            .map((option) => ({ id: option.id, label: option.label }))
        )
      ),
      walkInTypes: dedupeByLabel(
        shell.sourceStores.flatMap((sourceStore) =>
          sourceStore.options
            .filter((option) => option.kind === StoreOptionKind.WALK_IN_TYPE)
            .map((option) => ({ id: option.id, label: option.label }))
        )
      ),
      leadSources: sortOptionsByYearFrequency(
        dedupeByLabel(
          shell.sourceStores.flatMap((sourceStore) =>
            sourceStore.options
              .filter((option) => option.kind === StoreOptionKind.LEAD_SOURCE)
              .map((option) => ({ id: option.id, label: option.label }))
          )
        ),
        historicalAppointments
      ),
      pricePoints: dedupeByLabel(
        shell.sourceStores.flatMap((sourceStore) =>
          sourceStore.options
            .filter((option) => option.kind === StoreOptionKind.PRICE_POINT)
            .map((option) => ({ id: option.id, label: option.label }))
        )
      ),
      sizes: dedupeByLabel(
        shell.sourceStores.flatMap((sourceStore) =>
          sourceStore.options
            .filter((option) => option.kind === StoreOptionKind.SIZE)
            .map((option) => ({ id: option.id, label: option.label }))
        )
      ),
      staffMembers: dedupeByLabel(
        shell.sourceStores.flatMap((sourceStore) =>
          sourceStore.staffMembers.map((staffMember) => ({
            id: staffMember.id,
            label: staffMember.fullName,
            fullName: staffMember.fullName,
            role: staffMember.role
          }))
        )
      ).map(({ id, fullName, role }) => ({ id, fullName, role })),
      locations: dedupeByLabel(
        shell.sourceStores.flatMap((sourceStore) =>
          sourceStore.locations.map((location) => ({
            id: location.id,
            label: location.name,
            name: location.name
          }))
        )
      ).map(({ id, name }) => ({ id, name }))
    },
    previousCustomerProfiles: buildPreviousCustomerProfiles(historicalAppointments, storeNamesById),
    searchRows: historicalAppointments
      .filter((appointment) => {
        if (!filters.customerName) return false;
        return (
          appointment.customer.normalizedFullName.includes(
            filters.customerName.trim().toLowerCase().replace(/\s+/g, " ")
          ) || appointment.customer.fullName.toLowerCase().includes(filters.customerName.trim().toLowerCase())
        );
      })
      .slice(0, 40)
      .map((appointment) => ({
        id: appointment.id,
        storeName: storeNamesById.get(appointment.storeId) || store.name,
        date: formatDate(appointment.appointmentDate),
        guestName: appointment.customer.fullName,
        assignedTo: appointment.assignedStaffMember?.fullName || "Unassigned",
        appointmentType: appointment.appointmentTypeLabel,
        location: appointment.location?.name || "Unassigned",
        timeIn: formatTime(appointment.timeIn),
        timeOut: formatTime(appointment.timeOut),
        heardAbout: appointment.leadSourceLabel || "—",
        pricePoint: appointment.pricePointLabel || "—",
        purchased: appointment.purchased === null ? "Pending" : appointment.purchased ? "Yes" : "No",
        otherSale:
          appointment.otherPurchase === null ? "Pending" : appointment.otherPurchase ? "Yes" : "No",
        comments: appointment.comments || "—",
        status:
          appointment.status === AppointmentStatus.COMPLETE
            ? "Complete"
            : appointment.status === AppointmentStatus.WAITING
              ? "Waiting"
              : "Active"
      })),
    rows: appointments.map((appointment) => ({
      id: appointment.id,
      storeName: storeNamesById.get(appointment.storeId) || store.name,
      appointmentDateRaw: appointment.appointmentDate.toISOString().slice(0, 10),
      date: formatDate(appointment.appointmentDate),
      guestName: appointment.customer.fullName,
      visitTypeRaw: appointment.visitType,
      assignedTo: appointment.assignedStaffMember?.fullName || "Unassigned",
      assignedStaffMemberId: appointment.assignedStaffMember?.id || "",
      appointmentTypeOptionId: appointment.appointmentTypeOptionId || "",
      appointmentType: appointment.appointmentTypeLabel,
      visitType: appointment.visitType === "WALK_IN" ? "Walk-in" : "Appointment",
      location: appointment.location?.name || "Unassigned",
      locationId: appointment.location?.id || "",
      timeInRaw: appointment.timeIn.toTimeString().slice(0, 5),
      timeIn: formatTime(appointment.timeIn),
      timeOutRaw: appointment.timeOut ? appointment.timeOut.toTimeString().slice(0, 5) : "",
      timeOut: formatTime(appointment.timeOut),
      duration: formatDuration(appointment.timeIn, appointment.timeOut),
      leadSourceOptionId: appointment.leadSourceOptionId || "",
      heardAbout: appointment.leadSourceLabel || "—",
      pricePointOptionId: appointment.pricePointOptionId || "",
      pricePoint: appointment.pricePointLabel || "—",
      sizeOptionId: appointment.sizeOptionId || "",
      size: appointment.sizeLabel || "—",
      wearDateRaw: appointment.wearDate ? appointment.wearDate.toISOString().slice(0, 10) : "",
      purchased: appointment.purchased === null ? "Pending" : appointment.purchased ? "Yes" : "No",
      otherSale:
        appointment.otherPurchase === null ? "Pending" : appointment.otherPurchase ? "Yes" : "No",
      statusRaw: appointment.status,
      status:
        appointment.status === AppointmentStatus.COMPLETE
          ? "Complete"
          : appointment.status === AppointmentStatus.WAITING
            ? "Waiting"
            : "Active",
      comments: appointment.comments || "—",
      commentsRaw: appointment.comments || ""
    }))
  };
}
