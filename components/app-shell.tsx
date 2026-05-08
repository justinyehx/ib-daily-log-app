"use client";

import { useState } from "react";
import Link from "next/link";

import { SubmitButton } from "@/components/submit-button";
import { TimezoneSync } from "@/components/timezone-sync";
import type { CurrentSession } from "@/lib/auth";
import { signOutDemo } from "@/lib/server/auth-actions";
import { switchDemoStore } from "@/lib/server/settings-actions";

// ─── Types ────────────────────────────────────────────────────────────────────

type AppShellProps = {
  activeView: "dashboard" | "daily-log" | "analytics" | "stylists" | "settings" | "admin-view";
  storeName: string;
  session: CurrentSession;
  snapshot: {
    activeNow: number;
    waiting: number;
    soldToday: number;
  };
  stores?: Array<{
    slug: string;
    name: string;
  }>;
  children: React.ReactNode;
};

const navItems: Array<{
  key: AppShellProps["activeView"];
  label: string;
  href?: string;
}> = [
  { key: "dashboard", label: "Dashboard", href: "/dashboard" },
  { key: "daily-log", label: "Daily Log", href: "/daily-log" },
  { key: "analytics", label: "Analytics", href: "/analytics" },
  { key: "stylists", label: "Stylists", href: "/stylists" },
  { key: "admin-view", label: "Admin View", href: "/admin-view" }
];

const ROLE_LABELS: Record<CurrentSession["role"], string> = {
  USER: "User",
  STYLIST: "Stylist",
  MANAGER: "Manager",
  ADMIN: "Admin"
};

// ─── Component ────────────────────────────────────────────────────────────────

export function AppShell({ activeView, storeName, session, snapshot, stores = [], children }: AppShellProps) {
  const [navOpen, setNavOpen] = useState(false);

  const visibleNavItems = navItems.filter((item) => {
    if (session.role === "USER") {
      return item.key === "dashboard" || item.key === "daily-log";
    }

    if (session.role === "STYLIST") {
      return item.key === "stylists";
    }

    if (session.role === "MANAGER") {
      return item.key !== "admin-view";
    }

    return true;
  });
  const showSettingsLink = session.role === "ADMIN" || session.role === "MANAGER";
  const totalInStore = snapshot.activeNow + snapshot.waiting;

  return (
    <div className="shell">
      {/* ── Mobile top bar ── */}
      <header className="mobile-topbar">
        <div className="mobile-topbar-brand">
          <span className="mobile-topbar-store">{storeName}</span>
          {totalInStore > 0 ? (
            <span className="mobile-topbar-badge">{totalInStore} in store</span>
          ) : null}
        </div>
        <button
          className={`hamburger-btn${navOpen ? " open" : ""}`}
          onClick={() => setNavOpen((o) => !o)}
          aria-label={navOpen ? "Close navigation" : "Open navigation"}
          aria-expanded={navOpen}
          type="button"
        >
          <span aria-hidden="true" />
          <span aria-hidden="true" />
          <span aria-hidden="true" />
        </button>
      </header>

      {/* ── Drawer backdrop ── */}
      {navOpen ? (
        <div
          className="nav-backdrop"
          onClick={() => setNavOpen(false)}
          aria-hidden="true"
        />
      ) : null}

      {/* ── Sidebar / Drawer ── */}
      <aside className={`sidebar${navOpen ? " mobile-open" : ""}`}>
        <div className="sidebar-top">
          <div className="sidebar-top-row">
            <div>
              <p className="eyebrow">Bridal Operations</p>
              <div className="brand-block">
                <h1 className="brand-title">Impression Bridal Daily Log</h1>
                <span className="brand-store">{storeName}</span>
              </div>
            </div>
            <button
              className="drawer-close"
              onClick={() => setNavOpen(false)}
              aria-label="Close navigation"
              type="button"
            >
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
                <path d="M2 2l14 14M16 2L2 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
          </div>

          <div className="store-switcher">
            <p className="sidebar-label">Store View</p>
            <div className="store-switcher-row">
              {session.role === "ADMIN" && stores.length ? (
                <form action={switchDemoStore} className="sidebar-store-form">
                  <select className="select sidebar-store-select" defaultValue={session.storeSlug} name="storeSlug">
                    {stores.map((store) => (
                      <option key={store.slug} value={store.slug}>
                        {store.name}
                      </option>
                    ))}
                  </select>
                  <SubmitButton className="button sidebar-store-button" pendingLabel="Changing...">
                    Change
                  </SubmitButton>
                </form>
              ) : (
                <>
                  <strong className="sidebar-store-name">{storeName}</strong>
                  <span className="sidebar-store-note">
                    {session.role === "MANAGER"
                      ? "Manager access stays locked to this store."
                      : session.role === "STYLIST"
                        ? "Stylist reporting follows this store assignment."
                        : "Front desk access is using this store view."}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        <nav className="nav">
          {visibleNavItems.map((item) =>
            item.href ? (
              <Link
                className={`nav-link ${activeView === item.key ? "active" : ""}`}
                href={item.href}
                key={item.key}
                onClick={() => setNavOpen(false)}
              >
                {item.label}
              </Link>
            ) : (
              <span className={`nav-link ${activeView === item.key ? "active" : ""}`} key={item.key}>
                {item.label}
              </span>
            )
          )}
        </nav>

        <section className="sidebar-card">
          <p className="sidebar-label">Store Snapshot</p>
          <div className="mini-stats">
            <div className="mini-stat">
              <span>Active now</span>
              <strong>{snapshot.activeNow}</strong>
            </div>
            <div className="mini-stat">
              <span>Waiting</span>
              <strong>{snapshot.waiting}</strong>
            </div>
            <div className="mini-stat">
              <span>Sold today</span>
              <strong>{snapshot.soldToday}</strong>
            </div>
          </div>
        </section>

        <div className="sidebar-footer">
          <section className="sidebar-card">
            <p className="sidebar-label">Signed in</p>
            <div className="sidebar-session-grid">
              <div className="mini-stat">
                <span>Name</span>
                <strong>{session.fullName}</strong>
              </div>
              <div className="mini-stat">
                <span>Role</span>
                <strong>{ROLE_LABELS[session.role]}</strong>
              </div>
              <div className="mini-stat">
                <span>Store</span>
                <strong>{storeName}</strong>
              </div>
              {session.role === "STYLIST" ? (
                <div className="mini-stat">
                  <span>Assigned stylist</span>
                  <strong>{session.fullName}</strong>
                </div>
              ) : null}
            </div>
            <div className="sidebar-session-actions">
              {showSettingsLink ? (
                <Link
                  aria-label="Settings"
                  className={`settings-dock-link ${activeView === "settings" ? "active" : ""}`}
                  href="/settings"
                  onClick={() => setNavOpen(false)}
                >
                  <span aria-hidden="true">⚙</span>
                </Link>
              ) : null}
              <form action={signOutDemo}>
                <SubmitButton className="button secondary" pendingLabel="Signing out...">
                  Sign out
                </SubmitButton>
              </form>
            </div>
          </section>
        </div>
      </aside>

      <main className="content">{children}</main>
      <TimezoneSync />
    </div>
  );
}
