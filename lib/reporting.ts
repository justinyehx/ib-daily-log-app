import { AppointmentStatus, VisitType, type Appointment, type Customer, type Location, type StaffMember } from "@prisma/client";

export type ReportingView = "day" | "week" | "twoWeek" | "month" | "year";

export type ReportingFilters = {
  store: string;
  view: ReportingView;
  day: string;
  week: string;
  twoWeek: string;
  month: string;
  year: string;
  pricePoint: string;
  appointmentType: string;
  visitType: string;
};

export type ReportingAppointment = Appointment & {
  customer: Customer;
  assignedStaffMember: StaffMember | null;
  location: Location | null;
};

export function startOfDay(date: Date) {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
}

export function endOfDay(date: Date) {
  const value = new Date(date);
  value.setHours(23, 59, 59, 999);
  return value;
}

export function getStartOfWeek(date: Date) {
  const value = startOfDay(date);
  const day = value.getDay();
  const distance = day === 0 ? -6 : 1 - day;
  value.setDate(value.getDate() + distance);
  return value;
}

export function getEndOfWeek(date: Date) {
  const value = getStartOfWeek(date);
  value.setDate(value.getDate() + 6);
  return endOfDay(value);
}

export function parseWeekValue(weekValue: string) {
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

function formatDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getPreviousTwoWeekStart(date: Date) {
  const currentWeekStart = getStartOfWeek(date);
  currentWeekStart.setDate(currentWeekStart.getDate() - 14);
  return currentWeekStart;
}

function formatMonthSummary(monthValue: string) {
  const [yearPart, monthPart] = monthValue.split("-");
  const year = Number(yearPart);
  const month = Number(monthPart);

  if (!year || !month) return monthValue;

  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric"
  }).format(new Date(year, month - 1, 1));
}

export function getDefaultReportingFilters(): ReportingFilters {
  const now = new Date();
  const year = now.getFullYear().toString();
  const month = `${year}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const weekStart = getStartOfWeek(now);
  const firstDayOfYear = new Date(now.getFullYear(), 0, 1);
  const weekNumber =
    Math.ceil(((weekStart.getTime() - getStartOfWeek(firstDayOfYear).getTime()) / 86400000 + 1) / 7) || 1;

  return {
    store: "",
    view: "day",
    day: formatDateInputValue(now),
    week: `${year}-W${String(weekNumber).padStart(2, "0")}`,
    twoWeek: formatDateInputValue(getPreviousTwoWeekStart(now)),
    month,
    year,
    pricePoint: "",
    appointmentType: "",
    visitType: ""
  };
}

export function resolveReportingFilters(searchParams?: Record<string, string | string[] | undefined>) {
  const defaults = getDefaultReportingFilters();
  const read = (key: keyof ReportingFilters) => {
    const value = searchParams?.[key];
    return Array.isArray(value) ? value[0] : value;
  };

  const view = read("view");

  return {
    store: read("store") || "",
    view:
      view === "week" || view === "twoWeek" || view === "month" || view === "year"
        ? view
        : defaults.view,
    day: read("day") || defaults.day,
    week: read("week") || defaults.week,
    twoWeek: read("twoWeek") || defaults.twoWeek,
    month: read("month") || defaults.month,
    year: read("year") || defaults.year,
    pricePoint: read("pricePoint") || "",
    appointmentType: read("appointmentType") || "",
    visitType: read("visitType") || ""
  } satisfies ReportingFilters;
}

export function getDateRange(filters: ReportingFilters) {
  if (filters.view === "day") {
    const date = new Date(filters.day);
    return { start: startOfDay(date), end: endOfDay(date) };
  }

  if (filters.view === "week") {
    const parsed = parseWeekValue(filters.week);
    if (parsed) return parsed;
  }

  if (filters.view === "twoWeek") {
    const start = getStartOfWeek(new Date(filters.twoWeek));
    const end = new Date(start);
    end.setDate(end.getDate() + 13);
    return { start, end: endOfDay(end) };
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

export function getFilterSummary(filters: ReportingFilters) {
  let summary =
    filters.view === "day"
      ? filters.day
      : filters.view === "week"
        ? filters.week
        : filters.view === "twoWeek"
          ? `${formatDate(getDateRange(filters).start)} - ${formatDate(getDateRange(filters).end)}`
          : filters.view === "month"
            ? formatMonthSummary(filters.month)
            : filters.year;

  if (filters.store) {
    summary = `${filters.store} • ${summary}`;
  }

  if (filters.pricePoint) {
    summary += ` • Price: ${filters.pricePoint}`;
  }

  if (filters.visitType) {
    summary += ` • Visit: ${filters.visitType === "WALK_IN" ? "Walk-in" : "Appointment"}`;
  }

  if (filters.appointmentType) {
    summary += ` • Type: ${filters.appointmentType}`;
  }

  return summary;
}

export function matchesReportingAppointmentType(appointment: ReportingAppointment, appointmentType: string) {
  if (!appointmentType) return true;

  if (appointmentType === "Comeback Bride") {
    return (
      appointment.appointmentTypeLabel === "Comeback Bride" ||
      appointment.appointmentTypeLabel === "Comeback Bride - Same Day"
    );
  }

  return appointment.appointmentTypeLabel === appointmentType;
}

export function applyAppointmentFilters(
  appointments: ReportingAppointment[],
  filters: ReportingFilters
) {
  return appointments.filter((appointment) => {
    if (filters.pricePoint && appointment.pricePointLabel !== filters.pricePoint) {
      return false;
    }

    if (filters.visitType && appointment.visitType !== filters.visitType) {
      return false;
    }

    if (filters.appointmentType && !matchesReportingAppointmentType(appointment, filters.appointmentType)) {
      return false;
    }

    return true;
  });
}

export function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

export function formatTime(date: Date | null) {
  if (!date) return "—";

  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}

export function formatDate(date: Date | null) {
  if (!date) return "—";

  return new Intl.DateTimeFormat("en-US", {
    month: "numeric",
    day: "numeric",
    year: "numeric"
  }).format(date);
}

export function formatDuration(start: Date, end: Date | null) {
  if (!end) return "In progress";
  return formatMinutes(durationInMinutes(start, end));
}

export function durationInMinutes(start: Date, end: Date | null) {
  if (!end) return 0;
  return Math.max(Math.round((end.getTime() - start.getTime()) / 60000), 0);
}

export function formatMinutes(totalMinutes: number) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (!hours) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}

export function isBridesSeenType(type: string) {
  return type === "New Bride" || type === "Comeback Bride";
}

export function isAverageDurationType(type: string) {
  return type === "New Bride" || type === "Comeback Bride";
}

export function isCompletedForAverageDuration(appointment: ReportingAppointment) {
  return Boolean(appointment.timeOut);
}

export function hasScheduledComeback(appointment: ReportingAppointment) {
  return appointment.cbAppointmentScheduled || Boolean(appointment.cbAppointmentAt);
}

function getCloseRateSeenAppointments(appointments: ReportingAppointment[], filters: ReportingFilters) {
  if (filters.appointmentType === "Comeback Bride") {
    return appointments.filter((appointment) => appointment.appointmentTypeLabel === "Comeback Bride");
  }

  return appointments.filter((appointment) => appointment.appointmentTypeLabel === "New Bride");
}

function getCloseRateSoldAppointments(appointments: ReportingAppointment[], filters: ReportingFilters) {
  if (filters.appointmentType === "Comeback Bride") {
    return appointments.filter(
      (appointment) =>
        (appointment.appointmentTypeLabel === "Comeback Bride" ||
          appointment.appointmentTypeLabel === "Comeback Bride - Same Day") &&
        appointment.purchased === true
    );
  }

  return appointments.filter(
    (appointment) =>
      (appointment.appointmentTypeLabel === "New Bride" ||
        appointment.appointmentTypeLabel === "Comeback Bride" ||
        appointment.appointmentTypeLabel === "Comeback Bride - Same Day") &&
      appointment.purchased === true
  );
}

export function getCloseRateValue(seen: number, sold: number) {
  if (!seen && sold > 0) return 1;
  if (!seen) return 0;
  return sold / seen;
}

export function hasMeaningfulStylistMetrics(row: {
  appointmentsCount: number;
  bridesSeen: number;
  bridesSold: number;
  averageDuration: number;
  cbRate: number;
  addOnRate: number;
}) {
  return (
    row.appointmentsCount > 0 ||
    row.bridesSeen > 0 ||
    row.bridesSold > 0 ||
    row.averageDuration > 0 ||
    row.cbRate > 0 ||
    row.addOnRate > 0
  );
}

export function getSizeSortValue(label: string) {
  const normalized = label.trim().toLowerCase();
  const match = normalized.match(/(\d+(?:\.\d+)?)/);
  if (match) {
    return Number(match[1]);
  }

  if (normalized.includes("xs")) return 0;
  if (normalized.includes("small")) return 2;
  if (normalized === "s") return 2;
  if (normalized.includes("medium")) return 4;
  if (normalized === "m") return 4;
  if (normalized.includes("large")) return 6;
  if (normalized === "l") return 6;
  if (normalized.includes("xl")) return 8;

  return Number.MAX_SAFE_INTEGER;
}

export function stylistMetricsFromAppointments(
  name: string,
  appointments: ReportingAppointment[],
  filters: ReportingFilters
) {
  const stylistAppointments = appointments.filter((appointment) => appointment.assignedStaffMember?.fullName === name);
  const bridesSeen = stylistAppointments.filter((appointment) => isBridesSeenType(appointment.appointmentTypeLabel)).length;
  const averageDurationAppointments = stylistAppointments.filter(
    (appointment) => isAverageDurationType(appointment.appointmentTypeLabel) && isCompletedForAverageDuration(appointment)
  );
  const closeRateSeen = getCloseRateSeenAppointments(stylistAppointments, filters);
  const closeRateSales = getCloseRateSoldAppointments(stylistAppointments, filters);
  const cbEligible = stylistAppointments.filter(
    (appointment) => appointment.appointmentTypeLabel === "New Bride" && appointment.purchased === false
  );
  const cbCount = cbEligible.filter((appointment) => hasScheduledComeback(appointment));
  const addOnCount = stylistAppointments.filter((appointment) => appointment.otherPurchase === true);
  const averageDuration = averageDurationAppointments.length
    ? Math.round(
        averageDurationAppointments.reduce((sum, appointment) => sum + durationInMinutes(appointment.timeIn, appointment.timeOut), 0) /
          averageDurationAppointments.length
      )
    : 0;

  return {
    name,
    appointments: stylistAppointments,
    appointmentsCount: stylistAppointments.length,
    bridesSeen,
    bridesSold: closeRateSales.length,
    closeRateSeenCount: closeRateSeen.length,
    closeRate: getCloseRateValue(closeRateSeen.length, closeRateSales.length),
    cbRate: cbEligible.length ? cbCount.length / cbEligible.length : 0,
    addOnRate: stylistAppointments.length ? addOnCount.length / stylistAppointments.length : 0,
    averageDuration
  };
}

export function uniqueGuestCounts(
  appointments: ReportingAppointment[],
  selector: (appointment: ReportingAppointment) => string | null | undefined
) {
  const byLabel = new Map<string, Set<string>>();

  appointments.forEach((appointment) => {
    const label = selector(appointment);
    const guestKey = appointment.customer.normalizedFullName;
    if (!label || !guestKey) return;
    if (!byLabel.has(label)) byLabel.set(label, new Set());
    byLabel.get(label)?.add(guestKey);
  });

  return Array.from(byLabel.entries())
    .map(([label, guests]) => ({ label, value: guests.size }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
}

export function countByLabel(
  appointments: ReportingAppointment[],
  selector: (appointment: ReportingAppointment) => string | null | undefined
) {
  const counts = new Map<string, number>();

  appointments.forEach((appointment) => {
    const label = selector(appointment);
    if (!label) return;
    counts.set(label, (counts.get(label) || 0) + 1);
  });

  return Array.from(counts.entries())
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
}

export function getPricePointSortValue(label: string) {
  const match = label.match(/\d[\d,]*/);
  if (!match) return Number.MAX_SAFE_INTEGER;
  return Number(match[0].replace(/,/g, ""));
}
