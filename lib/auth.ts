import { cookies } from "next/headers";

import { appEnv } from "@/lib/env";
import { prisma } from "@/lib/prisma";
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
  const userId = cookieStore.get("ib-demo-user-id")?.value || "";
  const role = (cookieStore.get("ib-demo-role")?.value as DemoRole | undefined) || "USER";
  const storeSlug = cookieStore.get("ib-demo-store")?.value || appEnv.defaultStoreSlug;
  const stylistName = cookieStore.get("ib-demo-stylist")?.value || "";

  if (isAuthenticated && userId) {
    const user = await prisma.user.findFirst({
      where: {
        id: userId,
        isActive: true
      },
      include: {
        staffMember: true,
        store: true
      }
    });

    if (user) {
      const userStoreSlug = user.store?.slug || storeSlug || appEnv.defaultStoreSlug;
      return {
        fullName: user.role === "STYLIST" && user.staffMember?.fullName ? user.staffMember.fullName : user.fullName,
        role: user.role,
        storeSlug: userStoreSlug,
        storeName: STORE_LABELS[userStoreSlug] || user.store?.name || "Curve by IB",
        isAuthenticated: true
      };
    }
  }

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
