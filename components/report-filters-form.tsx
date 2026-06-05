"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { type FormEvent, useTransition, useState } from "react";

type ReportFiltersFormProps = {
  filters: {
    store?: string;
    view: "day" | "week" | "twoWeek" | "month" | "year" | "custom";
    day: string;
    week: string;
    twoWeek?: string;
    month: string;
    year: string;
    dateFrom?: string;
    dateTo?: string;
    pricePoint?: string;
    visitType?: string;
    appointmentType?: string;
    staffView?: string;
  };
  appointmentTypeOptions: string[];
  pricePointOptions?: string[];
  storeOptions?: Array<{ value: string; label: string }>;
  showVisitType?: boolean;
  showPricePoint?: boolean;
  showStore?: boolean;
  showTwoWeek?: boolean;
  showEmployeeView?: boolean;
};

export function ReportFiltersForm({
  filters,
  appointmentTypeOptions,
  pricePointOptions = [],
  storeOptions = [],
  showVisitType = true,
  showPricePoint = true,
  showStore = false,
  showTwoWeek = false,
  showEmployeeView = false
}: ReportFiltersFormProps) {
  const [view, setView] = useState<"day" | "week" | "twoWeek" | "month" | "year" | "custom">(filters.view);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  function submitFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const params = new URLSearchParams(searchParams.toString());

    [
      "store",
      "view",
      "day",
      "week",
      "twoWeek",
      "month",
      "year",
      "dateFrom",
      "dateTo",
      "pricePoint",
      "visitType",
      "appointmentType",
      "stylist",
      "staffView"
    ].forEach((key) => params.delete(key));

    formData.forEach((value, key) => {
      const stringValue = typeof value === "string" ? value.trim() : "";
      if (stringValue) {
        params.set(key, stringValue);
      }
    });

    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`, { scroll: false });
    });
  }

  return (
    <form className={`report-controls${isPending ? " is-loading" : ""}`} method="get" onSubmit={submitFilters}>
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
            setView(event.target.value as "day" | "week" | "twoWeek" | "month" | "year" | "custom")
          }
          value={view}
        >
          <option value="day">Day</option>
          <option value="week">Week</option>
          {showTwoWeek ? <option value="twoWeek">2-Week</option> : null}
          <option value="month">Month</option>
          <option value="year">Year</option>
          <option value="custom">Custom Range</option>
        </select>
      </label>

      {view === "day" ? (
        <label className="field report-date-field">
          <span className="field-label">Day</span>
          <input className="input" name="day" type="date" defaultValue={filters.day} />
        </label>
      ) : null}

      {view === "week" ? (
        <label className="field report-date-field">
          <span className="field-label">Week</span>
          <input className="input" name="week" type="week" defaultValue={filters.week} />
        </label>
      ) : null}

      {view === "twoWeek" ? (
        <label className="field report-date-field">
          <span className="field-label">2-Week Start</span>
          <input className="input" name="twoWeek" type="date" defaultValue={filters.twoWeek} />
        </label>
      ) : null}

      {view === "month" ? (
        <label className="field report-date-field">
          <span className="field-label">Month</span>
          <input className="input" name="month" type="month" defaultValue={filters.month} />
        </label>
      ) : null}

      {view === "year" ? (
        <label className="field report-date-field report-year-field">
          <span className="field-label">Year</span>
          <input className="input" name="year" type="number" defaultValue={filters.year} />
        </label>
      ) : null}

      {view === "custom" ? (
        <>
          <label className="field report-date-field">
            <span className="field-label">From</span>
            <input className="input" name="dateFrom" type="date" defaultValue={filters.dateFrom} />
          </label>
          <label className="field report-date-field">
            <span className="field-label">To</span>
            <input className="input" name="dateTo" type="date" defaultValue={filters.dateTo} />
          </label>
        </>
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

      {showEmployeeView ? (
        <label className="field">
          <span className="field-label">Employees</span>
          <select className="select" name="staffView" defaultValue={filters.staffView || ""}>
            <option value="">Stylists only</option>
            <option value="all">All employees</option>
          </select>
        </label>
      ) : null}

      <div className="form-actions report-apply">
        <button aria-busy={isPending} className={`button${isPending ? " is-pending" : ""}`} disabled={isPending} type="submit">
          {isPending ? "Applying..." : "Apply filters"}
        </button>
      </div>
    </form>
  );
}
