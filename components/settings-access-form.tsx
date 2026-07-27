"use client";

import { useMemo, useState } from "react";

import { SubmitButton } from "@/components/submit-button";
import { applyAccessSettings } from "@/lib/server/settings-actions";

type SettingsAccessFormProps = {
  currentRole: "USER" | "STYLIST" | "MANAGER" | "ADMIN";
  currentStoreSlug: string;
  disabled: boolean;
  stylistOptions: string[];
};

export function SettingsAccessForm({
  currentRole,
  currentStoreSlug,
  disabled,
  stylistOptions
}: SettingsAccessFormProps) {
  const [role, setRole] = useState(currentRole);
  const visibleStylists = useMemo(() => stylistOptions.slice().sort((a, b) => a.localeCompare(b)), [stylistOptions]);

  return (
    <form action={applyAccessSettings} className="settings-form">
      <input type="hidden" name="storeSlug" value={currentStoreSlug} />

      <label className="settings-field">
        Preview as
        <select
          defaultValue={currentRole}
          disabled={disabled}
          name="role"
          onChange={(event) => setRole(event.target.value as SettingsAccessFormProps["currentRole"])}
        >
          <option value="ADMIN">Admin (your own role)</option>
          <option value="MANAGER">Manager</option>
          <option value="USER">User (front desk)</option>
          <option value="STYLIST">Stylist</option>
        </select>
      </label>

      {role === "STYLIST" ? (
        <label className="settings-field">
          Stylist
          <select defaultValue="" disabled={disabled} name="stylistName" required>
            <option value="">Select stylist</option>
            {visibleStylists.map((stylist) => (
              <option key={stylist} value={stylist}>
                {stylist}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <p className="settings-copy">
        Previewing shows the app exactly as that role sees it, including their restrictions. Your
        account stays an admin — a banner at the top lets you exit preview at any time.
      </p>

      <div className="settings-actions">
        <SubmitButton className="button" pendingLabel="Applying..." disabled={disabled}>
          {role === "ADMIN" ? "Exit preview" : "Start preview"}
        </SubmitButton>
      </div>
    </form>
  );
}
