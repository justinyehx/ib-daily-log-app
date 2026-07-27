import { cookies } from "next/headers";

import { appEnv } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { COMBINED_STORE_NAME, COMBINED_STORE_SLUG } from "@/lib/store-views";

export type DemoRole = "USER" | "STYLIST" | "MANAGER" | "ADMIN";

export type CurrentSession = {
  fullName: string;
  /** Effective role — the previewed role when an admin is previewing, otherwise the real role.
   *  Use this for UI and page-level permissions so preview behaves like the real thing. */
  role: DemoRole;
  /** The account's actual role, never affected by preview. Use this to gate entering/exiting
   *  preview so an admin can always get back out. */
  trueRole: DemoRole;
  isPreviewing: boolean;
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

const VALID_ROLES: DemoRole[] = ["USER", "STYLIST", "MANAGER", "ADMIN"];

function parseRole(value: string | undefined): DemoRole | null {
  return value && VALID_ROLES.includes(value as DemoRole) ? (value as DemoRole) : null;
}

/** Applies an active role preview on top of a resolved session.
 *  Only a true ADMIN may preview, so a lower role can never escalate itself. */
function applyPreview(
  base: CurrentSession,
  previewRole: DemoRole | null,
  previewStylist: string
): CurrentSession {
  if (!previewRole || base.trueRole !== "ADMIN" || previewRole === base.trueRole) {
    return base;
  }

  return {
    ...base,
    role: previewRole,
    isPreviewing: true,
    fullName:
      previewRole === "STYLIST" && previewStylist
        ? previewStylist
        : previewRole === "MANAGER"
          ? "Manager Preview"
          : previewRole === "USER"
            ? "User Preview"
            : base.fullName
  };
}

export async function getCurrentSession(): Promise<CurrentSession> {
  const cookieStore = await cookies();
  const isAuthenticated = cookieStore.get("ib-demo-auth")?.value === "true";
  const userId = cookieStore.get("ib-demo-user-id")?.value || "";
  const role = (cookieStore.get("ib-demo-role")?.value as DemoRole | undefined) || "USER";
  const storeSlug = cookieStore.get("ib-demo-store")?.value || appEnv.defaultStoreSlug;
  const stylistName = cookieStore.get("ib-demo-stylist")?.value || "";
  const previewRole = parseRole(cookieStore.get("ib-demo-preview-role")?.value);
  const previewStylist = cookieStore.get("ib-demo-preview-stylist")?.value || "";

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
      // storeSlug is always the user's own assigned store — used for auth checks
      // and default redirects. The active viewing store is determined by the URL.
      const userStoreSlug = user.store?.slug || appEnv.defaultStoreSlug;
      return applyPreview(
        {
          fullName:
            user.role === "STYLIST" && user.staffMember?.fullName ? user.staffMember.fullName : user.fullName,
          role: user.role,
          trueRole: user.role,
          isPreviewing: false,
          storeSlug: userStoreSlug,
          storeName: STORE_LABELS[userStoreSlug] || user.store?.name || "Curve by IB",
          isAuthenticated: true
        },
        previewRole,
        previewStylist
      );
    }
  }

  return applyPreview(
    {
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
      trueRole: role,
      isPreviewing: false,
      storeSlug,
      storeName: STORE_LABELS[storeSlug] || "Curve by IB",
      isAuthenticated
    },
    previewRole,
    previewStylist
  );
}
