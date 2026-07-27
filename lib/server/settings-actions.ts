"use server";

import { StaffRole, StoreOptionKind, UserRole } from "@prisma/client";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getCurrentSession } from "@/lib/auth";
import { hashPassword } from "@/lib/passwords";
import { prisma } from "@/lib/prisma";
import { normalizeName } from "@/lib/strings";

function asString(value: FormDataEntryValue | null) {
  if (typeof value !== "string") return "";
  return value.trim();
}

/** Admin gate based on the real session (DB role for signed-in accounts), NOT the
 *  raw `ib-demo-role` cookie. The cookie is mutated by the role-preview switcher,
 *  so reading it here previously let an admin revoke their own access — including
 *  the ability to switch back. */
async function requireAdminCookie() {
  const session = await getCurrentSession();

  if (!session.isAuthenticated || session.role !== "ADMIN") {
    throw new Error("Admin access is required.");
  }
}

async function getAuthenticatedRole() {
  const session = await getCurrentSession();

  if (!session.isAuthenticated) {
    throw new Error("Sign in is required.");
  }

  return { role: session.role as string, storeSlug: session.storeSlug };
}

function revalidateSettingsAndLogin() {
  revalidatePath("/", "layout");
}

function optionKindFromFormKind(formKind: string) {
  switch (formKind) {
    case "option-appointment-type":
      return StoreOptionKind.APPOINTMENT_TYPE;
    case "option-walk-in-type":
      return StoreOptionKind.WALK_IN_TYPE;
    case "option-lead-source":
      return StoreOptionKind.LEAD_SOURCE;
    case "option-price-point":
      return StoreOptionKind.PRICE_POINT;
    case "option-size":
      return StoreOptionKind.SIZE;
    case "option-reason-did-not-buy":
      return StoreOptionKind.REASON_DID_NOT_BUY;
    default:
      return null;
  }
}

export async function addSettingsItem(formData: FormData) {
  const storeId = asString(formData.get("storeId"));
  const formKind = asString(formData.get("formKind"));
  const value = asString(formData.get("value"));

  if (!storeId || !formKind || !value) {
    throw new Error("Store, list type, and value are required.");
  }

  if (formKind === "staff" || formKind === "staff-stylist" || formKind === "staff-seamstress") {
    const roleInput = asString(formData.get("role")).toUpperCase();
    const validRoles: string[] = ["STYLIST", "SEAMSTRESS", "FRONT_DESK", "MANAGER"];
    const role = validRoles.includes(roleInput)
      ? (roleInput as StaffRole)
      : formKind === "staff-seamstress"
        ? StaffRole.SEAMSTRESS
        : StaffRole.STYLIST;
    await prisma.staffMember.upsert({
      where: {
        storeId_role_normalizedFullName: {
          storeId,
          role,
          normalizedFullName: normalizeName(value)
        }
      },
      update: {
        fullName: value,
        isActive: true
      },
      create: {
        storeId,
        role,
        fullName: value,
        normalizedFullName: normalizeName(value),
        isActive: true
      }
    });
  } else if (formKind === "location") {
    await prisma.location.upsert({
      where: {
        storeId_normalizedName: {
          storeId,
          normalizedName: normalizeName(value)
        }
      },
      update: {
        name: value,
        isActive: true
      },
      create: {
        storeId,
        name: value,
        normalizedName: normalizeName(value),
        isActive: true
      }
    });
  } else {
    const kind = optionKindFromFormKind(formKind);
    if (!kind) {
      throw new Error("Unsupported settings list.");
    }

    const existingCount = await prisma.storeOption.count({
      where: {
        storeId,
        kind
      }
    });

    await prisma.storeOption.upsert({
      where: {
        storeId_kind_normalizedLabel: {
          storeId,
          kind,
          normalizedLabel: normalizeName(value)
        }
      },
      update: {
        label: value,
        isActive: true
      },
      create: {
        storeId,
        kind,
        label: value,
        normalizedLabel: normalizeName(value),
        sortOrder: existingCount,
        isActive: true
      }
    });
  }

  revalidatePath("/", "layout");
}

export async function removeSettingsItem(formData: FormData) {
  const formKind = asString(formData.get("formKind"));
  const itemId = asString(formData.get("itemId"));

  if (!formKind || !itemId) {
    throw new Error("List type and item are required.");
  }

  if (formKind === "staff" || formKind === "staff-stylist" || formKind === "staff-seamstress") {
    await prisma.staffMember.update({
      where: { id: itemId },
      data: { isActive: false }
    });
  } else if (formKind === "location") {
    await prisma.location.update({
      where: { id: itemId },
      data: { isActive: false }
    });
  } else {
    await prisma.storeOption.update({
      where: { id: itemId },
      data: { isActive: false }
    });
  }

  revalidatePath("/", "layout");
}

export async function createUserAccount(formData: FormData) {
  const session = await getAuthenticatedRole();
  const fullName = asString(formData.get("fullName"));
  const email = asString(formData.get("email")).toLowerCase();
  const password = asString(formData.get("password"));
  const roleValue = asString(formData.get("role")).toUpperCase();
  const storeId = asString(formData.get("storeId"));
  const role =
    roleValue === "USER" || roleValue === "STYLIST" || roleValue === "MANAGER" || roleValue === "ADMIN"
      ? roleValue
      : null;

  if (!fullName || !email || !password || !role || !storeId) {
    throw new Error("Name, email, password, role, and store are required.");
  }

  if (password.length < 6) {
    throw new Error("Temporary password must be at least 6 characters.");
  }

  if (session.role !== "ADMIN") {
    const managerStore = await prisma.store.findUnique({
      where: { slug: session.storeSlug },
      select: { id: true }
    });

    if (session.role !== "MANAGER" || role !== "STYLIST" || !managerStore || storeId !== managerStore.id) {
      throw new Error("Managers can only create stylist users for their current store.");
    }
  }

  const store = await prisma.store.findUnique({
    where: { id: storeId },
    select: { id: true }
  });

  if (!store) {
    throw new Error("Store could not be found.");
  }

  let staffMemberId: string | null = null;
  if (role === "STYLIST") {
    const staffMember = await prisma.staffMember.upsert({
      where: {
        storeId_role_normalizedFullName: {
          storeId,
          role: StaffRole.STYLIST,
          normalizedFullName: normalizeName(fullName)
        }
      },
      update: {
        fullName,
        isActive: true
      },
      create: {
        storeId,
        role: StaffRole.STYLIST,
        fullName,
        normalizedFullName: normalizeName(fullName),
        isActive: true
      }
    });
    staffMemberId = staffMember.id;
  }

  await prisma.user.upsert({
    where: { email },
    update: {
      fullName,
      passwordHash: hashPassword(password),
      role: role as UserRole,
      storeId,
      staffMemberId,
      isActive: true
    },
    create: {
      fullName,
      email,
      passwordHash: hashPassword(password),
      role: role as UserRole,
      storeId,
      staffMemberId,
      isActive: true
    }
  });

  revalidateSettingsAndLogin();
}

export async function disableUserAccount(formData: FormData) {
  await requireAdminCookie();
  const userId = asString(formData.get("userId"));
  if (!userId) {
    throw new Error("User is required.");
  }

  await prisma.user.update({
    where: { id: userId },
    data: { isActive: false }
  });

  revalidateSettingsAndLogin();
}

/** Gate for entering/leaving role preview. Checks the account's REAL role, so an admin
 *  previewing as User can still switch roles or exit — otherwise previewing as a lower
 *  role would trap them with no way back. */
async function requireTrueAdmin() {
  const session = await getCurrentSession();

  if (!session.isAuthenticated || session.trueRole !== "ADMIN") {
    throw new Error("Admin access is required.");
  }
}

/**
 * Starts (or changes) a role preview for an admin. Preview is stored in its own
 * cookie so it never overwrites the account's real role — the previous behaviour
 * clobbered `ib-demo-role`, which both locked the admin out and had no effect on
 * signed-in accounts, since the session reads the role from the database.
 */
export async function applyAccessSettings(formData: FormData) {
  await requireTrueAdmin();

  const role = asString(formData.get("role")).toUpperCase();
  const stylistName = asString(formData.get("stylistName"));
  const storeSlug = asString(formData.get("storeSlug"));

  const cookieStore = await cookies();
  const normalizedRole =
    role === "USER" || role === "STYLIST" || role === "MANAGER" || role === "ADMIN" ? role : "USER";

  if (storeSlug) {
    cookieStore.set("ib-demo-store", storeSlug);
  }

  // Selecting ADMIN means "stop previewing".
  if (normalizedRole === "ADMIN") {
    cookieStore.delete("ib-demo-preview-role");
    cookieStore.delete("ib-demo-preview-stylist");
    revalidatePath("/", "layout");
    return;
  }

  if (normalizedRole === "STYLIST" && !stylistName) {
    throw new Error("Select a stylist to preview.");
  }

  cookieStore.set("ib-demo-preview-role", normalizedRole);
  cookieStore.set("ib-demo-preview-stylist", normalizedRole === "STYLIST" ? stylistName : "");

  revalidatePath("/", "layout");

  // Land on a page the previewed role can actually access — settings would bounce
  // a USER/STYLIST preview straight back out.
  const target = storeSlug || cookieStore.get("ib-demo-store")?.value || "";
  if (!target) {
    return;
  }
  redirect(normalizedRole === "STYLIST" ? `/${target}/stylists` : `/${target}/dashboard`);
}

/** Ends an active role preview and returns the admin to their own role. */
export async function exitRolePreview() {
  await requireTrueAdmin();

  const cookieStore = await cookies();
  cookieStore.delete("ib-demo-preview-role");
  cookieStore.delete("ib-demo-preview-stylist");

  const storeSlug = cookieStore.get("ib-demo-store")?.value || "";
  revalidatePath("/", "layout");
  redirect(storeSlug ? `/${storeSlug}/settings` : "/dashboard");
}

export async function updateStaffMemberRole(formData: FormData) {
  const session = await getCurrentSession();
  if (!session.isAuthenticated || (session.role !== "ADMIN" && session.role !== "MANAGER")) {
    throw new Error("Manager or admin access is required.");
  }

  const itemId = asString(formData.get("itemId"));
  const roleInput = asString(formData.get("role")).toUpperCase();
  const validRoles = ["STYLIST", "SEAMSTRESS", "FRONT_DESK", "MANAGER"];

  if (!itemId || !validRoles.includes(roleInput)) {
    throw new Error("Staff member and a valid role are required.");
  }

  // Managers may only edit staff in their own store; admins may edit any.
  if (session.role !== "ADMIN") {
    const staff = await prisma.staffMember.findUnique({
      where: { id: itemId },
      select: { store: { select: { slug: true } } }
    });
    if (!staff || staff.store.slug !== session.storeSlug) {
      throw new Error("Not authorized to edit this staff member.");
    }
  }

  await prisma.staffMember.update({
    where: { id: itemId },
    data: { role: roleInput as StaffRole }
  });

  revalidatePath("/", "layout");
  const storeSlugForRedirect = asString(formData.get("storeSlug"));
  redirect(`/${storeSlugForRedirect}/settings?dropdown=staff`);
}


