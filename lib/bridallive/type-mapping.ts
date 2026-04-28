import { VisitType } from "@prisma/client";

import { normalizeKey } from "@/lib/strings";

const APPOINTMENT_TYPE_MAP: Record<string, string> = {
  accessories: "Accessories",
  "alteration (custom)": "Alteration Custom",
  "alteration 1 bm": "Alterations 1",
  "alteration 1 so": "Alterations 1",
  "alteration 1 wg": "Alterations 1",
  "alteration 2 bm": "Alteration 2",
  "alteration 2 so": "Alteration 2",
  "alteration 2 wg": "Alteration 2",
  "alteration 3 wg": "Alteration 3",
  "comeback bride": "Comeback Bride",
  bridesmaid: "New Bridesmaid",
  "bridal appointment": "New Bride",
  "destination bride": "Destination Bride",
  "mother of bride": "Mother of Bride",
  "new bride": "New Bride",
  "new bride (weekend)": "New Bride",
  presentation: "Presentation",
  prom: "Other",
  "special occasion": "Special Occasion",
  "pick up": "Pickup",
  "press pick up": "Pickup",
  "customer service": "Other",
  interview: "Other",
  "plat press": "Other"
};

export function resolveBridalLiveVisitType(label: string) {
  return normalizeKey(label) === "walk-in bride" ? VisitType.WALK_IN : VisitType.APPOINTMENT;
}

export function resolveBridalLiveDailyLogLabel(label: string) {
  const normalized = normalizeKey(label);
  if (normalized === "walk-in bride") {
    return "New Bride";
  }
  if (normalized === "alteration consultation") {
    return "Alteration Custom";
  }

  return APPOINTMENT_TYPE_MAP[normalized] || null;
}
