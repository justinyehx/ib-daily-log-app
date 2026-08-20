import { StoreOptionKind } from "@prisma/client";

import { prisma } from "@/lib/prisma";

/**
 * Store-scoped lookup helpers with a label fallback.
 *
 * Every store keeps its own copy of each dropdown value — "Google" exists once
 * per store, each with a different id. In the combined Galleria + Curve view the
 * dropdowns are merged and de-duplicated by label, so only one store's ids
 * survive in the list. A form can therefore legitimately submit Curve's "Google"
 * id while saving a Galleria appointment.
 *
 * Looking up strictly by (id, storeId) returned null in that case and the field
 * was silently written as empty. These helpers fall back to matching the same
 * label/name inside the target store, so the value lands on the right record
 * instead of being lost.
 *
 * NOTE: this file deliberately has no "use server" directive — it holds internal
 * helpers, not server actions, and must not be exposed as callable endpoints.
 */

export async function resolveOptionForStore(
  optionId: string,
  storeId: string,
  kinds: StoreOptionKind[],
  requireActive = true
) {
  if (!optionId) return null;

  const activeFilter = requireActive ? { isActive: true } : {};

  const direct = await prisma.storeOption.findFirst({
    where: { id: optionId, storeId, kind: { in: kinds }, ...activeFilter }
  });
  if (direct) return direct;

  const foreign = await prisma.storeOption.findUnique({
    where: { id: optionId },
    select: { label: true, kind: true }
  });
  if (!foreign || !kinds.includes(foreign.kind)) return null;

  return prisma.storeOption.findFirst({
    where: { storeId, kind: foreign.kind, label: foreign.label, ...activeFilter }
  });
}

export async function resolveLocationForStore(locationId: string, storeId: string) {
  if (!locationId) return null;

  const direct = await prisma.location.findFirst({
    where: { id: locationId, storeId, isActive: true }
  });
  if (direct) return direct;

  const foreign = await prisma.location.findUnique({
    where: { id: locationId },
    select: { name: true }
  });
  if (!foreign) return null;

  return prisma.location.findFirst({ where: { storeId, name: foreign.name, isActive: true } });
}

export async function resolveStaffForStore(staffMemberId: string, storeId: string) {
  if (!staffMemberId) return null;

  const direct = await prisma.staffMember.findFirst({
    where: { id: staffMemberId, storeId, isActive: true }
  });
  if (direct) return direct;

  const foreign = await prisma.staffMember.findUnique({
    where: { id: staffMemberId },
    select: { fullName: true }
  });
  if (!foreign) return null;

  return prisma.staffMember.findFirst({
    where: { storeId, fullName: foreign.fullName, isActive: true }
  });
}
