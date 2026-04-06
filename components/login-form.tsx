"use client";

import { useMemo, useState } from "react";

import { signInDemo } from "@/lib/server/auth-actions";

type LoginStore = {
  slug: string;
  name: string;
  stylists: string[];
};

type LoginFormProps = {
  stores: LoginStore[];
};

export function LoginForm({ stores }: LoginFormProps) {
  const [mode, setMode] = useState<"account" | "beta">("account");
  const [role, setRole] = useState("USER");
  const [storeSlug, setStoreSlug] = useState(stores[0]?.slug || "curve");

  const visibleStylists = useMemo(
    () => stores.find((store) => store.slug === storeSlug)?.stylists || [],
    [storeSlug, stores]
  );

  return (
    <form action={signInDemo} className="settings-form">
      <div className="segmented-control">
        <button className={mode === "account" ? "active" : ""} type="button" onClick={() => setMode("account")}>
          User account
        </button>
        <button className={mode === "beta" ? "active" : ""} type="button" onClick={() => setMode("beta")}>
          Beta role access
        </button>
      </div>

      {mode === "account" ? (
        <label className="settings-field">
          Email
          <input name="email" placeholder="name@example.com" required type="email" />
        </label>
      ) : null}

      {mode === "beta" ? (
        <label className="settings-field">
          Role
          <select defaultValue="USER" name="role" onChange={(event) => setRole(event.target.value)}>
            <option value="USER">User</option>
            <option value="STYLIST">Stylist</option>
            <option value="MANAGER">Manager</option>
            <option value="ADMIN">Admin</option>
          </select>
        </label>
      ) : null}

      {mode === "beta" ? (
        <label className="settings-field">
          Store
          <select defaultValue={storeSlug} name="storeSlug" onChange={(event) => setStoreSlug(event.target.value)}>
            {stores.map((store) => (
              <option key={store.slug} value={store.slug}>
                {store.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {mode === "beta" && role === "STYLIST" ? (
        <label className="settings-field">
          Stylist
          <select defaultValue="" name="stylistName" required>
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
        <input name="password" placeholder="Enter access password" type="password" />
      </label>

      <div className="settings-actions">
        <button className="button" type="submit">
          Sign in
        </button>
      </div>
    </form>
  );
}
