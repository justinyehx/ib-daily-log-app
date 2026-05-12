"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { verifyPassword } from "@/lib/passwords";
import { prisma } from "@/lib/prisma";

function asString(value: FormDataEntryValue | null) {
  if (typeof value !== "string") return "";
  return value.trim();
}

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
  const email = asString(formData.get("email")).toLowerCase();
  const password = asString(formData.get("password"));

  if (!email) {
    throw new Error("Email is required.");
  }

  const user = await prisma.user.findUnique({
    where: { email },
    include: {
      store: true,
      staffMember: true
    }
  });

  if (!user || !user.isActive || !user.passwordHash || !verifyPassword(password, user.passwordHash)) {
    throw new Error("Email or password is incorrect.");
  }

  const cookieStore = await cookies();
  const userStoreSlug = user.store?.slug || "curve";
  cookieStore.set("ib-demo-auth", "true");
  cookieStore.set("ib-demo-user-id", user.id);
  cookieStore.set("ib-demo-role", user.role);
  cookieStore.set("ib-demo-store", userStoreSlug);
  cookieStore.set("ib-demo-stylist", user.role === "STYLIST" ? user.staffMember?.fullName || user.fullName : "");

  revalidateAll();
  redirect(user.role === "STYLIST" ? "/stylists" : "/dashboard");
}

export async function signOutDemo() {
  const cookieStore = await cookies();
  cookieStore.delete("ib-demo-auth");
  cookieStore.delete("ib-demo-user-id");
  cookieStore.delete("ib-demo-role");
  cookieStore.delete("ib-demo-store");
  cookieStore.delete("ib-demo-stylist");

  revalidateAll();
  redirect("/login");
}
