import { StaffRole, StoreOptionKind } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export const COMBINED_STORE_SLUG = "galleria-curve";
export const COMBINED_STORE_NAME = "Galleria and Curve";

const COMBINED_SOURCE_SLUGS = ["galleria", "curve"] as const;

type StoreChoice = {
  id: string;
  slug: string;
  name: string;
};

export type StoreChoiceWithStylists = StoreChoice & {
  stylists: string[];
};

type StoreViewOption = {
  id: string;
  kind: StoreOptionKind;
  label: string;
};

type StoreViewStaffMember = {
  id: string;
  fullName: string;
  role: StaffRole;
};

type StoreViewLocation = {
  id: string;
  name: string;
};

export type StoreViewStore = {
  id: string;
  slug: string;
  name: string;
  options: StoreViewOption[];
  staffMembers: StoreViewStaffMember[];
  locations: StoreViewLocation[];
};

export type StoreViewShell = {
  store: StoreViewStore;
  stores: StoreChoice[];
  storeIds: string[];
  isVirtualStore: boolean;
  sourceStores: StoreViewStore[];
};

function normalizeKey(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function appendCombinedStore(stores: StoreChoice[]) {
  if (stores.some((store) => store.slug === COMBINED_STORE_SLUG)) {
    return stores;
  }

  return [...stores, { id: COMBINED_STORE_SLUG, slug: COMBINED_STORE_SLUG, name: COMBINED_STORE_NAME }];
}

function dedupeOptions(stores: StoreViewStore[]) {
  const seen = new Set<string>();
  const merged: StoreViewOption[] = [];

  stores.forEach((store) => {
    store.options.forEach((option) => {
      const key = `${option.kind}:${normalizeKey(option.label)}`;
      if (seen.has(key)) return;
      seen.add(key);
      merged.push(option);
    });
  });

  return merged.sort(
    (a, b) => a.kind.localeCompare(b.kind) || a.label.localeCompare(b.label)
  );
}

function dedupeStaffMembers(stores: StoreViewStore[]) {
  const seen = new Set<string>();
  const merged: StoreViewStaffMember[] = [];

  stores.forEach((store) => {
    store.staffMembers.forEach((staffMember) => {
      const key = `${staffMember.role}:${normalizeKey(staffMember.fullName)}`;
      if (seen.has(key)) return;
      seen.add(key);
      merged.push(staffMember);
    });
  });

  return merged.sort(
    (a, b) => a.role.localeCompare(b.role) || a.fullName.localeCompare(b.fullName)
  );
}

function dedupeLocations(stores: StoreViewStore[]) {
  const seen = new Set<string>();
  const merged: StoreViewLocation[] = [];

  stores.forEach((store) => {
    store.locations.forEach((location) => {
      const key = normalizeKey(location.name);
      if (seen.has(key)) return;
      seen.add(key);
      merged.push(location);
    });
  });

  return merged.sort((a, b) => a.name.localeCompare(b.name));
}

export function isCombinedStoreSlug(storeSlug: string) {
  return storeSlug === COMBINED_STORE_SLUG;
}

export async function getAllStoreChoices() {
  const stores = await prisma.store.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
    select: {
      id: true,
      slug: true,
      name: true
    }
  });

  return appendCombinedStore(stores);
}

export async function getAllStoreChoicesWithStylists(): Promise<StoreChoiceWithStylists[]> {
  const stores = await prisma.store.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
    select: {
      id: true,
      slug: true,
      name: true,
      staffMembers: {
        where: {
          isActive: true,
          role: StaffRole.STYLIST
        },
        orderBy: { fullName: "asc" },
        select: {
          fullName: true
        }
      }
    }
  });

  const baseStores = stores.map((store) => ({
    id: store.id,
    slug: store.slug,
    name: store.name,
    stylists: store.staffMembers.map((staffMember) => staffMember.fullName)
  }));

  const galleriaAndCurve = baseStores.filter((store) => COMBINED_SOURCE_SLUGS.includes(store.slug as (typeof COMBINED_SOURCE_SLUGS)[number]));
  const combinedStylists = Array.from(
    new Set(galleriaAndCurve.flatMap((store) => store.stylists.map((stylist) => stylist.trim())))
  ).sort((a, b) => a.localeCompare(b));

  return [
    ...baseStores,
    {
      id: COMBINED_STORE_SLUG,
      slug: COMBINED_STORE_SLUG,
      name: COMBINED_STORE_NAME,
      stylists: combinedStylists
    }
  ];
}

export async function getStoreViewShell(storeSlug: string): Promise<StoreViewShell | null> {
  const stores = await getAllStoreChoices();

  const sourceSlugs = isCombinedStoreSlug(storeSlug) ? COMBINED_SOURCE_SLUGS : [storeSlug];
  const sourceStores = await prisma.store.findMany({
    where: {
      slug: {
        in: [...sourceSlugs]
      }
    },
    orderBy: { name: "asc" },
    select: {
      id: true,
      slug: true,
      name: true,
      options: {
        where: { isActive: true },
        orderBy: [{ kind: "asc" }, { sortOrder: "asc" }, { label: "asc" }],
        select: {
          id: true,
          kind: true,
          label: true
        }
      },
      staffMembers: {
        where: { isActive: true },
        orderBy: [{ role: "asc" }, { fullName: "asc" }],
        select: {
          id: true,
          fullName: true,
          role: true
        }
      },
      locations: {
        where: { isActive: true },
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true
        }
      }
    }
  });

  if (!sourceStores.length) {
    return null;
  }

  if (!isCombinedStoreSlug(storeSlug)) {
    return {
      store: sourceStores[0],
      stores,
      storeIds: [sourceStores[0].id],
      isVirtualStore: false,
      sourceStores
    };
  }

  return {
    store: {
      id: COMBINED_STORE_SLUG,
      slug: COMBINED_STORE_SLUG,
      name: COMBINED_STORE_NAME,
      options: dedupeOptions(sourceStores),
      staffMembers: dedupeStaffMembers(sourceStores),
      locations: dedupeLocations(sourceStores)
    },
    stores,
    storeIds: sourceStores.map((store) => store.id),
    isVirtualStore: true,
    sourceStores
  };
}
