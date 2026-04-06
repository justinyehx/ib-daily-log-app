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
        Role
        <select
          defaultValue={currentRole}
          disabled={disabled}
          name="role"
          onChange={(event) => setRole(event.target.value as SettingsAccessFormProps["currentRole"])}
        >
          <option value="USER">User</option>
          <option value="STYLIST">Stylist</option>
          <option value="MANAGER">Manager</option>
          <option value="ADMIN">Admin</option>
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

      <label className="settings-field">
        Password
        <input disabled={disabled} name="password" placeholder="Enter role password" type="password" />
      </label>

      <div className="settings-actions">
        <SubmitButton className="button" pendingLabel="Applying..." disabled={disabled}>
          Apply role
        </SubmitButton>
      </div>
    </form>
  );
}
