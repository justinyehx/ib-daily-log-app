"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { syncBridalLiveAppointmentsForStore } from "@/lib/bridallive/sync";
import { getStoreViewShell } from "@/lib/store-views";
import { prisma } from "@/lib/prisma";

function asString(value: FormDataEntryValue | null) {
  if (typeof value !== "string") return "";
  return value.trim();
}

function buildDashboardRedirect(errorMessage?: string) {
  const params = new URLSearchParams();
  if (errorMessage) {
    params.set("bridalLiveError", errorMessage);
  }

  const query = params.toString();
  return query ? `/dashboard?${query}` : "/dashboard";
}

function getFriendlyBridalLiveError(error: unknown) {
  const message = error instanceof Error ? error.message : "Unable to sync BridalLive appointments.";

  if (process.env.NODE_ENV !== "production" && message) {
    return message;
  }

  if (message.includes("401")) {
    return "BridalLive login was rejected (401). Check the API key or ask BridalLive to whitelist the server IP.";
  }

  if (message.includes("not configured")) {
    return "BridalLive is not configured for this store yet.";
  }

  return "Unable to sync BridalLive appointments right now.";
}

export async function syncDashboardBridalLiveAppointments(formData: FormData) {
  const storeSlug = asString(formData.get("storeSlug"));
  if (!storeSlug) {
    redirect(buildDashboardRedirect("Store is required before syncing BridalLive appointments."));
  }

  const shell = await getStoreViewShell(storeSlug);
  if (!shell) {
    redirect(buildDashboardRedirect("Store could not be found."));
  }

  try {
    for (const sourceStore of shell.sourceStores) {
      await syncBridalLiveAppointmentsForStore(sourceStore);
    }
  } catch (error) {
    console.error("BridalLive sync failed", error);
    redirect(buildDashboardRedirect(getFriendlyBridalLiveError(error)));
  }

  revalidatePath("/dashboard");
  redirect(buildDashboardRedirect());
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

export async function undoBridalLiveAppointmentNoShow(formData: FormData) {
  const bridalLiveAppointmentId = asString(formData.get("bridalLiveAppointmentId"));
  if (!bridalLiveAppointmentId) {
    throw new Error("BridalLive appointment is required.");
  }

  await prisma.bridalLiveAppointment.update({
    where: { id: bridalLiveAppointmentId },
    data: {
      isNoShow: false
    }
  });

  revalidatePath("/dashboard");
}
