import { redirect } from "next/navigation";

import { LoginForm } from "@/components/login-form";
import { getCurrentSession } from "@/lib/auth";
import { getAllStoreChoicesWithStylists } from "@/lib/store-views";

export default async function LoginPage() {
  const session = await getCurrentSession();
  if (session.isAuthenticated) {
    redirect(session.role === "STYLIST" ? "/stylists" : "/dashboard");
  }

  const stores = await getAllStoreChoicesWithStylists();
  return (
    <main className="login-wrap">
      <section className="panel login-card">
        <div>
          <div className="eyebrow">Access</div>
          <h1 className="panel-title">Sign in to Impression Bridal Daily Log</h1>
          <p className="panel-copy">
            Use the account your admin or manager created for you. Beta role access is still
            available as a backup while we finish rollout.
          </p>
        </div>

        <LoginForm stores={stores} />

        <div className="sidebar-card">
          <div className="summary-label">Internal beta passwords</div>
          <div className="sidebar-stat-grid">
            <div className="sidebar-stat">
              <span>User</span>
              <strong>user123</strong>
            </div>
            <div className="sidebar-stat">
              <span>Stylist</span>
              <strong>stylist123</strong>
            </div>
            <div className="sidebar-stat">
              <span>Manager</span>
              <strong>manager123</strong>
            </div>
            <div className="sidebar-stat">
              <span>Admin</span>
              <strong>admin123</strong>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
