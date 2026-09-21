import { VisitType } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { runTimed } from "@/lib/server-performance";
import { getStoreViewShell } from "@/lib/store-views";

/**
 * Walk-in demand analysis used by the Scheduling tab.
 *
 * Walk-ins are the unscheduled half of the day — you can see booked appointments
 * on the calendar, but not these. Knowing when they historically arrive is what
 * lets a manager leave the right amount of stylist capacity free.
 */

/** Each store's own wall-clock timezone. Arrival times only mean something in
 *  the store's local time, not the viewer's — a manager in Texas looking at
 *  Atlanta must still see Atlanta's afternoon. */
const STORE_TIMEZONES: Record<string, string> = {
  atlanta: "America/New_York",
  galleria: "America/Chicago",
  curve: "America/Chicago",
  "san-antonio": "America/Chicago"
};
const DEFAULT_TIMEZONE = "America/Chicago";

/** Hours the stores actually trade. Anything outside this is a mistyped time. */
export const OPEN_HOUR_START = 9;
export const OPEN_HOUR_END = 20;

/** Longest plausible appointment. Beyond this the checkout was almost certainly
 *  never done, or done the next day. */
const MAX_PLAUSIBLE_MINUTES = 360;

/** A month needs at least this many store-days before its index means anything.
 *  A part-month (like the current one) would otherwise read as a fake slump. */
const MIN_STORE_DAYS_FOR_INDEX = 20;

export type SeasonalMonth = {
  month: number;
  label: string;
  /** 1.00 = an average month. null when there is no usable history yet. */
  index: number | null;
  perStoreDay: number;
  storeDays: number;
};

export type HourCell = { walkins: number; booked: number };
export type SchedulingData = {
  storeName: string;
  months: number;
  /** Pooled across every store — see getSeasonalIndex for why. */
  seasonal: SeasonalMonth[];
  seasonalMonthsWithData: number;
  /** dow (0=Sun) → hour → counts */
  gridByDow: Record<number, Record<number, HourCell>>;
  /** dow → number of distinct days the store recorded any new bride */
  openDaysByDow: Record<number, number>;
  totals: {
    walkins: number;
    booked: number;
    walkinsSold: number;
    bookedSold: number;
    walkinCloseRate: number;
    bookedCloseRate: number;
    avgWalkinMinutes: number;
    walkinsPerWeek: number;
  };
  quality: {
    total: number;
    excludedBadHour: number;
    excludedBadDuration: number;
    neverCheckedOut: number;
  };
};

function hourInZone(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    hour12: false,
    timeZone
  }).formatToParts(date);
  const raw = parts.find((p) => p.type === "hour")?.value ?? "0";
  const hour = Number.parseInt(raw, 10);
  return hour === 24 ? 0 : hour;
}

/**
 * Seasonal demand index, pooled across every store.
 *
 * Bridal demand swings hard through the year — January and March run well above
 * a summer month — so a flat 12-month average overstaffs the quiet months and
 * understaffs the busy ones.
 *
 * Two deliberate choices:
 *
 * 1. It is built from *all* new brides, not just walk-ins. Walk-ins number only
 *    50-100 a month, far too few for a stable monthly figure; total demand is an
 *    order of magnitude larger and the walk-in share of it is fairly steady, so
 *    the bigger series gives a much less noisy seasonal shape.
 *
 * 2. It pools every store. Per-store monthly counts are small enough that the
 *    differences between them are mostly noise rather than genuinely different
 *    seasons.
 *
 * IMPORTANT: with only one year of history a seasonal swing cannot be separated
 * from an underlying trend — a decline from January to August looks identical
 * either way. Treat these as provisional until a second year exists to compare.
 */
async function getSeasonalIndex(): Promise<SeasonalMonth[]> {
  const raw = await prisma.$queryRaw<Array<{ month: number; brides: bigint; store_days: bigint }>>`
    SELECT EXTRACT(MONTH FROM a."appointmentDate")::int AS month,
           count(*)::bigint AS brides,
           count(DISTINCT (a."storeId", a."appointmentDate"))::bigint AS store_days
    FROM "Appointment" a
    WHERE a."deletedAt" IS NULL AND a."appointmentTypeLabel" = 'New Bride'
    GROUP BY 1
  `;

  const byMonth = new Map(raw.map((r) => [Number(r.month), r]));
  const usable = raw
    .map((r) => ({ days: Number(r.store_days), rate: Number(r.brides) / Number(r.store_days) }))
    .filter((r) => r.days >= MIN_STORE_DAYS_FOR_INDEX);

  const baseline = usable.length
    ? usable.reduce((sum, r) => sum + r.rate, 0) / usable.length
    : 0;

  const names = ["January","February","March","April","May","June","July","August","September","October","November","December"];

  return names.map((label, i) => {
    const month = i + 1;
    const row = byMonth.get(month);
    const storeDays = row ? Number(row.store_days) : 0;
    const perStoreDay = row && storeDays ? Number(row.brides) / storeDays : 0;
    const reliable = storeDays >= MIN_STORE_DAYS_FOR_INDEX && baseline > 0;
    return {
      month,
      label,
      index: reliable ? perStoreDay / baseline : null,
      perStoreDay,
      storeDays
    };
  });
}

export async function getSchedulingData(storeSlug: string, months = 12): Promise<SchedulingData | null> {
  return runTimed(`getSchedulingData:${storeSlug}`, async () => {
    const shell = await getStoreViewShell(storeSlug);
    if (!shell) return null;

    const since = new Date();
    since.setMonth(since.getMonth() - months);

    const [appointments, seasonal] = await Promise.all([
      prisma.appointment.findMany({
        where: {
          storeId: { in: shell.storeIds },
          deletedAt: null,
          appointmentTypeLabel: "New Bride",
          appointmentDate: { gte: since }
        },
        select: {
          storeId: true,
          appointmentDate: true,
          timeIn: true,
          timeOut: true,
          visitType: true,
          purchased: true
        }
      }),
      getSeasonalIndex()
    ]);

    const zoneFor = new Map(
      shell.sourceStores.map((s) => [s.id, STORE_TIMEZONES[s.slug] ?? DEFAULT_TIMEZONE])
    );

    const gridByDow: Record<number, Record<number, HourCell>> = {};
    // Distinct calendar days per weekday, so "per open day" is a real average.
    const daysSeen: Record<number, Set<string>> = {};

    let walkins = 0;
    let booked = 0;
    let walkinsSold = 0;
    let bookedSold = 0;
    let durationSum = 0;
    let durationCount = 0;
    let excludedBadHour = 0;
    let excludedBadDuration = 0;
    let neverCheckedOut = 0;

    for (const appointment of appointments) {
      const zone = zoneFor.get(appointment.storeId) ?? DEFAULT_TIMEZONE;
      const hour = hourInZone(appointment.timeIn, zone);

      if (hour < OPEN_HOUR_START || hour > OPEN_HOUR_END) {
        excludedBadHour += 1;
        continue;
      }

      const dow = appointment.appointmentDate.getUTCDay();
      // Keyed on the calendar date only, not the store. In the combined view the
      // walk-ins from both stores are pooled, so the denominator must be trading
      // days — otherwise a Saturday when both are open counts twice and halves
      // the rate. For a single store the two are identical.
      const dayKey = appointment.appointmentDate.toISOString().slice(0, 10);

      daysSeen[dow] = daysSeen[dow] ?? new Set<string>();
      daysSeen[dow].add(dayKey);

      gridByDow[dow] = gridByDow[dow] ?? {};
      gridByDow[dow][hour] = gridByDow[dow][hour] ?? { walkins: 0, booked: 0 };

      const isWalkIn = appointment.visitType === VisitType.WALK_IN;
      if (isWalkIn) {
        gridByDow[dow][hour].walkins += 1;
        walkins += 1;
        if (appointment.purchased) walkinsSold += 1;
      } else {
        gridByDow[dow][hour].booked += 1;
        booked += 1;
        if (appointment.purchased) bookedSold += 1;
      }

      if (!appointment.timeOut) {
        neverCheckedOut += 1;
      } else if (isWalkIn) {
        const minutes = (appointment.timeOut.getTime() - appointment.timeIn.getTime()) / 60000;
        if (minutes > 0 && minutes <= MAX_PLAUSIBLE_MINUTES) {
          durationSum += minutes;
          durationCount += 1;
        } else {
          excludedBadDuration += 1;
        }
      }
    }

    const openDaysByDow: Record<number, number> = {};
    Object.entries(daysSeen).forEach(([dow, set]) => {
      openDaysByDow[Number(dow)] = set.size;
    });

    const tradingDays = Object.values(openDaysByDow).reduce((sum, n) => sum + n, 0);
    const distinctWeekdays = Object.keys(openDaysByDow).length || 1;
    const weeks = tradingDays / distinctWeekdays;

    return {
      storeName: shell.store.name,
      months,
      seasonal,
      seasonalMonthsWithData: seasonal.filter((m) => m.index !== null).length,
      gridByDow,
      openDaysByDow,
      totals: {
        walkins,
        booked,
        walkinsSold,
        bookedSold,
        walkinCloseRate: walkins ? walkinsSold / walkins : 0,
        bookedCloseRate: booked ? bookedSold / booked : 0,
        avgWalkinMinutes: durationCount ? Math.round(durationSum / durationCount) : 85,
        walkinsPerWeek: weeks ? walkins / weeks : 0
      },
      quality: {
        total: appointments.length,
        excludedBadHour,
        excludedBadDuration,
        neverCheckedOut
      }
    };
  });
}
