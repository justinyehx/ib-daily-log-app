import { AppointmentStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { runTimed } from "@/lib/server-performance";
import { getAllStoreChoices, getStoreViewShell } from "@/lib/store-views";
import { getTodayDateString } from "@/lib/tz-utils";

// ─── Types ────────────────────────────────────────────────────────────────────

export type TimelineBlock = {
  id: string;
  guestName: string;
  appointmentType: string;
  visitType: string;
  timeInMs: number;
  timeOutMs: number | null; // null = still in progress / no checkout time
  durationMinutes: number | null;
  status: string;
  purchased: boolean | null;
  storeId: string;
  storeName: string;
};

export type StylistTimelineRow = {
  stylistId: string;
  stylistName: string;
  role: string;
  blocks: TimelineBlock[]; // sorted by timeInMs ascending
  totalFloorMinutes: number;
  totalGapMinutes: number;
};

export type WeekDaySummary = {
  date: string;     // YYYY-MM-DD
  dayLabel: string; // "Mon 5/12"
  stylistStats: Array<{
    stylistId: string;
    appointmentCount: number;
    floorMinutes: number;
    gapMinutes: number;
  }>;
};

export type TimelineData = {
  store: { slug: string; name: string };
  stores: Array<{ slug: string; name: string }>;
  snapshot: { activeNow: number; waiting: number; soldToday: number };
  date: string;
  todayDateStr: string;
  // Day view
  stylistRows: StylistTimelineRow[];
  seamstressRows: StylistTimelineRow[];
  unassignedBlocks: TimelineBlock[];
  trackStartMs: number;
  trackEndMs: number;
  hasData: boolean;
  // Week summary
  weekDays: WeekDaySummary[];
  allStylists: Array<{ stylistId: string; stylistName: string; role: string }>;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getWeekDays(dateStr: string): string[] {
  const [y, m, d] = dateStr.split("-").map(Number);
  const pivot = new Date(Date.UTC(y, m - 1, d));
  const dow = pivot.getUTCDay(); // 0=Sun, 1=Mon…6=Sat
  const daysFromMon = dow === 0 ? 6 : dow - 1;
  const days: string[] = [];
  for (let i = 0; i < 7; i++) {
    const dt = new Date(Date.UTC(y, m - 1, d));
    dt.setUTCDate(pivot.getUTCDate() - daysFromMon + i);
    days.push(dt.toISOString().slice(0, 10));
  }
  return days;
}

export function formatDayLabel(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return `${dayNames[date.getUTCDay()]} ${m}/${d}`;
}

function computeGapMinutes(blocks: TimelineBlock[]): number {
  if (blocks.length < 2) return 0;
  let total = 0;
  for (let i = 1; i < blocks.length; i++) {
    const prev = blocks[i - 1];
    const curr = blocks[i];
    if (prev.timeOutMs && curr.timeInMs > prev.timeOutMs) {
      total += (curr.timeInMs - prev.timeOutMs) / 60000;
    }
  }
  return Math.round(total);
}

function buildStylistRow(
  stylistId: string,
  stylistName: string,
  role: string,
  appts: Array<{
    id: string;
    timeIn: Date;
    timeOut: Date | null;
    appointmentTypeLabel: string;
    visitType: string;
    status: string;
    purchased: boolean | null;
    storeId: string;
    storeName: string;
    guestName: string;
  }>
): StylistTimelineRow {
  const blocks: TimelineBlock[] = appts
    .map((a) => ({
      id: a.id,
      guestName: a.guestName,
      appointmentType: a.appointmentTypeLabel,
      visitType: a.visitType,
      timeInMs: a.timeIn.getTime(),
      timeOutMs: a.timeOut?.getTime() ?? null,
      durationMinutes: a.timeOut
        ? Math.round((a.timeOut.getTime() - a.timeIn.getTime()) / 60000)
        : null,
      status: a.status,
      purchased: a.purchased,
      storeId: a.storeId,
      storeName: a.storeName,
    }))
    .sort((a, b) => a.timeInMs - b.timeInMs);

  const totalFloorMinutes = Math.round(
    blocks.reduce((sum, b) => sum + (b.durationMinutes ?? 0), 0)
  );

  return {
    stylistId,
    stylistName,
    role,
    blocks,
    totalFloorMinutes,
    totalGapMinutes: computeGapMinutes(blocks),
  };
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function getTimelineData(
  storeSlug: string,
  date: string,
  timezone = "UTC"
): Promise<TimelineData | null> {
  return runTimed(`getTimelineData:${storeSlug}:${date}`, async () => {
    const shell = await getStoreViewShell(storeSlug);
    if (!shell) return null;

    const todayDateStr = getTodayDateString(timezone);
    const weekDayStrs = getWeekDays(date);

    const [wy, wm, wd] = weekDayStrs[0].split("-").map(Number);
    const [ey, em, ed] = weekDayStrs[6].split("-").map(Number);

    const [weekAppointments, todaySummary, stores] = await Promise.all([
      prisma.appointment.findMany({
        where: {
          storeId: { in: shell.storeIds },
          deletedAt: null,
          appointmentDate: {
            gte: new Date(Date.UTC(wy, wm - 1, wd, 0, 0, 0)),
            lte: new Date(Date.UTC(ey, em - 1, ed, 23, 59, 59, 999)),
          },
          status: { not: AppointmentStatus.CANCELLED },
        },
        select: {
          id: true,
          storeId: true,
          appointmentDate: true,
          timeIn: true,
          timeOut: true,
          appointmentTypeLabel: true,
          visitType: true,
          status: true,
          purchased: true,
          assignedStaffMember: {
            select: { id: true, fullName: true, role: true },
          },
          customer: { select: { fullName: true } },
        },
        orderBy: [{ appointmentDate: "asc" }, { timeIn: "asc" }],
      }),
      prisma.appointment.findMany({
        where: {
          storeId: { in: shell.storeIds },
          deletedAt: null,
          appointmentDate: {
            gte: new Date(`${todayDateStr}T00:00:00.000Z`),
            lte: new Date(`${todayDateStr}T23:59:59.999Z`),
          },
        },
        select: { status: true, purchased: true },
      }),
      getAllStoreChoices(),
    ]);

    const storeNamesById = new Map(
      shell.sourceStores.map((s) => [s.id, s.name])
    );

    // ── Day view ──────────────────────────────────────────────────────────────

    const dayAppts = weekAppointments
      .filter((a) => a.appointmentDate.toISOString().slice(0, 10) === date)
      .map((a) => ({
        id: a.id,
        timeIn: a.timeIn,
        timeOut: a.timeOut,
        appointmentTypeLabel: a.appointmentTypeLabel,
        visitType: a.visitType,
        status: a.status,
        purchased: a.purchased,
        storeId: a.storeId,
        storeName: storeNamesById.get(a.storeId) ?? shell.store.name,
        guestName: a.customer.fullName,
        stylistId: a.assignedStaffMember?.id ?? null,
        stylistName: a.assignedStaffMember?.fullName ?? null,
        stylistRole: a.assignedStaffMember?.role ?? null,
      }));

    // Group by stylist
    const stylistBuckets = new Map<
      string,
      { name: string; role: string; appts: typeof dayAppts }
    >();

    for (const a of dayAppts) {
      if (!a.stylistId) continue;
      const existing = stylistBuckets.get(a.stylistId);
      if (existing) {
        existing.appts.push(a);
      } else {
        stylistBuckets.set(a.stylistId, {
          name: a.stylistName!,
          role: a.stylistRole!,
          appts: [a],
        });
      }
    }

    const stylistRows: StylistTimelineRow[] = [];
    const seamstressRows: StylistTimelineRow[] = [];

    for (const [id, { name, role, appts }] of stylistBuckets) {
      const row = buildStylistRow(id, name, role, appts);
      if (role === "SEAMSTRESS") {
        seamstressRows.push(row);
      } else {
        stylistRows.push(row);
      }
    }

    stylistRows.sort((a, b) => a.stylistName.localeCompare(b.stylistName));
    seamstressRows.sort((a, b) => a.stylistName.localeCompare(b.stylistName));

    const unassigned = dayAppts.filter((a) => !a.stylistId);
    const unassignedBlocks: TimelineBlock[] = unassigned
      .map((a) => ({
        id: a.id,
        guestName: a.guestName,
        appointmentType: a.appointmentTypeLabel,
        visitType: a.visitType,
        timeInMs: a.timeIn.getTime(),
        timeOutMs: a.timeOut?.getTime() ?? null,
        durationMinutes: a.timeOut
          ? Math.round((a.timeOut.getTime() - a.timeIn.getTime()) / 60000)
          : null,
        status: a.status,
        purchased: a.purchased,
        storeId: a.storeId,
        storeName: a.storeName,
      }))
      .sort((a, b) => a.timeInMs - b.timeInMs);

    // Track bounds
    const allBlocks = [
      ...stylistRows.flatMap((r) => r.blocks),
      ...seamstressRows.flatMap((r) => r.blocks),
      ...unassignedBlocks,
    ];

    const BUFFER_MS = 30 * 60 * 1000;
    const MIN_SPAN_MS = 3 * 60 * 60 * 1000;
    let trackStartMs: number;
    let trackEndMs: number;

    if (allBlocks.length > 0) {
      const minIn = Math.min(...allBlocks.map((b) => b.timeInMs));
      const maxOut = Math.max(
        ...allBlocks.map((b) => b.timeOutMs ?? b.timeInMs + 60 * 60 * 1000)
      );
      trackStartMs = minIn - BUFFER_MS;
      trackEndMs = Math.max(maxOut + BUFFER_MS, minIn + MIN_SPAN_MS);
    } else {
      // No appointments: default 10am–7pm in the store's timezone
      const [dy, dm, dd] = date.split("-").map(Number);
      const tz = timezone;
      const noonLocal = new Date(
        new Intl.DateTimeFormat("en-CA", {
          timeZone: tz,
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        })
          .format(new Date(Date.UTC(dy, dm - 1, dd, 12)))
          .replace(/\//g, "-") + "T12:00:00"
      );
      const offsetMs =
        new Date(Date.UTC(dy, dm - 1, dd, 12)).getTime() - noonLocal.getTime();
      trackStartMs = new Date(Date.UTC(dy, dm - 1, dd, 10, 0, 0)).getTime() + offsetMs;
      trackEndMs = new Date(Date.UTC(dy, dm - 1, dd, 19, 0, 0)).getTime() + offsetMs;
    }

    // ── Week summary ──────────────────────────────────────────────────────────

    // All stylists seen during the week (excludes seamstresses for the primary table)
    const weekStylistsMap = new Map<
      string,
      { stylistId: string; stylistName: string; role: string }
    >();
    for (const a of weekAppointments) {
      if (a.assignedStaffMember && a.assignedStaffMember.role !== "SEAMSTRESS") {
        const s = a.assignedStaffMember;
        if (!weekStylistsMap.has(s.id)) {
          weekStylistsMap.set(s.id, {
            stylistId: s.id,
            stylistName: s.fullName,
            role: s.role,
          });
        }
      }
    }
    const allStylists = Array.from(weekStylistsMap.values()).sort((a, b) =>
      a.stylistName.localeCompare(b.stylistName)
    );

    const weekDays: WeekDaySummary[] = weekDayStrs.map((dayStr) => {
      const dayApptsSub = weekAppointments.filter(
        (a) => a.appointmentDate.toISOString().slice(0, 10) === dayStr
      );

      const stylistStats = allStylists.map((stylist) => {
        const thisBlocks = dayApptsSub
          .filter((a) => a.assignedStaffMember?.id === stylist.stylistId)
          .map((a) => ({
            timeInMs: a.timeIn.getTime(),
            timeOutMs: a.timeOut?.getTime() ?? null,
            durationMinutes: a.timeOut
              ? Math.round(
                  (a.timeOut.getTime() - a.timeIn.getTime()) / 60000
                )
              : null,
          }))
          .sort((a, b) => a.timeInMs - b.timeInMs);

        const floorMinutes = Math.round(
          thisBlocks.reduce((s, b) => s + (b.durationMinutes ?? 0), 0)
        );

        let gapMinutes = 0;
        for (let i = 1; i < thisBlocks.length; i++) {
          const prev = thisBlocks[i - 1];
          const curr = thisBlocks[i];
          if (prev.timeOutMs && curr.timeInMs > prev.timeOutMs) {
            gapMinutes += (curr.timeInMs - prev.timeOutMs) / 60000;
          }
        }

        return {
          stylistId: stylist.stylistId,
          appointmentCount: thisBlocks.length,
          floorMinutes,
          gapMinutes: Math.round(gapMinutes),
        };
      });

      return {
        date: dayStr,
        dayLabel: formatDayLabel(dayStr),
        stylistStats,
      };
    });

    return {
      store: { slug: shell.store.slug, name: shell.store.name },
      stores,
      snapshot: {
        activeNow: todaySummary.filter(
          (e) => e.status === AppointmentStatus.ACTIVE
        ).length,
        waiting: todaySummary.filter(
          (e) => e.status === AppointmentStatus.WAITING
        ).length,
        soldToday: todaySummary.filter((e) => e.purchased === true).length,
      },
      date,
      todayDateStr,
      stylistRows,
      seamstressRows,
      unassignedBlocks,
      trackStartMs,
      trackEndMs,
      hasData: allBlocks.length > 0,
      weekDays,
      allStylists,
    };
  });
}
