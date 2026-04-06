import "dotenv/config";

import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const { PrismaClient, StaffRole } = await import("@prisma/client");

const prisma = new PrismaClient();

const ROOT_DIR = path.resolve(process.cwd(), "..");
const IMPORTED_DATA_PATH = path.join(ROOT_DIR, "imported_data.js");
const CURVE_ROWS_PATH = path.join(ROOT_DIR, "imported_rows.json");
const GALLERIA_ROWS_PATH = path.join(ROOT_DIR, "imported_galleria_rows.json");
const ATLANTA_ROWS_PATH = path.join(ROOT_DIR, "imported_atlanta_rows.json");
const SAN_ANTONIO_ROWS_PATH = path.join(ROOT_DIR, "imported_san_antonio_rows.json");

const CURVE_DEFAULT_LOCATIONS = ["Front Desk", "Room 1", "Room 2", "Room 3", "Room 4", "Room 5", "Waiting"];

const STORE_SLUGS = {
  curve: "curve",
  galleria: "galleria",
  atlanta: "atlanta",
  "san-antonio": "san-antonio"
};

function normalize(value) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function uniqueClean(values) {
  return Array.from(
    new Map(
      values
        .filter((value) => typeof value === "string")
        .map((value) => value.trim())
        .filter(Boolean)
        .map((value) => [normalize(value), value.replace(/\s+/g, " ").trim()])
    ).values()
  ).sort((a, b) => a.localeCompare(b));
}

function loadImportedData() {
  const source = fs.readFileSync(IMPORTED_DATA_PATH, "utf8");
  const context = { window: {} };
  vm.createContext(context);
  vm.runInContext(source, context);
  return context.window;
}

function loadCurveMetadata() {
  const rows = JSON.parse(fs.readFileSync(CURVE_ROWS_PATH, "utf8"));

  return {
    stylists: uniqueClean(rows.map((row) => row.stylist)),
    seamstresses: uniqueClean(rows.map((row) => row.seamstress)),
    locations: uniqueClean([...CURVE_DEFAULT_LOCATIONS, ...rows.map((row) => row.location)])
  };
}

function loadStoreRowsMetadata(filePath) {
  const rows = JSON.parse(fs.readFileSync(filePath, "utf8"));

  return {
    stylists: uniqueClean(rows.map((row) => row.stylist)),
    seamstresses: uniqueClean(rows.map((row) => row.seamstress)),
    locations: uniqueClean(rows.map((row) => row.location))
  };
}

function mergeMetadata(...sources) {
  return {
    stylists: uniqueClean(sources.flatMap((source) => source?.stylists || [])),
    seamstresses: uniqueClean(sources.flatMap((source) => source?.seamstresses || [])),
    locations: uniqueClean(sources.flatMap((source) => source?.locations || []))
  };
}

async function upsertStaffMembers(storeId, names, role) {
  for (const fullName of names) {
    await prisma.staffMember.upsert({
      where: {
        storeId_role_normalizedFullName: {
          storeId,
          role,
          normalizedFullName: normalize(fullName)
        }
      },
      update: {
        fullName,
        isActive: true
      },
      create: {
        storeId,
        fullName,
        normalizedFullName: normalize(fullName),
        role,
        isActive: true
      }
    });
  }
}

async function upsertLocations(storeId, locations) {
  for (const name of locations) {
    await prisma.location.upsert({
      where: {
        storeId_normalizedName: {
          storeId,
          normalizedName: normalize(name)
        }
      },
      update: {
        name,
        isActive: true
      },
      create: {
        storeId,
        name,
        normalizedName: normalize(name),
        isActive: true
      }
    });
  }
}

async function importStoreMetadata() {
  const imported = loadImportedData();
  const curve = loadCurveMetadata();
  const galleriaRows = loadStoreRowsMetadata(GALLERIA_ROWS_PATH);
  const atlantaRows = loadStoreRowsMetadata(ATLANTA_ROWS_PATH);
  const sanAntonioRows = loadStoreRowsMetadata(SAN_ANTONIO_ROWS_PATH);
  const importedContexts = imported.IMPORTED_STORE_CONTEXTS || {};

  const sources = {
    curve,
    galleria: mergeMetadata(galleriaRows, importedContexts.galleria),
    atlanta: mergeMetadata(atlantaRows, importedContexts.atlanta),
    "san-antonio": mergeMetadata(sanAntonioRows, importedContexts["san-antonio"])
  };

  for (const [sourceKey, slug] of Object.entries(STORE_SLUGS)) {
    const store = await prisma.store.findUnique({ where: { slug } });

    if (!store) {
      console.warn(`Skipping ${slug}: store not found in database.`);
      continue;
    }

    const source = sources[sourceKey];
    await upsertStaffMembers(store.id, source.stylists, StaffRole.STYLIST);
    await upsertStaffMembers(store.id, source.seamstresses, StaffRole.SEAMSTRESS);
    await upsertLocations(store.id, source.locations);

    console.log(
      `Imported ${store.name}: ${source.stylists.length} stylists, ${source.seamstresses.length} seamstresses, ${source.locations.length} locations`
    );
  }
}

importStoreMetadata()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
