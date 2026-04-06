import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const STORES = [
  { slug: "curve", name: "Curve by IB" },
  { slug: "galleria", name: "Galleria" },
  { slug: "san-antonio", name: "San Antonio" },
  { slug: "atlanta", name: "Atlanta" }
];

const DEFAULT_LOCATIONS = [
  "Front Desk",
  "Room 1",
  "Room 2",
  "Room 3",
  "Room 4",
  "Room 5",
  "Waiting"
];

const DEFAULT_APPOINTMENT_TYPES = [
  "New Bride",
  "Comeback Bride",
  "Destination Bride",
  "New Bridesmaid",
  "Mother of Bride",
  "Special Occasion",
  "Accessories",
  "Presentation",
  "Pickup",
  "Alterations 1",
  "Alteration Custom",
  "Alteration 2",
  "Alteration 3",
  "Phone order",
  "Pay",
  "Other",
  "New Bride - No Try On",
  "Special Occasion - No Try On",
  "Comeback Bride - Same Day"
];

const DEFAULT_WALK_IN_TYPES = [
  "New Bride",
  "Comeback Bride",
  "Destination Bride",
  "New Bridesmaid",
  "Mother of Bride",
  "Special Occasion",
  "Accessories",
  "Other",
  "New Bride - No Try On",
  "Special Occasion - No Try On",
  "Comeback Bride - Same Day"
];

const DEFAULT_LEAD_SOURCES = [
  "Google",
  "Facebook",
  "Instagram",
  "TikTok",
  "Internet-other",
  "Referral",
  "Catalog",
  "Magazine",
  "Drive By",
  "Show",
  "Previous Purchase",
  "Comeback",
  "Email Blast",
  "Text Blast",
  "Other"
];

const DEFAULT_PRICE_POINTS = [
  "0-500",
  "501-1000",
  "1001-1500",
  "1501-2000",
  "2001-2500",
  "2501-3000",
  "3001-3500",
  "3501-4000",
  "4001+"
];

const DEFAULT_SIZES = [
  "Size 00",
  "Size 0",
  "Size 2",
  "Size 4",
  "Size 6",
  "Size 8",
  "Size 10",
  "Size 12",
  "Size 14",
  "Size 16",
  "Size 18",
  "Size 20",
  "Size 22",
  "Size 24",
  "Size 26",
  "Size 28",
  "Size 30"
];

const DEFAULT_REASON_DID_NOT_BUY_OPTIONS = [
  "Unsure, wants to think about it",
  "Wants to go to another appointment",
  "No money",
  "Needs someone else to be at the appointment",
  "Did not see anything she liked",
  "Found another dress",
  "Not ready to commit",
  "Needs to speak with person paying",
  "Other"
];

function normalize(value) {
  return value.trim().toLowerCase();
}

async function seedStoreOptions(storeId, kind, labels) {
  for (const [index, label] of labels.entries()) {
    await prisma.storeOption.upsert({
      where: {
        storeId_kind_normalizedLabel: {
          storeId,
          kind,
          normalizedLabel: normalize(label)
        }
      },
      update: {
        label,
        sortOrder: index,
        isActive: true
      },
      create: {
        storeId,
        kind,
        label,
        normalizedLabel: normalize(label),
        sortOrder: index,
        isActive: true
      }
    });
  }
}

async function main() {
  for (const [index, storeConfig] of STORES.entries()) {
    const store = await prisma.store.upsert({
      where: { slug: storeConfig.slug },
      update: {
        name: storeConfig.name,
        isActive: true
      },
      create: {
        slug: storeConfig.slug,
        name: storeConfig.name,
        isActive: true
      }
    });

    for (const [locationIndex, locationName] of DEFAULT_LOCATIONS.entries()) {
      await prisma.location.upsert({
        where: {
          storeId_normalizedName: {
            storeId: store.id,
            normalizedName: normalize(locationName)
          }
        },
        update: {
          name: locationName,
          isActive: true
        },
        create: {
          storeId: store.id,
          name: locationName,
          normalizedName: normalize(locationName),
          isActive: true
        }
      });
    }

    await seedStoreOptions(store.id, "APPOINTMENT_TYPE", DEFAULT_APPOINTMENT_TYPES);
    await seedStoreOptions(store.id, "WALK_IN_TYPE", DEFAULT_WALK_IN_TYPES);
    await seedStoreOptions(store.id, "LEAD_SOURCE", DEFAULT_LEAD_SOURCES);
    await seedStoreOptions(store.id, "PRICE_POINT", DEFAULT_PRICE_POINTS);
    await seedStoreOptions(store.id, "SIZE", DEFAULT_SIZES);
    await seedStoreOptions(store.id, "REASON_DID_NOT_BUY", DEFAULT_REASON_DID_NOT_BUY_OPTIONS);

    console.log(`Seeded ${store.name} (${index + 1}/${STORES.length})`);
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
