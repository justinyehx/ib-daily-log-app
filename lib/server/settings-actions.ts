"use server";

import { StaffRole, StoreOptionKind, UserRole } from "@prisma/client";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";

import { hashPassword } from "@/lib/passwords";
import { prisma } from "@/lib/prisma";
import { normalizeName } from "@/lib/strings";

function asString(value: FormDataEntryValue | null) {
  if (typeof value !== "string") return "";
  return value.trim();
}

async function requireAdminCookie() {
  const cookieStore = await cookies();
  const isAuthenticated = cookieStore.get("ib-demo-auth")?.value === "true";
  const role = cookieStore.get("ib-demo-role")?.value;

  if (!isAuthenticated || role !== "ADMIN") {
    throw new Error("Admin access is required.");
  }
}

async function getAuthenticatedRole() {
  const cookieStore = await cookies();
  const isAuthenticated = cookieStore.get("ib-demo-auth")?.value === "true";
  const role = cookieStore.get("ib-demo-role")?.value;
  const storeSlug = cookieStore.get("ib-demo-store")?.value || "";

  if (!isAuthenticated || !role) {
    throw new Error("Sign in is required.");
  }

  return { role, storeSlug };
}

function revalidateSettingsAndLogin() {
  revalidatePath("/settings");
  revalidatePath("/login");
  revalidatePath("/dashboard");
  revalidatePath("/daily-log");
  revalidatePath("/analytics");
  revalidatePath("/stylists");
  revalidatePath("/admin-view");
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

  if (formKind === "staff-stylist" || formKind === "staff-seamstress") {
    const role = formKind === "staff-seamstress" ? StaffRole.SEAMSTRESS : StaffRole.STYLIST;
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

  revalidatePath("/settings");
  revalidatePath("/dashboard");
  revalidatePath("/daily-log");
  revalidatePath("/analytics");
  revalidatePath("/stylists");
  revalidatePath("/admin-view");
}

export async function removeSettingsItem(formData: FormData) {
  const formKind = asString(formData.get("formKind"));
  const itemId = asString(formData.get("itemId"));

  if (!formKind || !itemId) {
    throw new Error("List type and item are required.");
  }

  if (formKind === "staff-stylist" || formKind === "staff-seamstress") {
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

  revalidatePath("/settings");
  revalidatePath("/dashboard");
  revalidatePath("/daily-log");
  revalidatePath("/analytics");
  revalidatePath("/stylists");
  revalidatePath("/admin-view");
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

export async function applyAccessSettings(formData: FormData) {
  await requireAdminCookie();
  const role = asString(formData.get("role")).toUpperCase();
  const password = asString(formData.get("password"));
  const stylistName = asString(formData.get("stylistName"));
  const storeSlug = asString(formData.get("storeSlug"));

  const cookieStore = await cookies();
  const normalizedRole =
    role === "USER" || role === "STYLIST" || role === "MANAGER" || role === "ADMIN" ? role : "USER";

  if (normalizedRole === "USER") {
    cookieStore.set("ib-demo-role", "USER");
    cookieStore.set("ib-demo-stylist", "");
    revalidatePath("/dashboard");
    revalidatePath("/daily-log");
    revalidatePath("/analytics");
    revalidatePath("/stylists");
    revalidatePath("/settings");
    revalidatePath("/admin-view");
    return;
  }

  if (normalizedRole === "STYLIST") {
    if (password !== "stylist123") {
      throw new Error("Stylist password is incorrect.");
    }
    if (!stylistName) {
      throw new Error("Select a stylist.");
    }
    cookieStore.set("ib-demo-role", "STYLIST");
    cookieStore.set("ib-demo-stylist", stylistName);
    revalidatePath("/dashboard");
    revalidatePath("/daily-log");
    revalidatePath("/analytics");
    revalidatePath("/stylists");
    revalidatePath("/settings");
    revalidatePath("/admin-view");
    return;
  }

  if (normalizedRole === "MANAGER") {
    if (password !== "manager123") {
      throw new Error("Manager password is incorrect.");
    }
    cookieStore.set("ib-demo-role", "MANAGER");
    cookieStore.set("ib-demo-stylist", "");
    revalidatePath("/dashboard");
    revalidatePath("/daily-log");
    revalidatePath("/analytics");
    revalidatePath("/stylists");
    revalidatePath("/settings");
    revalidatePath("/admin-view");
    return;
  }

  if (password !== "admin123") {
    throw new Error("Admin password is incorrect.");
  }

  cookieStore.set("ib-demo-role", "ADMIN");
  cookieStore.set("ib-demo-stylist", "");
  if (storeSlug) {
    cookieStore.set("ib-demo-store", storeSlug);
  }
  revalidatePath("/dashboard");
  revalidatePath("/daily-log");
  revalidatePath("/analytics");
  revalidatePath("/stylists");
  revalidatePath("/settings");
  revalidatePath("/admin-view");
}

export async function switchDemoStore(formData: FormData) {
  await requireAdminCookie();
  const storeSlug = asString(formData.get("storeSlug"));
  if (!storeSlug) {
    throw new Error("Store is required.");
  }

  const cookieStore = await cookies();
  cookieStore.set("ib-demo-store", storeSlug);

  revalidatePath("/dashboard");
  revalidatePath("/daily-log");
  revalidatePath("/analytics");
  revalidatePath("/stylists");
  revalidatePath("/settings");
  revalidatePath("/admin-view");
}
