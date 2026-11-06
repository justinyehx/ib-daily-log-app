"use client";

import { useState } from "react";

type DailyLogExportFormProps = {
  storeSlug: string;
  storeName: string;
  /** Earliest appointment on record, used by the "All time" preset. */
  earliestDate: string;
};

function todayISO() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

function shiftISO(days: number) {
  const now = new Date();
  now.setDate(now.getDate() + days);
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

function startOfMonthISO(monthsBack = 0) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - monthsBack, 1);
  const offset = start.getTimezoneOffset() * 60_000;
  return new Date(start.getTime() - offset).toISOString().slice(0, 10);
}

function endOfMonthISO(monthsBack = 0) {
  const now = new Date();
  const end = new Date(now.getFullYear(), now.getMonth() - monthsBack + 1, 0);
  const offset = end.getTimezoneOffset() * 60_000;
  return new Date(end.getTime() - offset).toISOString().slice(0, 10);
}

export function DailyLogExportForm({ storeSlug, storeName, earliestDate }: DailyLogExportFormProps) {
  const [from, setFrom] = useState(startOfMonthISO());
  const [to, setTo] = useState(todayISO());
  const [selectedWindow, setSelectedWindow] = useState("This month");
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState("");

  const presets: Array<{ label: string; from: string; to: string }> = [
    { label: "This month", from: startOfMonthISO(), to: todayISO() },
    { label: "Last month", from: startOfMonthISO(1), to: endOfMonthISO(1) },
    { label: "Last 30 days", from: shiftISO(-30), to: todayISO() },
    { label: "This year", from: `${new Date().getFullYear()}-01-01`, to: todayISO() },
    { label: "All time", from: earliestDate, to: todayISO() }
  ];

  const isCustom = selectedWindow === "Custom";

  /** Editing either date puts the picker into Custom, so the highlighted window
   *  always matches the dates actually being exported. */
  function setCustomDate(which: "from" | "to", value: string) {
    if (which === "from") setFrom(value);
    else setTo(value);
    setSelectedWindow("Custom");
    setError("");
  }

  async function handleExport() {
    setError("");

    if (!from || !to) {
      setError("Choose both a start and end date.");
      return;
    }
    if (from > to) {
      setError("The start date must come before the end date.");
      return;
    }

    setIsBusy(true);
    try {
      const query = new URLSearchParams({ store: storeSlug, from, to });
      const response = await fetch(`/api/export/daily-log?${query.toString()}`);

      if (!response.ok) {
        // The route replies with JSON on failure; fall back if it isn't.
        let message = "The export could not be created.";
        try {
          const body = await response.json();
          if (body?.error) message = body.error;
        } catch {
          /* keep the default message */
        }
        setError(message);
        return;
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const disposition = response.headers.get("Content-Disposition") || "";
      const match = disposition.match(/filename="(.+)"/);

      link.href = url;
      link.download = match ? match[1] : `daily-log-${from}-to-${to}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch {
      setError("The export could not be downloaded. Check your connection and try again.");
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <div className="export-block">
      <p className="settings-copy">
        Downloads every appointment for <strong>{storeName}</strong> in the chosen window as an Excel
        file, with the same columns as the Daily Log table plus wear date, reason did not buy and
        comeback booking.
      </p>

      <div className="export-presets">
        {presets.map((preset) => (
          <button
            aria-pressed={selectedWindow === preset.label}
            className={`button secondary${selectedWindow === preset.label ? " active" : ""}`}
            key={preset.label}
            onClick={() => {
              setFrom(preset.from);
              setTo(preset.to);
              setSelectedWindow(preset.label);
              setError("");
            }}
            type="button"
          >
            {preset.label}
          </button>
        ))}
        <button
          aria-pressed={isCustom}
          className={`button secondary${isCustom ? " active" : ""}`}
          onClick={() => {
            setSelectedWindow("Custom");
            setError("");
          }}
          type="button"
        >
          Custom range
        </button>
      </div>

      <div className="filters-grid">
        <label className="field">
          <span className="field-label">From</span>
          <input
            className="input"
            max={to || undefined}
            onChange={(event) => setCustomDate("from", event.target.value)}
            type="date"
            value={from}
          />
        </label>
        <label className="field">
          <span className="field-label">To</span>
          <input
            className="input"
            min={from || undefined}
            onChange={(event) => setCustomDate("to", event.target.value)}
            type="date"
            value={to}
          />
        </label>
        <div className="form-actions filter-actions">
          <button className="button" disabled={isBusy} onClick={handleExport} type="button">
            {isBusy ? "Preparing..." : "Export to Excel"}
          </button>
        </div>
      </div>

      <p className="compact-note export-window-note">
        {isCustom ? "Custom range" : selectedWindow} &middot; exporting {from || "—"} to {to || "—"}
      </p>

      {error ? <p className="export-error">{error}</p> : null}
    </div>
  );
}
