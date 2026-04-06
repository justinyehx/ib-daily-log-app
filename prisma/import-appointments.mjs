import "dotenv/config";

import fs from "node:fs";
import path from "node:path";

const {
  PrismaClient,
  Prisma,
  AppointmentStatus,
  StaffRole,
  StoreOptionKind,
  VisitType
} = await import("@prisma/client");

let prisma = new PrismaClient();

const ROOT_DIR = path.resolve(process.cwd(), "..");

const IMPORT_FILES = {
  curve: path.join(ROOT_DIR, "imported_rows.json"),
  galleria: path.join(ROOT_DIR, "imported_galleria_rows.json"),
  atlanta: path.join(ROOT_DIR, "imported_atlanta_rows.json"),
  "san-antonio": path.join(ROOT_DIR, "imported_san_antonio_rows.json")
};

const requestedStore = process.argv
  .slice(2)
  .find((arg) => arg.startsWith("--store="))
  ?.split("=")[1];

const APPOINTMENT_TYPE_LABELS = {
  NB: "New Bride",
  CB: "Comeback Bride",
  DI: "Destination Bride",
  NBM: "New Bridesmaid",
  MOB: "Mother of Bride",
  SO: "Special Occasion",
  ACC: "Accessories",
  PRES: "Presentation",
  "P/U": "Pickup",
  "ALT 1": "Alterations 1",
  "ALT (CUST)": "Alteration Custom",
  "ALT 2": "Alteration 2",
  "ALT 3": "Alteration 3",
  PO: "Phone order",
  PAY: "Pay",
  OTHER: "Other",
  "NB - No Try On": "New Bride - No Try On",
  "SO - No Try On": "Special Occasion - No Try On",
  "CB - Same Day": "Comeback Bride - Same Day"
};

function normalize(value) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function asBoolean(value) {
  if (typeof value !== "string") return null;
  if (value === "Yes") return true;
  if (value === "No") return false;
  return null;
}

function resolveStatus(value) {
  if (value === "Waiting") return AppointmentStatus.WAITING;
  if (value === "Active") return AppointmentStatus.ACTIVE;
  if (value === "Cancelled") return AppointmentStatus.CANCELLED;
  return AppointmentStatus.COMPLETE;
}

function parseDateOnly(value) {
  if (!value) return null;
  return new Date(`${value}T00:00:00`);
}

function parseDateTime(dateValue, timeValue) {
  if (!dateValue || !timeValue) return null;
  return new Date(`${dateValue}T${timeValue}:00`);
}

function resolveAppointmentTypeLabel(value) {
  if (!value) return "";
  return APPOINTMENT_TYPE_LABELS[value] || value;
}

function inferStaffRole(assignmentName, seamstressName, appointmentTypeLabel) {
  if (seamstressName) return StaffRole.SEAMSTRESS;
  if (!assignmentName) return StaffRole.STYLIST;
  if (appointmentTypeLabel.toLowerCase().includes("alteration")) {
    return StaffRole.SEAMSTRESS;
  }
  return StaffRole.STYLIST;
}

function shouldReconnect(error) {
  if (!(error instanceof Error)) return false;

  if (
    error instanceof Prisma.PrismaClientInitializationError ||
    error instanceof Prisma.PrismaClientRustPanicError ||
    error instanceof Prisma.PrismaClientUnknownRequestError
  ) {
    return true;
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return ["P1001", "P1017"].includes(error.code);
  }

  return false;
}

async function reconnectPrisma() {
  try {
    await prisma.$disconnect();
  } catch {}

  prisma = new PrismaClient();
}

async function withRetry(fn, label, retries = 3) {
  let attempt = 0;

  while (attempt < retries) {
    try {
      return await fn();
    } catch (error) {
      attempt += 1;

      if (!shouldReconnect(error) || attempt >= retries) {
        throw error;
      }

      console.warn(`${label} failed on attempt ${attempt}. Reconnecting and retrying...`);
      await reconnectPrisma();
    }
  }
}

async function loadStoreContext(storeSlug) {
  const store = await withRetry(
    () =>
      prisma.store.findUnique({
        where: { slug: storeSlug },
        include: {
          staffMembers: true,
          locations: true,
          options: true
        }
      }),
    `loadStoreContext(${storeSlug})`
  );

  if (!store) {
    throw new Error(`Store not found for slug: ${storeSlug}`);
  }

  const staffMap = new Map();
  for (const staffMember of store.staffMembers) {
    staffMap.set(`${staffMember.role}:${normalize(staffMember.fullName)}`, staffMember);
  }

  const locationMap = new Map();
  for (const location of store.locations) {
    locationMap.set(normalize(location.name), location);
  }

  const optionMap = new Map();
  for (const option of store.options) {
    optionMap.set(`${option.kind}:${normalize(option.label)}`, option);
  }

  return { store, staffMap, locationMap, optionMap };
}

async function findOrCreateCustomer(storeId, fullName, cache) {
  const normalized = normalize(fullName);
  const cacheKey = `${storeId}:${normalized}`;

  if (cache.has(cacheKey)) {
    return cache.get(cacheKey);
  }

  let customer = await withRetry(
    () =>
      prisma.customer.findFirst({
        where: {
          storeId,
          normalizedFullName: normalized
        },
        orderBy: {
          updatedAt: "desc"
        }
      }),
    `findCustomer(${fullName})`
  );

  if (!customer) {
    customer = await withRetry(
      () =>
        prisma.customer.create({
          data: {
            storeId,
            fullName,
            normalizedFullName: normalized
          }
        }),
      `createCustomer(${fullName})`
    );
  }

  cache.set(cacheKey, customer);
  return customer;
}

async function findOrCreateStaffMember(storeId, fullName, role, cache) {
  const normalizedFullName = normalize(fullName);
  const cacheKey = `${storeId}:${role}:${normalizedFullName}`;

  if (cache.has(cacheKey)) {
    return cache.get(cacheKey);
  }

  const staffMember = await withRetry(
    () =>
      prisma.staffMember.upsert({
        where: {
          storeId_role_normalizedFullName: {
            storeId,
            role,
            normalizedFullName
          }
        },
        update: {
          fullName,
          isActive: true
        },
        create: {
          storeId,
          role,
          fullName,
          normalizedFullName,
          isActive: true
        }
      }),
    `upsertStaffMember(${fullName})`
  );

  cache.set(cacheKey, staffMember);
  return staffMember;
}

async function findExistingAppointment(storeId, customerId, appointmentDate, timeIn, appointmentTypeLabel) {
  return withRetry(
    () =>
      prisma.appointment.findFirst({
        where: {
          storeId,
          customerId,
          appointmentDate,
          timeIn,
          appointmentTypeLabel
        },
        select: {
          id: true,
          assignedStaffMemberId: true,
          locationId: true,
          appointmentTypeOptionId: true,
          leadSourceOptionId: true,
          leadSourceLabel: true,
          pricePointOptionId: true,
          pricePointLabel: true,
          sizeOptionId: true,
          sizeLabel: true,
          reasonDidNotBuyOptionId: true,
          reasonDidNotBuyLabel: true,
          cbAppointmentScheduled: true,
          cbAppointmentAt: true,
          purchased: true,
          otherPurchase: true,
          status: true,
          comments: true,
          checkedOutAt: true
        }
      }),
    `findAppointment(${customerId}:${appointmentTypeLabel}:${timeIn.toISOString()})`
  );
}

async function updateExistingAppointmentIfNeeded(existing, updateData, label) {
  const patch = {};

  Object.entries(updateData).forEach(([key, value]) => {
    if (value === undefined) {
      return;
    }

    const current = existing[key];

    if (current === null || current === "" || typeof current === "undefined") {
      if (value !== null && value !== "") {
        patch[key] = value;
      }
      return;
    }

    if (key === "cbAppointmentScheduled" && current === false && value === true) {
      patch[key] = value;
      return;
    }

    if (key === "status" && current === AppointmentStatus.COMPLETE && value !== AppointmentStatus.COMPLETE) {
      return;
    }

    if (key === "comments" && typeof current === "string" && current.trim() && typeof value === "string" && value.trim()) {
      return;
    }
  });

  if (!Object.keys(patch).length) {
    return false;
  }

  await withRetry(
    () =>
      prisma.appointment.update({
        where: { id: existing.id },
        data: patch
      }),
    label
  );

  return true;
}

async function importStoreAppointments(storeSlug, filePath) {
  const rows = JSON.parse(fs.readFileSync(filePath, "utf8"));
  const { store, staffMap, locationMap, optionMap } = await loadStoreContext(storeSlug);
  const customerCache = new Map();
  const staffCache = new Map();

  let createdCount = 0;
  let skippedCount = 0;
  let updatedCount = 0;
  let processedCount = 0;

  console.log(`Starting ${store.name}: ${rows.length} rows to process`);

  for (const row of rows) {
    processedCount += 1;

    if (processedCount % 100 === 0) {
      console.log(
        `  ${store.name}: processed ${processedCount}/${rows.length} rows (${createdCount} created, ${skippedCount} skipped)`
      );
    }

    const appointmentDate = parseDateOnly(row.date);
    const timeIn = parseDateTime(row.date, row.timeIn);
    const timeOut = parseDateTime(row.date, row.timeOut);
    const wearDate = parseDateOnly(row.wearDate);
    const appointmentTypeLabel = resolveAppointmentTypeLabel(row.appointmentType);
    const visitType = row.visitMode === "walkIn" ? VisitType.WALK_IN : VisitType.APPOINTMENT;

    if (!row.guestName || !appointmentDate || !timeIn || !appointmentTypeLabel) {
      skippedCount += 1;
      continue;
    }

    const customer = await findOrCreateCustomer(store.id, row.guestName, customerCache);

    const assignmentRole = inferStaffRole(
      row.seamstress || row.stylist || "",
      row.seamstress || "",
      appointmentTypeLabel
    );
    const assignmentName = row.seamstress || row.stylist || "";
    let assignedStaffMember = assignmentName
      ? staffMap.get(`${assignmentRole}:${normalize(assignmentName)}`) || null
      : null;
    if (!assignedStaffMember && assignmentName) {
      assignedStaffMember = await findOrCreateStaffMember(store.id, assignmentName, assignmentRole, staffCache);
      staffMap.set(`${assignmentRole}:${normalize(assignmentName)}`, assignedStaffMember);
    }
    const location = row.location ? locationMap.get(normalize(row.location)) || null : null;
    const appointmentTypeOption = optionMap.get(
      `${visitType === VisitType.WALK_IN ? StoreOptionKind.WALK_IN_TYPE : StoreOptionKind.APPOINTMENT_TYPE}:${normalize(appointmentTypeLabel)}`
    );
    const leadSourceOption = row.heardAbout
      ? optionMap.get(`${StoreOptionKind.LEAD_SOURCE}:${normalize(row.heardAbout)}`) || null
      : null;
    const pricePointOption = row.pricePoint
      ? optionMap.get(`${StoreOptionKind.PRICE_POINT}:${normalize(row.pricePoint)}`) || null
      : null;
    const sizeOption = row.size ? optionMap.get(`${StoreOptionKind.SIZE}:${normalize(row.size)}`) || null : null;
    const reasonDidNotBuyOption = row.reasonDidNotBuy
      ? optionMap.get(`${StoreOptionKind.REASON_DID_NOT_BUY}:${normalize(row.reasonDidNotBuy)}`) || null
      : null;
    const cbAppointmentAt = row.cbAppt && row.cbAppt !== "No" && row.cbAppt !== "Yes" ? new Date(row.cbAppt) : null;
    const purchased = asBoolean(row.purchased);
    const otherPurchase = asBoolean(row.otherPurchase);
    const status = resolveStatus(row.status);
    const comments = row.comments || null;
    const checkedOutAt = timeOut;

    const existing = await findExistingAppointment(store.id, customer.id, appointmentDate, timeIn, appointmentTypeLabel);

    if (existing) {
      const wasUpdated = await updateExistingAppointmentIfNeeded(
        existing,
        {
          assignedStaffMemberId: assignedStaffMember?.id || null,
          locationId: location?.id || null,
          appointmentTypeOptionId: appointmentTypeOption?.id || null,
          leadSourceOptionId: leadSourceOption?.id || null,
          leadSourceLabel: row.heardAbout || null,
          pricePointOptionId: pricePointOption?.id || null,
          pricePointLabel: row.pricePoint || null,
          sizeOptionId: sizeOption?.id || null,
          sizeLabel: row.size || null,
          reasonDidNotBuyOptionId: reasonDidNotBuyOption?.id || null,
          reasonDidNotBuyLabel: row.reasonDidNotBuy || null,
          cbAppointmentScheduled: Boolean(row.cbAppt && row.cbAppt !== "No"),
          cbAppointmentAt,
          purchased,
          otherPurchase,
          status,
          comments,
          checkedOutAt
        },
        `updateAppointment(${row.guestName}:${appointmentTypeLabel}:${row.date}:${row.timeIn})`
      );

      if (wasUpdated) {
        updatedCount += 1;
      } else {
        skippedCount += 1;
      }

      continue;
    }

    await withRetry(
      () =>
        prisma.appointment.create({
          data: {
            storeId: store.id,
            customerId: customer.id,
            assignedStaffMemberId: assignedStaffMember?.id || null,
            locationId: location?.id || null,
            appointmentDate,
            timeIn,
            timeOut,
            wearDate,
            visitType,
            appointmentTypeOptionId: appointmentTypeOption?.id || null,
            appointmentTypeLabel,
            leadSourceOptionId: leadSourceOption?.id || null,
            leadSourceLabel: row.heardAbout || null,
            pricePointOptionId: pricePointOption?.id || null,
            pricePointLabel: row.pricePoint || null,
            sizeOptionId: sizeOption?.id || null,
            sizeLabel: row.size || null,
            reasonDidNotBuyOptionId: reasonDidNotBuyOption?.id || null,
            reasonDidNotBuyLabel: row.reasonDidNotBuy || null,
            cbAppointmentScheduled: Boolean(row.cbAppt && row.cbAppt !== "No"),
            cbAppointmentAt,
            purchased,
            otherPurchase,
            status,
            comments,
            managerApprovalRequired:
              appointmentTypeLabel === "New Bride - No Try On" ||
              appointmentTypeLabel === "Special Occasion - No Try On",
            checkedOutAt
          }
        }),
      `createAppointment(${row.guestName}:${appointmentTypeLabel}:${row.date}:${row.timeIn})`
    );

    createdCount += 1;

    if (createdCount > 0 && createdCount % 250 === 0) {
      console.log(`  ${store.name}: ${createdCount} appointments imported so far...`);
      await reconnectPrisma();
    }
  }

  console.log(
    `Imported ${store.name}: created ${createdCount} appointments, updated ${updatedCount} appointments, skipped ${skippedCount} existing/incomplete rows`
  );
}

async function main() {
  const selectedEntries = requestedStore
    ? Object.entries(IMPORT_FILES).filter(([slug]) => slug === requestedStore)
    : Object.entries(IMPORT_FILES);

  if (!selectedEntries.length) {
    throw new Error(
      `Unknown store "${requestedStore}". Valid options are: ${Object.keys(IMPORT_FILES).join(", ")}`
    );
  }

  for (const [slug, filePath] of selectedEntries) {
    await importStoreAppointments(slug, filePath);
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
