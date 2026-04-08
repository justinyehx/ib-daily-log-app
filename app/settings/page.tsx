import { redirect } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { SettingsAccessForm } from "@/components/settings-access-form";
import { SubmitButton } from "@/components/submit-button";
import { UserAccountForm } from "@/components/user-account-form";
import { getCurrentSession } from "@/lib/auth";
import { getSettingsData } from "@/lib/reporting-data";
import { addSettingsItem, disableUserAccount, removeSettingsItem, switchDemoStore } from "@/lib/server/settings-actions";

// No force-dynamic needed: getCurrentSession() reads cookies which already
// makes this route dynamic. Settings data (staff, options, users) is
// config-level data that changes only on explicit user action.

export default async function SettingsPage() {
  const session = await getCurrentSession();
  if (!session.isAuthenticated) {
    redirect("/login");
  }
  if (session.role === "USER" || session.role === "STYLIST") {
    redirect(session.role === "STYLIST" ? "/stylists" : "/dashboard");
  }

  const settings = await getSettingsData(session.storeSlug);

  if (!settings) {
    return null;
  }

  const stylistOptions =
    settings.optionGroups.find((group) => group.title === "Stylists")?.items.map((item) => item.label) || [];
  const totalOptionValues = settings.optionGroups.reduce((sum, group) => sum + group.items.length, 0);
  const isAdmin = session.role === "ADMIN";
  const accessSummary = isAdmin
    ? "Admin access can change the active role, switch stores, and manage live dropdown values."
    : "Manager access can review store settings here, but only admins can change permissions or switch stores.";

  return (
    <AppShell
      activeView="settings"
      storeName={settings.store.name}
      session={session}
      snapshot={settings.snapshot}
      stores={settings.stores}
    >
      <div className="page-stack">
        <section className="panel">
          <div className="panel-head">
            <div>
              <p className="panel-kicker">Access Settings</p>
              <h3>Role and store controls</h3>
            </div>
          </div>

          <div className="settings-grid">
            <section className="settings-card">
              <p className="panel-kicker">User Role</p>
              <h3>Current permission level</h3>
              <SettingsAccessForm
                currentRole={session.role}
                currentStoreSlug={settings.store.slug}
                disabled={!isAdmin}
                stylistOptions={stylistOptions}
              />
              <p className="settings-copy">{accessSummary}</p>
              <div className="settings-summary-grid">
                <div className="settings-summary-card">
                  <span>Active role</span>
                  <strong>{session.role}</strong>
                </div>
                <div className="settings-summary-card">
                  <span>Current store</span>
                  <strong>{settings.store.name}</strong>
                </div>
                <div className="settings-summary-card">
                  <span>Role editing</span>
                  <strong>{isAdmin ? "Unlocked" : "Admin only"}</strong>
                </div>
              </div>
            </section>

            <section className="settings-card">
              <p className="panel-kicker">Store Access</p>
              <h3>Store assignment</h3>
              <form action={switchDemoStore} className="settings-form">
                <label className="settings-field">
                  Store
                  <select defaultValue={settings.store.slug} disabled={!isAdmin} name="storeSlug">
                    {settings.stores.map((store) => (
                      <option key={store.slug} value={store.slug}>
                        {store.name}
                      </option>
                    ))}
                  </select>
                </label>
                {isAdmin ? (
                  <div className="settings-actions">
                    <SubmitButton className="button" pendingLabel="Switching...">
                      Switch store
                    </SubmitButton>
                  </div>
                ) : null}
              </form>
              <p className="settings-copy">
                {isAdmin
                  ? "Choose the live store view here or use the sidebar store switcher."
                  : "Managers stay on their current store, matching the prototype access rules."}
              </p>
              <div className="settings-summary">
                <div className="mini-stat">
                  <span>Available stores</span>
                  <strong>{settings.stores.length}</strong>
                </div>
                <div className="mini-stat">
                  <span>Current view</span>
                  <strong>{settings.store.name}</strong>
                </div>
              </div>
            </section>

            <section className="settings-card full-width-panel">
              <p className="panel-kicker">Dropdowns</p>
              <h3>Store lists and options</h3>
              <p className="settings-copy">
                {settings.isVirtualStore
                  ? "Galleria and Curve is a combined reporting view, so dropdown editing stays read-only here."
                  : "These dropdowns now write through to the live database, so changes show up across the real app."}
              </p>
              <div className="settings-summary-grid">
                <div className="settings-summary-card">
                  <span>Lists</span>
                  <strong>{settings.optionGroups.length}</strong>
                </div>
                <div className="settings-summary-card">
                  <span>Total values</span>
                  <strong>{totalOptionValues}</strong>
                </div>
                <div className="settings-summary-card">
                  <span>Edit mode</span>
                  <strong>{settings.isVirtualStore ? "Read only" : "Live"}</strong>
                </div>
              </div>
            </section>
          </div>
        </section>

        <section className="panel">
          <div className="panel-head">
            <div>
              <p className="panel-kicker">User Accounts</p>
              <h3>Manage staff sign-ins</h3>
            </div>
          </div>

          <div className="settings-grid">
            <section className="settings-card">
              <p className="panel-kicker">{isAdmin ? "Admin" : "Manager"} access</p>
              <h3>Create a user</h3>
              <p className="settings-copy">
                {isAdmin
                  ? "Admins can create users, stylists, managers, and admins for any store."
                  : "Managers can create stylist accounts for their current store only."}
              </p>
              <UserAccountForm
                canCreateAnyRole={isAdmin}
                currentStoreId={settings.accountStores[0]?.id || settings.store.id}
                currentStoreName={settings.accountStores[0]?.name || settings.store.name}
                stores={settings.accountStores}
              />
            </section>

            <section className="settings-card">
              <p className="panel-kicker">Active Accounts</p>
              <h3>User list</h3>
              <div className="operation-list">
                {settings.users.length ? (
                  settings.users.map((user) => (
                    <div className={`operation-item account-item ${!user.isActive ? "muted" : ""}`} key={user.id}>
                      <span>
                        <strong>{user.fullName}</strong>
                        <small>
                          {user.email} · {user.role} · {user.storeName}
                          {user.stylistName ? ` · ${user.stylistName}` : ""}
                          {!user.isActive ? " · inactive" : ""}
                        </small>
                      </span>
                      {isAdmin && user.isActive ? (
                        <form action={disableUserAccount}>
                          <input type="hidden" name="userId" value={user.id} />
                          <SubmitButton className="button secondary" pendingLabel="Disabling...">
                            Disable
                          </SubmitButton>
                        </form>
                      ) : null}
                    </div>
                  ))
                ) : (
                  <p className="settings-copy">No user accounts have been created for this view yet.</p>
                )}
              </div>
            </section>
          </div>
        </section>

        <section className="panel">
          <div className="panel-head">
            <div>
              <p className="panel-kicker">Dropdowns</p>
              <h3>Manage stylists and dropdown options</h3>
            </div>
          </div>
          <div className="operations-grid">
            {settings.optionGroups.map((group) => (
              <section className="operation-card" key={group.title}>
                <div className="operation-head">
                  <div>
                    <p className="panel-kicker">{group.title}</p>
                    <h3>{group.title}</h3>
                  </div>
                </div>
                <form action={addSettingsItem} className="inline-add-form">
                  <input type="hidden" name="storeId" value={settings.store.id} />
                  <input type="hidden" name="formKind" value={group.formKind} />
                  <input disabled={settings.isVirtualStore} name="value" placeholder={group.inputPlaceholder} required />
                  <SubmitButton className="button" pendingLabel="Adding..." disabled={settings.isVirtualStore}>
                    Add
                  </SubmitButton>
                </form>
                <div className="operation-list">
                  {group.items.length ? (
                    group.items.map((item) => (
                      <div className="operation-item" key={item.id}>
                        <span>{item.label}</span>
                        <form action={removeSettingsItem}>
                          <input type="hidden" name="formKind" value={group.formKind} />
                          <input type="hidden" name="itemId" value={item.id} />
                          <SubmitButton className="button secondary" pendingLabel="Removing..." disabled={settings.isVirtualStore}>
                            Remove
                          </SubmitButton>
                        </form>
                      </div>
                    ))
                  ) : (
                    <p className="settings-copy">No values loaded yet.</p>
                  )}
                </div>
              </section>
            ))}
          </div>
        </section>

        <section className="panel">
          <div className="panel-head">
            <div>
              <p className="panel-kicker">Permission Matrix</p>
              <h3>What each role can do</h3>
            </div>
          </div>
          <div className="table-wrap compact-table">
            <table className="proto-table">
              <thead>
                <tr>
                  <th>Area</th>
                  <th>User</th>
                  <th>Stylist</th>
                  <th>Manager</th>
                  <th>Admin</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Quick check-in and checkout</td>
                  <td>Can add and update</td>
                  <td>No access</td>
                  <td>Can add and update</td>
                  <td>Can add and update</td>
                </tr>
                <tr>
                  <td>Daily log</td>
                  <td>Can add and edit entries</td>
                  <td>No access</td>
                  <td>Can add and edit entries</td>
                  <td>Can add and edit entries</td>
                </tr>
                <tr>
                  <td>Analytics and stylist reporting</td>
                  <td>No access</td>
                  <td>Own stylist data only</td>
                  <td>View only</td>
                  <td>View only</td>
                </tr>
                <tr>
                  <td>Operations</td>
                  <td>View only</td>
                  <td>No access</td>
                  <td>Edit current store</td>
                  <td>Edit all stores</td>
                </tr>
                <tr>
                  <td>Store switching</td>
                  <td>No access</td>
                  <td>No access</td>
                  <td>No access</td>
                  <td>Can switch stores</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
