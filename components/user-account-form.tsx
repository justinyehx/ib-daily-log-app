"use client";

import { useMemo, useState } from "react";

import { SubmitButton } from "@/components/submit-button";
import { createUserAccount } from "@/lib/server/settings-actions";

type AccountRole = "USER" | "STYLIST" | "MANAGER" | "ADMIN";

type AccountStore = {
  id: string;
  slug: string;
  name: string;
};

type UserAccountFormProps = {
  canCreateAnyRole: boolean;
  currentStoreId: string;
  currentStoreName: string;
  stores: AccountStore[];
};

export function UserAccountForm({
  canCreateAnyRole,
  currentStoreId,
  currentStoreName,
  stores
}: UserAccountFormProps) {
  const [role, setRole] = useState<AccountRole>(canCreateAnyRole ? "USER" : "STYLIST");
  const availableStores = useMemo(
    () => (canCreateAnyRole ? stores : stores.filter((store) => store.id === currentStoreId)),
    [canCreateAnyRole, currentStoreId, stores]
  );

  return (
    <form action={createUserAccount} className="settings-form account-form">
      <input type="hidden" name="managerStoreId" value={currentStoreId} />

      <label className="settings-field">
        Full name
        <input name="fullName" placeholder={role === "STYLIST" ? "Stylist name" : "User name"} required />
      </label>

      <label className="settings-field">
        Email
        <input name="email" placeholder="name@example.com" required type="email" />
      </label>

      <label className="settings-field">
        Temporary password
        <input minLength={6} name="password" placeholder="At least 6 characters" required type="password" />
      </label>

      <label className="settings-field">
        Role
        <select
          name="role"
          onChange={(event) => setRole(event.target.value as AccountRole)}
          value={role}
        >
          {canCreateAnyRole ? <option value="USER">User</option> : null}
          <option value="STYLIST">Stylist</option>
          {canCreateAnyRole ? <option value="MANAGER">Manager</option> : null}
          {canCreateAnyRole ? <option value="ADMIN">Admin</option> : null}
        </select>
      </label>

      <label className="settings-field">
        Store
        <select name="storeId" defaultValue={currentStoreId}>
          {availableStores.map((store) => (
            <option key={store.id} value={store.id}>
              {canCreateAnyRole ? store.name : currentStoreName}
            </option>
          ))}
        </select>
      </label>

      {role === "STYLIST" ? (
        <p className="settings-copy">
          Stylist accounts are automatically linked to the matching stylist record for the selected store, or created if
          they do not exist yet.
        </p>
      ) : null}

      <div className="settings-actions">
        <SubmitButton className="button" pendingLabel="Creating...">
          Create user
        </SubmitButton>
      </div>
    </form>
  );
}
