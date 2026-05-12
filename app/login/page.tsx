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
          <div className="eyebrow">Sign in</div>
          <h1 className="panel-title">Impression Bridal Daily Log</h1>
          <p className="panel-copy">
            Use the email and password your admin or manager created for you.
          </p>
        </div>

        <LoginForm stores={stores} />
      </section>
    </main>
  );
}
