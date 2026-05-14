/**
 * Export all active staff members across all stores to an Excel workbook.
 *
 * Usage (from live-app/):
 *   npm install xlsx          ← one-time
 *   node scripts/export-staff.mjs
 *
 * Outputs: staff-export.xlsx  (in live-app/ directory)
 */

import dotenv from "dotenv";
import { writeFileSync } from "node:fs";
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

const OUTPUT_PATH = path.join(ROOT, "staff-export.xlsx");

const ROLE_LABELS = {
  STYLIST: "Stylist",
  SEAMSTRESS: "Seamstress",
  FRONT_DESK: "Front Desk",
  MANAGER: "Manager",
  RUNNER: "Runner",
};

async function main() {
  const stores = await prisma.store.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
    include: {
      staffMembers: {
        where: { isActive: true },
        orderBy: [{ role: "asc" }, { fullName: "asc" }],
      },
    },
  });

  // ── Sheet 1: Staff Members ────────────────────────────────────────────────

  const staffRows = [
    [
      "ID (do not edit)",
      "Store",
      "Current Name",
      "Role",
      "Full Name (add last name here)",
      "Consolidate Into (full name of person to merge into, leave blank to keep)",
    ],
  ];

  for (const store of stores) {
    for (const member of store.staffMembers) {
      staffRows.push([
        member.id,
        store.name,
        member.fullName,
        ROLE_LABELS[member.role] ?? member.role,
        "", // user fills in
        "", // user fills in if duplicate
      ]);
    }
  }

  // ── Sheet 2: Instructions ─────────────────────────────────────────────────

  const instructionRows = [
    ["How to use this spreadsheet"],
    [""],
    ["ADDING LAST NAMES"],
    [
      "Fill in the 'Full Name' column with the employee's full name (e.g. 'Cristina Martin').",
    ],
    [
      "Leave it blank for any employee you do not want to change.",
    ],
    [""],
    ["CONSOLIDATING DUPLICATES"],
    [
      "If two rows are the same person (e.g. 'Micheal' is a misspelling of 'Michael'),",
    ],
    [
      "fill in the 'Consolidate Into' column for the row you want to REMOVE with the exact",
    ],
    [
      "current name (or new full name) of the person you want to KEEP.",
    ],
    ["Example: Row for 'Micheal' → Consolidate Into = 'Michael Smith'"],
    [
      "All appointments assigned to 'Micheal' will be moved to 'Michael Smith', then",
    ],
    ["'Micheal' will be deactivated."],
    [""],
    ["RUNNING THE IMPORT"],
    ["Once you have filled in the spreadsheet, run:"],
    ["  node scripts/import-staff.mjs"],
    ["from the live-app/ directory."],
  ];

  // ── Build workbook ────────────────────────────────────────────────────────

  const wb = XLSX.utils.book_new();

  const staffSheet = XLSX.utils.aoa_to_sheet(staffRows);

  // Column widths
  staffSheet["!cols"] = [
    { wch: 30 }, // ID
    { wch: 22 }, // Store
    { wch: 22 }, // Current Name
    { wch: 14 }, // Role
    { wch: 30 }, // Full Name
    { wch: 36 }, // Consolidate Into
  ];

  // Freeze header row
  staffSheet["!freeze"] = { xSplit: 0, ySplit: 1 };

  XLSX.utils.book_append_sheet(wb, staffSheet, "Staff Members");

  const instrSheet = XLSX.utils.aoa_to_sheet(instructionRows);
  instrSheet["!cols"] = [{ wch: 80 }];
  XLSX.utils.book_append_sheet(wb, instrSheet, "How to Use");

  writeFileSync(OUTPUT_PATH, XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));

  const totalStaff = stores.reduce((sum, s) => sum + s.staffMembers.length, 0);
  console.log(`✓ Exported ${totalStaff} staff members across ${stores.length} stores`);
  console.log(`  → ${OUTPUT_PATH}`);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
