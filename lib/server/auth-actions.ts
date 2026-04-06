"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";

function asString(value: FormDataEntryValue | null) {
  if (typeof value !== "string") return "";
  return value.trim();
}

const PASSWORDS = {
  USER: "user123",
  STYLIST: "stylist123",
  MANAGER: "manager123",
  ADMIN: "admin123"
} as const;

function revalidateAll() {
  revalidatePath("/dashboard");
  revalidatePath("/daily-log");
  revalidatePath("/analytics");
  revalidatePath("/stylists");
  revalidatePath("/settings");
  revalidatePath("/admin-view");
  revalidatePath("/login");
}

export async function signInDemo(formData: FormData) {
  const role = asString(formData.get("role")).toUpperCase() as keyof typeof PASSWORDS;
  const password = asString(formData.get("password"));
  const storeSlug = asString(formData.get("storeSlug"));
  const stylistName = asString(formData.get("stylistName"));

  if (!(role in PASSWORDS)) {
    throw new Error("Select a role.");
  }

  if (password !== PASSWORDS[role]) {
    throw new Error("Password is incorrect.");
  }

  if ((role === "USER" || role === "MANAGER" || role === "STYLIST") && !storeSlug) {
    throw new Error("Select a store.");
  }

  if (role === "STYLIST") {
    if (!stylistName) {
      throw new Error("Select a stylist.");
    }

    const store = await prisma.store.findUnique({
      where: { slug: storeSlug },
      select: { id: true }
    });

    if (!store) {
      throw new Error("Store could not be found.");
    }

    const staffMember = await prisma.staffMember.findFirst({
      where: {
        storeId: store.id,
        isActive: true,
        role: "STYLIST",
        fullName: stylistName
      },
      select: { id: true }
    });

    if (!staffMember) {
      throw new Error("That stylist is not active in the selected store.");
    }
  }

  const cookieStore = await cookies();
  cookieStore.set("ib-demo-auth", "true");
  cookieStore.set("ib-demo-role", role);
  cookieStore.set("ib-demo-store", storeSlug || "curve");
  cookieStore.set("ib-demo-stylist", role === "STYLIST" ? stylistName : "");

  revalidateAll();
  redirect(role === "STYLIST" ? "/stylists" : "/dashboard");
}

export async function signOutDemo() {
  const cookieStore = await cookies();
  cookieStore.delete("ib-demo-auth");
  cookieStore.delete("ib-demo-role");
  cookieStore.delete("ib-demo-store");
  cookieStore.delete("ib-demo-stylist");

  revalidateAll();
  redirect("/login");
}
