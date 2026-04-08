"use client";

import { useMemo } from "react";

import {
  CustomerCheckoutCard,
  type CustomerCard,
  type LeadSourceOption,
  type PricePointOption,
  type ReasonOption,
  type SizeOption,
  type StaffOption
} from "@/components/customer-checkout-card";

export type { CustomerCard };

type CurrentCustomersPanelProps = {
  customers: CustomerCard[];
  reasonOptions: ReasonOption[];
  staffOptions: StaffOption[];
  leadSourceOptions: LeadSourceOption[];
  pricePointOptions: PricePointOption[];
  sizeOptions: SizeOption[];
  updateStatusAction: (formData: FormData) => void | Promise<void>;
  checkoutAction: (formData: FormData) => void | Promise<void>;
};

export function CurrentCustomersPanel({
  customers,
  reasonOptions,
  staffOptions,
  leadSourceOptions,
  pricePointOptions,
  sizeOptions,
  updateStatusAction,
  checkoutAction
}: CurrentCustomersPanelProps) {
  const visibleCustomers = useMemo(
    () =>
      customers
        .slice()
        .sort((a, b) => {
          if (a.status === "WAITING" && b.status !== "WAITING") return -1;
          if (a.status !== "WAITING" && b.status === "WAITING") return 1;
          return b.durationMinutes - a.durationMinutes;
        }),
    [customers]
  );

  return (
    <section className="panel full-width-panel">
      <div className="panel-head">
        <div>
          <p className="panel-kicker">Current Customers</p>
          <h3>Everyone still in the store</h3>
        </div>
      </div>

      {visibleCustomers.length ? (
        <div className="customer-grid">
          {visibleCustomers.map((customer) => (
            <CustomerCheckoutCard
              key={customer.id}
              checkoutAction={checkoutAction}
              customer={customer}
              leadSourceOptions={leadSourceOptions}
              pricePointOptions={pricePointOptions}
              reasonOptions={reasonOptions}
              sizeOptions={sizeOptions}
              staffOptions={staffOptions}
              updateStatusAction={updateStatusAction}
            />
          ))}
        </div>
      ) : (
        <div className="empty-state">
          No active or waiting customers yet. Once you save a check-in above, it should appear here immediately.
        </div>
      )}
    </section>
  );
}
