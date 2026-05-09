/**
 * Import staff name updates and consolidations from the filled-in spreadsheet.
 *
 * Usage (from live-app/):
 *   node scripts/import-staff.mjs [path-to-xlsx]
 *
 * Default input: staff-export.xlsx  (in live-app/ directory)
 */

import dotenv from "dotenv";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as XLSX from "xlsx";

// Load both .env and .env.local (Next.js style)
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
dotenv.config({ path: path.join(ROOT, ".env") });
dotenv.config({ path: path.join(ROOT, ".env.local"), override: true });

const { PrismaClient } = await import("@prisma/client");
const prisma = new PrismaClient();

const INPUT_PATH = process.argv[2]
  ? path.resolve(process.cwd(), process.argv[2])
  : path.join(ROOT, "staff-export.xlsx");

function normalize(value) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

const ROLE_MAP = {
  "stylist":    "STYLIST",
  "seamstress": "SEAMSTRESS",
  "front desk": "FRONT_DESK",
  "manager":    "MANAGER",
};

async function main() {
  console.log(`Reading: ${INPUT_PATH}`);
  const wb = XLSX.read(readFileSync(INPUT_PATH));
  const sheet = wb.Sheets["Staff Members"];

  if (!sheet) {
    throw new Error('Could not find "Staff Members" sheet in the workbook.');
  }

  /** @type {Array<{id:string, store:string, currentName:string, role:string, fullName:string, consolidateInto:string}>} */
  const rows = XLSX.utils
    .sheet_to_json(sheet, { header: 1 })
    .slice(1) // skip header
    .map((row) => ({
      id: String(row[0] ?? "").trim(),
      store: String(row[1] ?? "").trim(),
      currentName: String(row[2] ?? "").trim(),
      role: String(row[3] ?? "").trim(),
      fullName: String(row[4] ?? "").trim(),
      consolidateInto: String(row[5] ?? "").trim(),
    }))
    .filter((row) => row.id && row.currentName);

  let renames = 0;
  let roleChanges = 0;
  let consolidations = 0;
  let errors = 0;

  // ── Step 1: Apply renames and role changes first ──────────────────────────

  for (const row of rows) {
    const newFullName = row.fullName && row.fullName !== row.currentName ? row.fullName : null;
    const newRoleKey = row.role.toLowerCase();
    const newRole = ROLE_MAP[newRoleKey] ?? null;

    // Determine what changed
    const data = {};
    if (newFullName) {
      data.fullName = newFullName.trim().replace(/\s+/g, " ");
      data.normalizedFullName = normalize(newFullName);
    }
    if (newRole) {
      data.role = newRole;
    }

    if (Object.keys(data).length === 0) continue;

    try {
      await prisma.staffMember.update({ where: { id: row.id }, data });

      if (newFullName) {
        console.log(`  Renamed: "${row.currentName}" → "${data.fullName}"  [${row.store}]`);
        renames++;
      }
      if (newRole) {
        console.log(`  Role changed: "${row.currentName}" → ${data.role}  [${row.store}]`);
        roleChanges++;
      }
    } catch (err) {
      console.error(`  ✗ Update failed for "${row.currentName}" (${row.id}): ${err.message}`);
      errors++;
    }
  }

  // ── Step 2: Consolidations ────────────────────────────────────────────────

  for (const row of rows) {
    if (!row.consolidateInto) continue;

    // Find the "keep" staff member by name (search by fullName after renames applied)
    const keepCandidates = await prisma.staffMember.findMany({
      where: {
        isActive: true,
        OR: [
          { fullName: { equals: row.consolidateInto, mode: "insensitive" } },
          { normalizedFullName: normalize(row.consolidateInto) },
        ],
      },
    });

    if (keepCandidates.length === 0) {
      console.error(
        `  ✗ Cannot consolidate "${row.currentName}": no active staff member found matching "${row.consolidateInto}"`
      );
      errors++;
      continue;
    }

    if (keepCandidates.length > 1) {
      console.warn(
        `  ⚠ Multiple matches for "${row.consolidateInto}" — using first: ${keepCandidates[0].fullName} (${keepCandidates[0].id})`
      );
    }

    const keep = keepCandidates[0];

    if (keep.id === row.id) {
      console.warn(`  ⚠ Skipping: "${row.currentName}" consolidate target is itself`);
      continue;
    }

    try {
      // Move all appointments from remove → keep
      const updated = await prisma.appointment.updateMany({
        where: { assignedStaffMemberId: row.id },
        data: { assignedStaffMemberId: keep.id },
      });

      // Deactivate the duplicate
      await prisma.staffMember.update({
        where: { id: row.id },
        data: { isActive: false },
      });

      console.log(
        `  Consolidated: "${row.currentName}" → "${keep.fullName}"  (${updated.count} appointments moved)  [${row.store}]`
      );
      consolidations++;
    } catch (err) {
      console.error(`  ✗ Consolidation failed for "${row.currentName}" (${row.id}): ${err.message}`);
      errors++;
    }
  }

  // ── Summary ───────────────────────────────────────────────────────────────

  console.log("");
  console.log("─".repeat(50));
  console.log(`  Renames:        ${renames}`);
  console.log(`  Role changes:   ${roleChanges}`);
  console.log(`  Consolidations: ${consolidations}`);
  console.log(`  Errors:         ${errors}`);
  console.log("─".repeat(50));

  if (errors > 0) {
    console.log("\nSome rows had errors. Fix them and re-run — already-applied changes are safe to skip.");
  } else {
    console.log("\nDone! Push to GitHub to redeploy with the updated names.");
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
