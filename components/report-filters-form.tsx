"use client";

import { useState } from "react";

import { SubmitButton } from "@/components/submit-button";

type ReportFiltersFormProps = {
  filters: {
    store?: string;
    view: "day" | "week" | "twoWeek" | "month" | "year";
    day: string;
    week: string;
    twoWeek?: string;
    month: string;
    year: string;
    pricePoint?: string;
    visitType?: string;
    appointmentType?: string;
  };
  appointmentTypeOptions: string[];
  pricePointOptions?: string[];
  storeOptions?: Array<{ value: string; label: string }>;
  showVisitType?: boolean;
  showPricePoint?: boolean;
  showStore?: boolean;
  showTwoWeek?: boolean;
};

export function ReportFiltersForm({
  filters,
  appointmentTypeOptions,
  pricePointOptions = [],
  storeOptions = [],
  showVisitType = true,
  showPricePoint = true,
  showStore = false,
  showTwoWeek = false
}: ReportFiltersFormProps) {
  const [view, setView] = useState<"day" | "week" | "twoWeek" | "month" | "year">(filters.view);

  return (
    <form className="report-controls" method="get">
      {showStore ? (
        <label className="field">
          <span className="field-label">Store</span>
          <select className="select" name="store" defaultValue={filters.store || ""}>
            <option value="">All stores</option>
            {storeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <label className="field">
        <span className="field-label">View</span>
        <select
          className="select"
          name="view"
          onChange={(event) =>
            setView(event.target.value as "day" | "week" | "twoWeek" | "month" | "year")
          }
          value={view}
        >
          <option value="day">Day</option>
          <option value="week">Week</option>
          {showTwoWeek ? <option value="twoWeek">2-Week</option> : null}
          <option value="month">Month</option>
          <option value="year">Year</option>
        </select>
      </label>

      {view === "day" ? (
        <label className="field">
          <span className="field-label">Day</span>
          <input className="input" name="day" type="date" defaultValue={filters.day} />
        </label>
      ) : null}

      {view === "week" ? (
        <label className="field">
          <span className="field-label">Week</span>
          <input className="input" name="week" type="week" defaultValue={filters.week} />
        </label>
      ) : null}

      {view === "twoWeek" ? (
        <label className="field">
          <span className="field-label">2-Week Start</span>
          <input className="input" name="twoWeek" type="date" defaultValue={filters.twoWeek} />
        </label>
      ) : null}

      {view === "month" ? (
        <label className="field">
          <span className="field-label">Month</span>
          <input className="input" name="month" type="month" defaultValue={filters.month} />
        </label>
      ) : null}

      {view === "year" ? (
        <label className="field">
          <span className="field-label">Year</span>
          <input className="input" name="year" type="number" defaultValue={filters.year} />
        </label>
      ) : null}

      {showPricePoint ? (
        <label className="field">
          <span className="field-label">Price Point</span>
          <select className="select" name="pricePoint" defaultValue={filters.pricePoint || ""}>
            <option value="">All price points</option>
            {pricePointOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {showVisitType ? (
        <label className="field">
          <span className="field-label">Visit Type</span>
          <select className="select" name="visitType" defaultValue={filters.visitType || ""}>
            <option value="">All visit types</option>
            <option value="APPOINTMENT">Appointment</option>
            <option value="WALK_IN">Walk-in</option>
          </select>
        </label>
      ) : null}

      <label className="field">
        <span className="field-label">Appointment Type</span>
        <select className="select" name="appointmentType" defaultValue={filters.appointmentType || ""}>
          <option value="">All appointment types</option>
          {appointmentTypeOptions.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>

      <div className="form-actions report-apply">
        <SubmitButton className="button" pendingLabel="Applying...">
          Apply filters
        </SubmitButton>
      </div>
    </form>
  );
}
