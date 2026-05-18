"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import type {
  StylistTimelineRow,
  TimelineBlock,
  TimelineData,
} from "@/lib/timeline-data";

// ─── Color map ────────────────────────────────────────────────────────────────

const PURCHASED_COLOR = { bg: "#dcfce7", border: "#16a34a", text: "#14532d" };

function getTypeColor(label: string, purchased?: boolean | null): {
  bg: string;
  border: string;
  text: string;
} {
  if (purchased === true) return PURCHASED_COLOR;
  const l = label.toLowerCase();
  if (l.includes("new bride"))
    return { bg: "#dbeafe", border: "#3b82f6", text: "#1e40af" };
  if (l.includes("comeback") || l.includes("come back"))
    return { bg: "#ede9fe", border: "#7c3aed", text: "#5b21b6" };
  if (l.includes("alteration"))
    return { bg: "#ffedd5", border: "#ea580c", text: "#9a3412" };
  if (l.includes("presentation"))
    return { bg: "#fef9c3", border: "#ca8a04", text: "#78350f" };
  if (l === "pay" || l.includes("payment"))
    return { bg: "#dcfce7", border: "#16a34a", text: "#14532d" };
  if (l.includes("pickup") || l.includes("pick up"))
    return { bg: "#ccfbf1", border: "#0d9488", text: "#134e4a" };
  if (l.includes("phone"))
    return { bg: "#f3f4f6", border: "#6b7280", text: "#374151" };
  if (l.includes("special occasion"))
    return { bg: "#fce7f3", border: "#db2777", text: "#9d174d" };
  if (l.includes("walk") || l.includes("walk-in"))
    return { bg: "#e0f2fe", border: "#0284c7", text: "#0c4a6e" };
  return { bg: "#f1f5f9", border: "#94a3b8", text: "#475569" };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatMins(mins: number): string {
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function formatTime(ms: number, timezone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: timezone,
  }).format(new Date(ms));
}

function pct(ms: number, startMs: number, spanMs: number): number {
  return ((ms - startMs) / spanMs) * 100;
}

function getHourMarks(
  startMs: number,
  endMs: number,
  timezone: string
): Array<{ label: string; leftPct: number }> {
  const span = endMs - startMs;
  const marks: Array<{ label: string; leftPct: number }> = [];

  // Round start down to the nearest hour in UTC, then step through hours
  const startHourMs = Math.floor(startMs / 3_600_000) * 3_600_000;
  let t = startHourMs;
  while (t <= endMs) {
    if (t >= startMs) {
      const leftPct = ((t - startMs) / span) * 100;
      const label = new Intl.DateTimeFormat("en-US", {
        hour: "numeric",
        timeZone: timezone,
      }).format(new Date(t));
      marks.push({ label, leftPct });
    }
    t += 3_600_000;
  }
  return marks;
}

// ─── Tooltip ──────────────────────────────────────────────────────────────────

type Tooltip = {
  block: TimelineBlock;
  x: number;
  y: number;
};

function BlockTooltip({
  tooltip,
  timezone,
}: {
  tooltip: Tooltip;
  timezone: string;
}) {
  const { block } = tooltip;
  return (
    <div
      className="tl-tooltip"
      style={{ left: Math.min(tooltip.x, window.innerWidth - 240), top: tooltip.y + 16 }}
    >
      <strong className="tl-tooltip-name">{block.guestName}</strong>
      <span className="tl-tooltip-type">{block.appointmentType}</span>
      <div className="tl-tooltip-row">
        <span>In:</span>
        <span>{formatTime(block.timeInMs, timezone)}</span>
      </div>
      {block.timeOutMs ? (
        <div className="tl-tooltip-row">
          <span>Out:</span>
          <span>{formatTime(block.timeOutMs, timezone)}</span>
        </div>
      ) : null}
      {block.durationMinutes != null ? (
        <div className="tl-tooltip-row">
          <span>Duration:</span>
          <span>{formatMins(block.durationMinutes)}</span>
        </div>
      ) : (
        <div className="tl-tooltip-row tl-tooltip-active">
          <span>Status:</span>
          <span>In progress</span>
        </div>
      )}
      {block.purchased === true ? (
        <div className="tl-tooltip-row" style={{ color: "#16a34a", fontWeight: 600 }}>
          <span>✓ Sold</span>
        </div>
      ) : null}
      {block.storeName ? (
        <div className="tl-tooltip-row">
          <span>Store:</span>
          <span>{block.storeName}</span>
        </div>
      ) : null}
    </div>
  );
}

// ─── Appointment block ────────────────────────────────────────────────────────

function AppointmentBlock({
  block,
  startMs,
  spanMs,
  nowMs,
  onHover,
  onLeave,
}: {
  block: TimelineBlock;
  startMs: number;
  spanMs: number;
  nowMs: number;
  onHover: (block: TimelineBlock, x: number, y: number) => void;
  onLeave: () => void;
}) {
  const color = getTypeColor(block.appointmentType, block.purchased);
  const leftPct = pct(block.timeInMs, startMs, spanMs);
  const effectiveOut = block.timeOutMs ?? Math.min(nowMs, startMs + spanMs);
  const widthPct = pct(effectiveOut, startMs, spanMs) - leftPct;
  const isInProgress = !block.timeOutMs;

  return (
    <div
      className={`tl-block${isInProgress ? " tl-block-active" : ""}`}
      style={{
        left: `${Math.max(0, leftPct)}%`,
        width: `${Math.max(0.5, widthPct)}%`,
        background: color.bg,
        borderColor: color.border,
        color: color.text,
      }}
      onMouseEnter={(e) => onHover(block, e.clientX, e.clientY)}
      onMouseLeave={onLeave}
    >
      <span className="tl-block-name">{block.guestName}</span>
      {block.durationMinutes != null && block.durationMinutes >= 15 ? (
        <span className="tl-block-dur">{formatMins(block.durationMinutes)}</span>
      ) : null}
    </div>
  );
}

// ─── Gap label ────────────────────────────────────────────────────────────────

function GapLabel({
  fromMs,
  toMs,
  startMs,
  spanMs,
}: {
  fromMs: number;
  toMs: number;
  startMs: number;
  spanMs: number;
}) {
  const gapMin = Math.round((toMs - fromMs) / 60000);
  if (gapMin < 5) return null;

  const leftPct = pct(fromMs, startMs, spanMs);
  const widthPct = pct(toMs, startMs, spanMs) - leftPct;

  return (
    <div
      className="tl-gap"
      style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
    >
      {gapMin >= 10 ? <span className="tl-gap-label">{formatMins(gapMin)}</span> : null}
    </div>
  );
}

// ─── Single stylist row ───────────────────────────────────────────────────────

function StylistRow({
  row,
  startMs,
  spanMs,
  nowMs,
  hourMarks,
  onHover,
  onLeave,
}: {
  row: StylistTimelineRow;
  startMs: number;
  spanMs: number;
  nowMs: number;
  hourMarks: Array<{ leftPct: number }>;
  onHover: (block: TimelineBlock, x: number, y: number) => void;
  onLeave: () => void;
}) {
  const nowPct = pct(nowMs, startMs, spanMs);
  const showNow = nowPct > 0 && nowPct < 100;

  return (
    <div className="tl-row">
      <div className="tl-name-col">
        <strong className="tl-stylist-name">{row.stylistName}</strong>
        <span className="tl-stylist-meta">
          {row.blocks.length} appt{row.blocks.length !== 1 ? "s" : ""} ·{" "}
          {formatMins(row.totalFloorMinutes)} floor
          {row.totalGapMinutes > 0
            ? ` · ${formatMins(row.totalGapMinutes)} gap`
            : ""}
        </span>
      </div>
      <div className="tl-track">
        {/* Hour grid lines */}
        {hourMarks.map((h, i) => (
          <div
            key={i}
            className="tl-grid-line"
            style={{ left: `${h.leftPct}%` }}
          />
        ))}

        {/* Now line */}
        {showNow ? (
          <div className="tl-now-line" style={{ left: `${nowPct}%` }} />
        ) : null}

        {/* Gap labels */}
        {row.blocks.map((block, i) => {
          const next = row.blocks[i + 1];
          if (!next || !block.timeOutMs) return null;
          return (
            <GapLabel
              key={`gap-${block.id}`}
              fromMs={block.timeOutMs}
              toMs={next.timeInMs}
              startMs={startMs}
              spanMs={spanMs}
            />
          );
        })}

        {/* Appointment blocks */}
        {row.blocks.map((block) => (
          <AppointmentBlock
            key={block.id}
            block={block}
            startMs={startMs}
            spanMs={spanMs}
            nowMs={nowMs}
            onHover={onHover}
            onLeave={onLeave}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Day Gantt ────────────────────────────────────────────────────────────────

function DayGantt({
  data,
  timezone,
}: {
  data: TimelineData;
  timezone: string;
}) {
  const [tooltip, setTooltip] = useState<Tooltip | null>(null);
  const spanMs = data.trackEndMs - data.trackStartMs;
  const nowMs = Date.now();

  const hourMarks = getHourMarks(data.trackStartMs, data.trackEndMs, timezone);

  const unassignedRow: StylistTimelineRow | null =
    data.unassignedBlocks.length > 0
      ? {
          stylistId: "__unassigned__",
          stylistName: "Unassigned",
          role: "",
          blocks: data.unassignedBlocks,
          totalFloorMinutes: 0,
          totalGapMinutes: 0,
        }
      : null;

  const allRows = [
    ...data.stylistRows,
    ...(data.seamstressRows.length > 0 ? data.seamstressRows : []),
    ...(unassignedRow ? [unassignedRow] : []),
  ];

  if (!data.hasData) {
    return (
      <div className="tl-empty">
        <p>No appointments recorded for this day.</p>
      </div>
    );
  }

  return (
    <div className="tl-gantt-wrap">
      {/* Time axis header */}
      <div className="tl-header-row">
        <div className="tl-name-col tl-name-col-header" />
        <div className="tl-track tl-track-header">
          {hourMarks.map((h, i) => (
            <div
              key={i}
              className="tl-hour-mark"
              style={{ left: `${h.leftPct}%` }}
            >
              {h.label}
            </div>
          ))}
        </div>
      </div>

      {/* Section label: Stylists */}
      {data.stylistRows.length > 0 && data.seamstressRows.length > 0 ? (
        <div className="tl-section-label">Stylists</div>
      ) : null}

      {/* Stylist rows */}
      {data.stylistRows.map((row) => (
        <StylistRow
          key={row.stylistId}
          row={row}
          startMs={data.trackStartMs}
          spanMs={spanMs}
          nowMs={nowMs}
          hourMarks={hourMarks}
          onHover={(block, x, y) => setTooltip({ block, x, y })}
          onLeave={() => setTooltip(null)}
        />
      ))}

      {/* Seamstress section */}
      {data.seamstressRows.length > 0 ? (
        <>
          <div className="tl-section-label">Seamstresses</div>
          {data.seamstressRows.map((row) => (
            <StylistRow
              key={row.stylistId}
              row={row}
              startMs={data.trackStartMs}
              spanMs={spanMs}
              nowMs={nowMs}
              hourMarks={hourMarks}
              onHover={(block, x, y) => setTooltip({ block, x, y })}
              onLeave={() => setTooltip(null)}
            />
          ))}
        </>
      ) : null}

      {/* Unassigned row */}
      {unassignedRow ? (
        <>
          <div className="tl-section-label">Unassigned</div>
          <StylistRow
            key="__unassigned__"
            row={unassignedRow}
            startMs={data.trackStartMs}
            spanMs={spanMs}
            nowMs={nowMs}
            hourMarks={hourMarks}
            onHover={(block, x, y) => setTooltip({ block, x, y })}
            onLeave={() => setTooltip(null)}
          />
        </>
      ) : null}

      {/* Color legend */}
      <Legend rows={allRows} />

      {/* Tooltip */}
      {tooltip ? (
        <BlockTooltip tooltip={tooltip} timezone={timezone} />
      ) : null}
    </div>
  );
}

// ─── Legend ───────────────────────────────────────────────────────────────────

function Legend({ rows }: { rows: StylistTimelineRow[] }) {
  const seen = new Map<string, { bg: string; border: string; text: string }>();
  for (const row of rows) {
    for (const block of row.blocks) {
      if (!seen.has(block.appointmentType)) {
        seen.set(block.appointmentType, getTypeColor(block.appointmentType, false));
      }
    }
  }
  if (!seen.size) return null;
  return (
    <div className="tl-legend">
      {Array.from(seen.entries()).map(([label, color]) => (
        <div key={label} className="tl-legend-item">
          <span
            className="tl-legend-dot"
            style={{ background: color.border }}
          />
          <span>{label}</span>
        </div>
      ))}
      <div className="tl-legend-item tl-legend-item-sold">
        <span
          className="tl-legend-dot"
          style={{ background: PURCHASED_COLOR.border }}
        />
        <span>Sold</span>
      </div>
    </div>
  );
}

// ─── Week summary ─────────────────────────────────────────────────────────────

function WeekSummary({
  data,
  onDayClick,
}: {
  data: TimelineData;
  onDayClick: (date: string) => void;
}) {
  if (!data.allStylists.length) {
    return (
      <div className="tl-empty">
        <p>No appointments recorded for this week.</p>
      </div>
    );
  }

  // Find the max floor minutes across all cells for heat intensity
  let maxFloor = 1;
  for (const day of data.weekDays) {
    for (const s of day.stylistStats) {
      if (s.floorMinutes > maxFloor) maxFloor = s.floorMinutes;
    }
  }

  return (
    <div className="tl-week-wrap">
      <table className="tl-week-table">
        <thead>
          <tr>
            <th className="tl-week-th-name">Stylist</th>
            {data.weekDays.map((day) => (
              <th key={day.date} className="tl-week-th-day">
                <button
                  className={`tl-week-day-btn${day.date === data.date ? " tl-week-day-btn-active" : ""}`}
                  onClick={() => onDayClick(day.date)}
                  type="button"
                >
                  {day.dayLabel}
                </button>
              </th>
            ))}
            <th className="tl-week-th-total">Week Total</th>
          </tr>
        </thead>
        <tbody>
          {data.allStylists.map((stylist) => {
            const weekAppts = data.weekDays.reduce(
              (sum, d) =>
                sum +
                (d.stylistStats.find((s) => s.stylistId === stylist.stylistId)
                  ?.appointmentCount ?? 0),
              0
            );
            const weekFloor = data.weekDays.reduce(
              (sum, d) =>
                sum +
                (d.stylistStats.find((s) => s.stylistId === stylist.stylistId)
                  ?.floorMinutes ?? 0),
              0
            );

            return (
              <tr key={stylist.stylistId}>
                <td className="tl-week-td-name">{stylist.stylistName}</td>
                {data.weekDays.map((day) => {
                  const stat = day.stylistStats.find(
                    (s) => s.stylistId === stylist.stylistId
                  );
                  const floor = stat?.floorMinutes ?? 0;
                  const appts = stat?.appointmentCount ?? 0;
                  const intensity = floor / maxFloor;

                  return (
                    <td
                      key={day.date}
                      className="tl-week-td-cell"
                      style={{
                        background:
                          appts > 0
                            ? `rgba(59, 130, 246, ${0.08 + intensity * 0.35})`
                            : undefined,
                      }}
                    >
                      <button
                        className="tl-week-cell-btn"
                        onClick={() => onDayClick(day.date)}
                        type="button"
                        disabled={appts === 0}
                      >
                        {appts > 0 ? (
                          <>
                            <span className="tl-week-cell-appts">
                              {appts} appt{appts !== 1 ? "s" : ""}
                            </span>
                            <span className="tl-week-cell-floor">
                              {formatMins(floor)} floor
                            </span>
                            {(stat?.gapMinutes ?? 0) > 0 ? (
                              <span className="tl-week-cell-gap">
                                {formatMins(stat!.gapMinutes)} gap
                              </span>
                            ) : null}
                          </>
                        ) : (
                          <span className="tl-week-cell-empty">—</span>
                        )}
                      </button>
                    </td>
                  );
                })}
                <td className="tl-week-td-total">
                  {weekAppts > 0 ? (
                    <>
                      <strong>{weekAppts}</strong>
                      <span>{formatMins(weekFloor)}</span>
                    </>
                  ) : (
                    <span className="tl-week-cell-empty">—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="tl-week-hint">
        Click any day cell or column header to view that day&apos;s Gantt chart.
      </p>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function StylistTimelineChart({
  data,
  timezone,
}: {
  data: TimelineData;
  timezone: string;
}) {
  const router = useRouter();
  const [view, setView] = useState<"day" | "week">("day");

  function navigateToDate(date: string, targetView: "day" | "week" = "day") {
    router.push(`/analytics/timeline?date=${date}&view=${targetView}`);
    setView(targetView);
  }

  function shiftDate(delta: number) {
    const [y, m, d] = data.date.split("-").map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    if (view === "week") {
      dt.setUTCDate(dt.getUTCDate() + delta * 7);
    } else {
      dt.setUTCDate(dt.getUTCDate() + delta);
    }
    const newDate = dt.toISOString().slice(0, 10);
    navigateToDate(newDate, view);
  }

  const dateLabel =
    view === "week"
      ? (() => {
          const first = data.weekDays[0];
          const last = data.weekDays[6];
          return `${first.dayLabel} – ${last.dayLabel}`;
        })()
      : (() => {
          const [y, m, d] = data.date.split("-").map(Number);
          // Use noon UTC so no US timezone offset can roll the date back a day
          const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
          return new Intl.DateTimeFormat("en-US", {
            weekday: "long",
            month: "long",
            day: "numeric",
            timeZone: timezone,
          }).format(dt);
        })();

  return (
    <div className="tl-root">
      {/* Controls bar */}
      <div className="tl-controls">
        <div className="tl-view-toggle">
          <button
            className={`tl-toggle-btn${view === "day" ? " active" : ""}`}
            onClick={() => setView("day")}
            type="button"
          >
            Day
          </button>
          <button
            className={`tl-toggle-btn${view === "week" ? " active" : ""}`}
            onClick={() => setView("week")}
            type="button"
          >
            Week
          </button>
        </div>

        <div className="tl-nav">
          <button
            className="button secondary tl-nav-btn"
            onClick={() => shiftDate(-1)}
            type="button"
          >
            ←
          </button>
          <span className="tl-date-label">{dateLabel}</span>
          <button
            className="button secondary tl-nav-btn"
            onClick={() => shiftDate(1)}
            type="button"
            disabled={data.date >= data.todayDateStr}
          >
            →
          </button>
        </div>

        <div className="tl-date-picker">
          <input
            className="input tl-date-input"
            type="date"
            value={data.date}
            max={data.todayDateStr}
            onChange={(e) => navigateToDate(e.target.value, view)}
          />
        </div>
      </div>

      {/* Chart */}
      {view === "day" ? (
        <DayGantt data={data} timezone={timezone} />
      ) : (
        <WeekSummary
          data={data}
          onDayClick={(date) => navigateToDate(date, "day")}
        />
      )}
    </div>
  );
}
