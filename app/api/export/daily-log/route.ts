import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";

import { getCurrentSession } from "@/lib/auth";
import { EXPORT_COLUMNS, getDailyLogExport } from "@/lib/export-data";
import { canViewStoreSlug } from "@/lib/store-views";
import { safeTimezone } from "@/lib/tz-utils";

export const dynamic = "force-dynamic";

/** Guard against a date typo pulling the entire table into memory. */
const MAX_RANGE_DAYS = 800;

function isValidDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

export async function GET(request: NextRequest) {
  const session = await getCurrentSession();

  // Export carries every guest name and comment, so it is held to the same bar
  // as the reporting pages: managers and admins only.
  if (!session.isAuthenticated) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  if (session.role !== "MANAGER" && session.role !== "ADMIN") {
    return NextResponse.json({ error: "Manager or admin access is required." }, { status: 403 });
  }

  const params = request.nextUrl.searchParams;
  const storeSlug = params.get("store") || session.storeSlug;
  const from = params.get("from") || "";
  const to = params.get("to") || "";

  if (session.role !== "ADMIN" && !canViewStoreSlug(session.storeSlug, storeSlug)) {
    return NextResponse.json({ error: "Not authorized to export this store." }, { status: 403 });
  }
  if (!isValidDate(from) || !isValidDate(to)) {
    return NextResponse.json({ error: "Provide a valid from and to date." }, { status: 400 });
  }
  if (from > to) {
    return NextResponse.json({ error: "The start date must come before the end date." }, { status: 400 });
  }

  const spanDays = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000;
  if (spanDays > MAX_RANGE_DAYS) {
    return NextResponse.json(
      { error: `That range is longer than ${MAX_RANGE_DAYS} days. Narrow it and try again.` },
      { status: 400 }
    );
  }

  const timezone = safeTimezone(request.cookies.get("tz")?.value);
  const result = await getDailyLogExport(storeSlug, from, to, timezone);

  if (!result) {
    return NextResponse.json({ error: "Store could not be found." }, { status: 404 });
  }

  // Always write the header row, so an empty range still produces a readable file
  // rather than a blank one that looks broken.
  const sheet = XLSX.utils.json_to_sheet(result.rows, { header: [...EXPORT_COLUMNS] });
  sheet["!cols"] = EXPORT_COLUMNS.map((column) => ({
    wch: column === "Comments" ? 60 : column === "Guest Name" ? 24 : Math.max(12, column.length + 2)
  }));
  sheet["!autofilter"] = { ref: XLSX.utils.encode_range(XLSX.utils.decode_range(sheet["!ref"] || "A1")) };

  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "Daily Log");

  const buffer: Buffer = XLSX.write(book, { type: "buffer", bookType: "xlsx" });
  const safeStore = result.storeName.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "");
  const filename = `daily-log-${safeStore}-${from}-to-${to}.xlsx`;

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store"
    }
  });
}
