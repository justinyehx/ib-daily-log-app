import { cookies } from "next/headers";

import { appEnv } from "@/lib/env";
import { COMBINED_STORE_NAME, COMBINED_STORE_SLUG } from "@/lib/store-views";

export type DemoRole = "USER" | "STYLIST" | "MANAGER" | "ADMIN";

export type CurrentSession = {
  fullName: string;
  role: DemoRole;
  storeSlug: string;
  storeName: string;
  isAuthenticated: boolean;
};

const STORE_LABELS: Record<string, string> = {
  curve: "Curve by IB",
  galleria: "Galleria",
  "san-antonio": "San Antonio",
  atlanta: "Atlanta",
  [COMBINED_STORE_SLUG]: COMBINED_STORE_NAME
};

export async function getActiveStoreSlug() {
  const cookieStore = await cookies();
  return cookieStore.get("ib-demo-store")?.value || appEnv.defaultStoreSlug;
}

export async function getCurrentSession(): Promise<CurrentSession> {
  const cookieStore = await cookies();
  const isAuthenticated = cookieStore.get("ib-demo-auth")?.value === "true";
  const role = (cookieStore.get("ib-demo-role")?.value as DemoRole | undefined) || "USER";
  const storeSlug = cookieStore.get("ib-demo-store")?.value || appEnv.defaultStoreSlug;
  const stylistName = cookieStore.get("ib-demo-stylist")?.value || "";

  return {
    fullName:
      !isAuthenticated
        ? "Signed out"
        :
      role === "STYLIST" && stylistName
        ? stylistName
        : role === "MANAGER"
          ? "Manager Preview"
          : role === "USER"
            ? "User Preview"
            : "Admin Preview",
    role,
    storeSlug,
    storeName: STORE_LABELS[storeSlug] || "Curve by IB",
    isAuthenticated
  };
}
