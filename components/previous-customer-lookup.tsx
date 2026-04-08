"use client";

import { formatDateLabel } from "@/lib/appointment-form-utils";

export type CustomerProfile = {
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
  storeId?: string;
  storeName?: string;
};

type PreviousCustomerLookupProps = {
  /** The debounced search query (already lowercased + trimmed). */
  query: string;
  /** The raw guest name string, used in the "no match" message. */
  guestName: string;
  /** Pre-filtered profiles that match the current query. */
  matches: CustomerProfile[];
  /** Called when the user clicks "Use previous info" on a card. */
  onSelect: (profile: CustomerProfile) => void;
};

/**
 * Renders the previous-customer lookup panel that appears while the
 * user types a guest name in either check-in form.
 */
export function PreviousCustomerLookup({
  query,
  guestName,
  matches,
  onSelect
}: PreviousCustomerLookupProps) {
  if (query.length < 2) return null;

  return (
    <div className="previous-lookup full-span">
      <div className="previous-lookup-head">
        <div>
          <div className="eyebrow">Previous Customers</div>
          <p className="compact-note">
            {matches.length
              ? "Use a previous profile to fill in this check-in faster."
              : `No prior customer found for "${guestName.trim()}".`}
          </p>
        </div>
      </div>

      {matches.length ? (
        <div className="previous-lookup-list">
          {matches.map((profile) => (
            <article className="previous-lookup-card" key={profile.id}>
              <div className="previous-lookup-top">
                <div>
                  <strong>{profile.guestName}</strong>
                  <div className="compact-note">Last visit {formatDateLabel(profile.lastVisitDate)}</div>
                  {profile.storeName ? <div className="compact-note">{profile.storeName}</div> : null}
                </div>
                <button
                  className="button secondary"
                  type="button"
                  onClick={() => onSelect(profile)}
                >
                  Use previous info
                </button>
              </div>

              <div className="pill-row">
                <span className="pill">{profile.appointmentType || "—"}</span>
                {profile.assignedTo ? <span className="pill">{profile.assignedTo}</span> : null}
                {profile.location ? <span className="pill">{profile.location}</span> : null}
              </div>

              <div className="lookup-grid">
                <div className="lookup-field">
                  <span>Wear Date</span>
                  <strong>{profile.wearDate ? formatDateLabel(profile.wearDate) : "—"}</strong>
                </div>
                <div className="lookup-field">
                  <span>Heard From</span>
                  <strong>{profile.heardAbout || "—"}</strong>
                </div>
                <div className="lookup-field">
                  <span>Price Point</span>
                  <strong>{profile.pricePoint || "—"}</strong>
                </div>
                <div className="lookup-field">
                  <span>Size</span>
                  <strong>{profile.size || "—"}</strong>
                </div>
                <div className="lookup-field">
                  <span>Purchased</span>
                  <strong>{profile.purchased || "—"}</strong>
                </div>
                <div className="lookup-field">
                  <span>Other Sale</span>
                  <strong>{profile.otherSale || "—"}</strong>
                </div>
              </div>

              {profile.comments ? (
                <p className="compact-note">
                  <strong>Comment:</strong> {profile.comments}
                </p>
              ) : null}
            </article>
          ))}
        </div>
      ) : null}
    </div>
  );
}
