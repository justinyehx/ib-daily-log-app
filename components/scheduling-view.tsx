"use client";

import { useMemo, useState } from "react";

import type { SchedulingData } from "@/lib/scheduling-data";

const DOW_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const HOURS = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19];

const DAY_PARTS: Array<{ label: string; hours: number[] }> = [
  { label: "Late morning", hours: [10, 11] },
  { label: "Midday", hours: [12, 13] },
  { label: "Afternoon", hours: [14, 15, 16] },
  { label: "Evening", hours: [17, 18, 19] }
];

const COVERAGE_CHOICES = [
  { value: 0.5, label: "Typical day" },
  { value: 0.8, label: "Busy day" },
  { value: 0.95, label: "Peak day" }
];

function hourLabel(hour: number) {
  const base = hour % 12 === 0 ? 12 : hour % 12;
  return `${base}${hour < 12 ? "am" : "pm"}`;
}

/**
 * Smallest count to plan for so demand is covered on `p` of days.
 *
 * Walk-ins arrive independently, so the number in play at any moment follows a
 * Poisson distribution. Staffing to the average alone leaves you short about half
 * the time, which is why the coverage target matters.
 */
function poissonQuantile(mean: number, p: number) {
  if (mean <= 0) return 0;
  let cumulative = Math.exp(-mean);
  let term = cumulative;
  let k = 0;
  while (cumulative < p && k < 60) {
    k += 1;
    term *= mean / k;
    cumulative += term;
  }
  return k;
}

function heatColor(value: number, max: number) {
  if (!max || value <= 0) return "transparent";
  const stops = ["#F9F1E7", "#F3E2CC", "#EACFAC", "#DFB588", "#D19A63", "#BE7C40", "#A5602A", "#7A4522"];
  return stops[Math.min(stops.length - 1, Math.round((value / max) * (stops.length - 1)))];
}

export function SchedulingView({ data }: { data: SchedulingData }) {
  const [durationMinutes, setDurationMinutes] = useState(data.totals.avgWalkinMinutes);
  const [coverage, setCoverage] = useState(0.8);
  const [seasonMonth, setSeasonMonth] = useState<number>(new Date().getMonth() + 1);

  const activeSeason = data.seasonal.find((m) => m.month === seasonMonth) ?? null;
  // A month with no usable history falls back to 1.00 rather than silently
  // scaling by a figure built from a handful of days.
  const seasonFactor = activeSeason?.index ?? 1;

  const days = useMemo(
    () => Object.keys(data.gridByDow).map(Number).sort((a, b) => a - b),
    [data.gridByDow]
  );

  const perDay = (dow: number, hour: number) => {
    const openDays = data.openDaysByDow[dow] || 0;
    if (!openDays) return 0;
    return (data.gridByDow[dow]?.[hour]?.walkins || 0) / openDays;
  };

  const maxPerDay = useMemo(() => {
    let max = 0;
    days.forEach((dow) => HOURS.forEach((hour) => {
      max = Math.max(max, perDay(dow, hour));
    }));
    return max;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days, data]);

  const weekdayTotals = useMemo(
    () =>
      days.map((dow) => {
        const openDays = data.openDaysByDow[dow] || 0;
        const walkins = HOURS.reduce((sum, h) => sum + (data.gridByDow[dow]?.[h]?.walkins || 0), 0);
        const booked = HOURS.reduce((sum, h) => sum + (data.gridByDow[dow]?.[h]?.booked || 0), 0);
        return {
          dow,
          openDays,
          walkinsPerDay: openDays ? walkins / openDays : 0,
          bookedPerDay: openDays ? booked / openDays : 0
        };
      }),
    [days, data]
  );

  const maxWeekday = Math.max(...weekdayTotals.map((w) => w.walkinsPerDay + w.bookedPerDay), 1);
  const pct = (value: number) => `${(value * 100).toFixed(1)}%`;

  return (
    <div className="page-stack">
      <section className="panel compact-panel">
        <div className="panel-header">
          <div>
            <div className="eyebrow">Unscheduled Demand</div>
            <h3 className="panel-title">Walk-in brides — last {data.months} months</h3>
          </div>
        </div>

        <div className="stats-grid">
          <article className="summary-card">
            <div className="summary-label">Walk-in brides</div>
            <div className="summary-value">{data.totals.walkins}</div>
          </article>
          <article className="summary-card">
            <div className="summary-label">Per week</div>
            <div className="summary-value">{data.totals.walkinsPerWeek.toFixed(1)}</div>
          </article>
          <article className="summary-card">
            <div className="summary-label">Share of new brides</div>
            <div className="summary-value">
              {data.totals.walkins + data.totals.booked
                ? pct(data.totals.walkins / (data.totals.walkins + data.totals.booked))
                : "—"}
            </div>
          </article>
          <article className="summary-card">
            <div className="summary-label">Walk-in close rate</div>
            <div className="summary-value">{pct(data.totals.walkinCloseRate)}</div>
            <div className="compact-note">Booked: {pct(data.totals.bookedCloseRate)}</div>
          </article>
          <article className="summary-card">
            <div className="summary-label">Avg walk-in length</div>
            <div className="summary-value summary-value-small">{data.totals.avgWalkinMinutes} min</div>
          </article>
        </div>
      </section>

      <section className="panel compact-panel">
        <div className="panel-header">
          <div>
            <div className="eyebrow">Arrival Pattern</div>
            <h3 className="panel-title">When walk-ins actually arrive</h3>
            <p className="panel-copy">
              Average walk-in brides per hour, per day the store was open. Times are in the store&apos;s
              own local time. This is the grid to schedule against.
            </p>
          </div>
        </div>

        <div className="table-wrap compact-table">
          <table className="data-table sched-heat">
            <thead>
              <tr>
                <th>Day</th>
                {HOURS.map((hour) => (
                  <th key={hour}>{hourLabel(hour)}</th>
                ))}
                <th>Per day</th>
              </tr>
            </thead>
            <tbody>
              {days.map((dow) => {
                const openDays = data.openDaysByDow[dow] || 0;
                const total = HOURS.reduce((sum, h) => sum + (data.gridByDow[dow]?.[h]?.walkins || 0), 0);
                return (
                  <tr key={dow}>
                    <td className="sched-dayname">{DOW_NAMES[dow]}</td>
                    {HOURS.map((hour) => {
                      const value = perDay(dow, hour);
                      const count = data.gridByDow[dow]?.[hour]?.walkins || 0;
                      return (
                        <td
                          key={hour}
                          className="sched-cell"
                          style={{ background: heatColor(value, maxPerDay) }}
                          title={`${count} walk-ins across ${openDays} ${DOW_NAMES[dow]}s`}
                        >
                          {value ? value.toFixed(2) : "·"}
                        </td>
                      );
                    })}
                    <td className="sched-total">{openDays ? (total / openDays).toFixed(2) : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel compact-panel">
        <div className="panel-header">
          <div>
            <div className="eyebrow">Weekday Mix</div>
            <h3 className="panel-title">Walk-ins vs booked, per open day</h3>
          </div>
        </div>
        <div className="sched-bars">
          {weekdayTotals.map((row) => (
            <div className="sched-bar-row" key={row.dow}>
              <span className="sched-bar-label">{DOW_NAMES[row.dow]}</span>
              <div className="sched-bar-track">
                <div
                  className="sched-bar walkin"
                  style={{ width: `${(row.walkinsPerDay / maxWeekday) * 100}%` }}
                  title={`${row.walkinsPerDay.toFixed(2)} walk-ins per day`}
                />
                <div
                  className="sched-bar booked"
                  style={{ width: `${(row.bookedPerDay / maxWeekday) * 100}%` }}
                  title={`${row.bookedPerDay.toFixed(2)} booked per day`}
                />
              </div>
              <span className="sched-bar-value">{row.walkinsPerDay.toFixed(2)}</span>
            </div>
          ))}
        </div>
        <div className="sched-legend">
          <span><i className="sched-swatch walkin" /> Walk-in brides</span>
          <span><i className="sched-swatch booked" /> Booked brides</span>
          <span className="compact-note">Value shown is walk-ins per open day.</span>
        </div>
      </section>

      <section className="panel compact-panel">
        <div className="panel-header">
          <div>
            <div className="eyebrow">Coverage</div>
            <h3 className="panel-title">Stylists to keep free for walk-ins</h3>
            <p className="panel-copy">
              How many stylists should be uncommitted — not already in a booked appointment — to absorb
              expected walk-ins without turning a bride away.
            </p>
          </div>
        </div>

        <div className="filters-grid">
          <label className="field">
            <span className="field-label">Avg walk-in length (min)</span>
            <input
              className="input"
              max={240}
              min={30}
              onChange={(event) => setDurationMinutes(Math.max(15, Number(event.target.value) || 0))}
              step={5}
              type="number"
              value={durationMinutes}
            />
          </label>
          <label className="field">
            <span className="field-label">Month</span>
            <select
              className="select"
              onChange={(event) => setSeasonMonth(Number(event.target.value))}
              value={seasonMonth}
            >
              {data.seasonal.map((month) => (
                <option key={month.month} value={month.month}>
                  {month.label}
                  {month.index === null ? " — no history" : ` (${month.index.toFixed(2)}\u00d7)`}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="field-label">Plan for</span>
            <select
              className="select"
              onChange={(event) => setCoverage(Number(event.target.value))}
              value={coverage}
            >
              {COVERAGE_CHOICES.map((choice) => (
                <option key={choice.value} value={choice.value}>
                  {choice.label} ({Math.round(choice.value * 100)}%)
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="table-wrap compact-table">
          <table className="data-table">
            <thead>
              <tr>
                <th>Day</th>
                {DAY_PARTS.map((part) => (
                  <th key={part.label}>
                    {part.label}
                    <br />
                    <span className="sched-parthours">
                      {hourLabel(part.hours[0])}–{hourLabel(part.hours[part.hours.length - 1] + 1)}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {days.map((dow) => (
                <tr key={dow}>
                  <td className="sched-dayname">{DOW_NAMES[dow]}</td>
                  {DAY_PARTS.map((part) => {
                    const meanPerHour =
                      part.hours.reduce((sum, hour) => sum + perDay(dow, hour), 0) / part.hours.length;
                    // Little's Law: average number in the building at once =
                    // arrival rate × how long each one stays. Apply the busy-day
                    // margin to that concurrent figure, not to arrivals — doing it
                    // the other way multiplies the safety buffer by the duration
                    // and overstates the need.
                    const meanConcurrent = meanPerHour * (durationMinutes / 60) * seasonFactor;
                    const needed = poissonQuantile(meanConcurrent, coverage);
                    return (
                      <td key={part.label} className={needed >= 2 ? "sched-need-high" : undefined}>
                        <strong className="sched-need">{needed}</strong>
                        <div className="compact-note">{meanPerHour.toFixed(2)}/hr avg</div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="settings-copy">
          <strong>How this is worked out.</strong> {activeSeason && activeSeason.index !== null ? (
            <>
              {activeSeason.label} runs at <strong>{activeSeason.index.toFixed(2)}\u00d7</strong> an average
              month, so demand is scaled by that first.{" "}
            </>
          ) : (
            <>
              There is no usable history for {activeSeason?.label ?? "this month"} yet, so no seasonal
              scaling is applied.{" "}
            </>
          )}
          Average walk-in arrivals per hour multiplied by how long
          each one stays ({durationMinutes} min) gives how many are typically in the building at once. We
          then round that up to the level that covers a{" "}
          {COVERAGE_CHOICES.find((c) => c.value === coverage)?.label.toLowerCase()}, since arrivals bunch up
          rather than spreading evenly. Adjust either input above to see it move.
        </p>
        <p className="settings-copy">
          A <strong>0</strong> does not mean nobody will walk in — it means walk-ins are rare enough in that
          block that the stylists already covering booked appointments can absorb them. Treat it as
          &quot;no dedicated cover needed&quot;, not &quot;no one will come&quot;.
        </p>
      </section>


      <section className="panel compact-panel">
        <div className="panel-header">
          <div>
            <div className="eyebrow">Seasonality</div>
            <h3 className="panel-title">How each month compares</h3>
            <p className="panel-copy">
              Bridal demand is not flat across the year. This index is built from every new bride at all
              four stores \u2014 walk-ins alone are too few per month to be stable \u2014 and 1.00 is an
              average month.
            </p>
          </div>
        </div>

        <div className="sched-bars">
          {data.seasonal.map((month) => (
            <div className="sched-bar-row" key={month.month}>
              <span className="sched-bar-label">{month.label}</span>
              <div className="sched-bar-track">
                <div
                  className={`sched-bar ${month.month === seasonMonth ? "walkin" : "booked"}`}
                  style={{ width: `${Math.min(100, ((month.index ?? 0) / 1.4) * 100)}%` }}
                  title={
                    month.index === null
                      ? "No usable history yet"
                      : `${month.perStoreDay.toFixed(2)} new brides per store-day`
                  }
                />
              </div>
              <span className="sched-bar-value">
                {month.index === null ? "\u2014" : `${month.index.toFixed(2)}\u00d7`}
              </span>
            </div>
          ))}
        </div>

        <p className="settings-copy">
          <strong>Treat this as provisional.</strong> There is only one year of history
          ({data.seasonalMonthsWithData} months with enough data), and over a single year a seasonal swing
          cannot be told apart from a business trend \u2014 a decline from January to August looks identical
          either way. Once a second January is on record, comparing the two will show whether the rise is
          genuinely seasonal. Months without enough trading days are left blank rather than scaled from a
          handful of records.
        </p>
      </section>
      <section className="panel compact-panel">
        <div className="panel-header">
          <div>
            <div className="eyebrow">Data Notes</div>
            <h3 className="panel-title">What is and isn&apos;t counted</h3>
          </div>
        </div>
        <p className="settings-copy">
          New Bride appointments only, over the last {data.months} months ({data.quality.total} records).
          Arrivals logged outside {hourLabel(9)}–{hourLabel(20)} are excluded as mistyped times
          ({data.quality.excludedBadHour}), and walk-in lengths that are negative or over six hours are left
          out of the average ({data.quality.excludedBadDuration}). {data.quality.neverCheckedOut} appointments
          were never checked out, so they count as arrivals but not toward length. Wednesdays do not appear
          because the stores are closed.
        </p>
      </section>
    </div>
  );
}
