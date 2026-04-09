"use server";

import { revalidatePath } from "next/cache";

import { syncBridalLiveAppointmentsForStore } from "@/lib/bridallive/sync";
import { getStoreViewShell } from "@/lib/store-views";
import { prisma } from "@/lib/prisma";

function asString(value: FormDataEntryValue | null) {
  if (typeof value !== "string") return "";
  return value.trim();
}

export async function syncDashboardBridalLiveAppointments(formData: FormData) {
  const storeSlug = asString(formData.get("storeSlug"));
  if (!storeSlug) {
    throw new Error("Store is required.");
  }

  const shell = await getStoreViewShell(storeSlug);
  if (!shell) {
    throw new Error("Store could not be found.");
  }

  for (const sourceStore of shell.sourceStores) {
    await syncBridalLiveAppointmentsForStore(sourceStore);
  }

  revalidatePath("/dashboard");
}

export async function markBridalLiveAppointmentNoShow(formData: FormData) {
  const bridalLiveAppointmentId = asString(formData.get("bridalLiveAppointmentId"));
  if (!bridalLiveAppointmentId) {
    throw new Error("BridalLive appointment is required.");
  }

  await prisma.bridalLiveAppointment.update({
    where: { id: bridalLiveAppointmentId },
    data: {
      isNoShow: true
    }
  });

  revalidatePath("/dashboard");
}
