/**
 * BridalLive API Explorer
 *
 * Run this from the project root to inspect real API response shapes:
 *   node scripts/explore-bridallive-api.mjs
 *
 * Outputs to console AND writes a bridallive-api-shapes.json file
 * in this scripts/ directory so you can paste it back here.
 *
 * IMPORTANT: Delete this file and rotate your API key after use.
 */

import { writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const RETAILER_ID = process.env.BL_RETAILER_ID || "5b3d46a8";
const API_KEY = process.env.BL_API_KEY || "13192120dc53e83c";

// ─── Auth ─────────────────────────────────────────────────────────────────────

async function tryAuth(baseUrl, path, body, headers = {}) {
  const url = `${baseUrl}${path}`;
  console.log(`  Trying POST ${url}`);
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json",
      "User-Agent": "Mozilla/5.0",
      "Origin": "https://app.bridallive.com",
      "Referer": "https://app.bridallive.com/",
      "X-Requested-With": "XMLHttpRequest",
      ...headers
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  console.log(`  → ${res.status}: ${typeof data === "string" ? data.slice(0, 150) : JSON.stringify(data)}`);
  return { ok: res.ok, status: res.status, data };
}

async function getToken() {
  console.log("🔐 Attempting authentication with multiple endpoint patterns...\n");

  // Try multiple base URLs
  const BASES = [
    "https://api.bridallive.com/bl-server/api",
    "https://app.bridallive.com/bl-server/api",
    "https://www.bridallive.com/bl-server/api",
  ];
  const BASE = BASES[0];

  // Try JSON body with different field name casings
  const jsonAttempts = [
    { retailerId: RETAILER_ID, apiKey: API_KEY },
    { retailerid: RETAILER_ID, apikey: API_KEY },
    { RetailerId: RETAILER_ID, ApiKey: API_KEY },
    { retailerId: RETAILER_ID, apiToken: API_KEY },
    { retailerId: RETAILER_ID, token: API_KEY },
    { id: RETAILER_ID, key: API_KEY },
    { username: RETAILER_ID, password: API_KEY },
  ];

  for (const body of jsonAttempts) {
    const result = await tryAuth(BASE, "/apiLogin", body);
    if (result.ok) {
      console.log("\n✅ Auth succeeded!");
      console.log("Full response:", JSON.stringify(result.data, null, 2));
      globalThis.BASE_URL = BASE;
      return result.data;
    }
    console.log();
  }

  // Try form-encoded body
  console.log("  Trying form-encoded POST...");
  const formRes = await fetch(`${BASE}/apiLogin`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `retailerId=${RETAILER_ID}&apiKey=${API_KEY}`,
  });
  const formText = await formRes.text();
  console.log(`  → ${formRes.status}: ${formText.slice(0, 300)}`);
  if (formRes.ok) {
    globalThis.BASE_URL = BASE;
    try { return JSON.parse(formText); } catch { return formText; }
  }

  // Try query params
  console.log("\n  Trying query params...");
  const qpRes = await fetch(`${BASE}/apiLogin?retailerId=${RETAILER_ID}&apiKey=${API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  const qpText = await qpRes.text();
  console.log(`  → ${qpRes.status}: ${qpText.slice(0, 300)}`);
  if (qpRes.ok) {
    globalThis.BASE_URL = BASE;
    try { return JSON.parse(qpText); } catch { return qpText; }
  }

  // Try GET with query params
  console.log("\n  Trying GET with query params...");
  const getRes = await fetch(`${BASE}/apiLogin?retailerId=${RETAILER_ID}&apiKey=${API_KEY}`);
  const getText = await getRes.text();
  console.log(`  → ${getRes.status}: ${getText.slice(0, 300)}`);
  if (getRes.ok) {
    globalThis.BASE_URL = BASE;
    try { return JSON.parse(getText); } catch { return getText; }
  }

  // Try the other base URLs too
  for (const base of BASES.slice(1)) {
    const result = await tryAuth(base, "/apiLogin", { retailerId: RETAILER_ID, apiKey: API_KEY });
    if (result.ok) {
      globalThis.BASE_URL = base;
      return result.data;
    }
    console.log();
  }

  throw new Error(
    "\n\nAll auth attempts failed.\n\n" +
    "Most likely causes:\n" +
    "  1. IP allowlist — BridalLive may only allow calls from whitelisted server IPs.\n" +
    "     Your laptop's IP may not be on the list. Ask BridalLive support:\n" +
    "     'Does the API restrict calls to allowlisted IPs? How do I whitelist my IP?'\n\n" +
    "  2. Wrong credentials — Log into app.bridallive.com → Settings → Account → API tab\n" +
    "     and verify the exact Retailer ID and API Key (no extra spaces).\n\n" +
    "  3. API access not activated — Ask BridalLive to confirm API access is enabled.\n"
  );
}

// ─── Generic GET ──────────────────────────────────────────────────────────────

async function get(path, token, params = {}) {
  const url = new URL(`${globalThis.BASE_URL}${path}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  const res = await fetch(url.toString(), {
    headers: {
      "Content-Type": "application/json",
      token: token,
      retailerId: RETAILER_ID,
    },
  });

  const text = await res.text();
  try {
    return { status: res.status, ok: res.ok, data: JSON.parse(text) };
  } catch {
    return { status: res.status, ok: res.ok, data: text };
  }
}

// ─── Main exploration ─────────────────────────────────────────────────────────

async function explore() {
  const shapes = {};

  // 1. Auth
  const authData = await getToken();
  shapes.auth = authData;

  // Extract token — adjust field name if auth response is different
  const token =
    authData.token ||
    authData.authToken ||
    authData.access_token ||
    authData;

  if (typeof token !== "string") {
    console.error("⚠️  Could not find token in auth response. Full response:", authData);
    console.error("Update the token extraction logic in this script and re-run.");
    process.exit(1);
  }

  console.log(`\n🎟️  Token: ${token.slice(0, 20)}...`);

  // 2. Today's appointments
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const todayFormatted = today; // adjust if BridalLive expects MM/DD/YYYY

  console.log(`\n📅 Fetching appointments for ${today}...`);

  // Try common endpoint patterns
  const appointmentEndpoints = [
    { path: "/appointments", params: { date: todayFormatted } },
    { path: "/appointments", params: { startDate: todayFormatted, endDate: todayFormatted } },
    { path: "/appointment/list", params: { date: todayFormatted } },
    { path: "/appointments/list", params: { startDate: todayFormatted, endDate: todayFormatted } },
  ];

  for (const { path, params } of appointmentEndpoints) {
    const result = await get(path, token, params);
    console.log(`\n  GET ${path} ${JSON.stringify(params)} → ${result.status}`);
    if (result.ok) {
      shapes.appointments = result.data;
      console.log("  ✅ Success! First item sample:");
      const items = Array.isArray(result.data)
        ? result.data
        : result.data?.items || result.data?.appointments || result.data?.data || [];
      if (items.length > 0) {
        console.log(JSON.stringify(items[0], null, 2));
        shapes.appointmentSample = items[0];

        // 3. Single appointment detail
        const id = items[0].id || items[0].appointmentId || items[0].ID;
        if (id) {
          console.log(`\n🔍 Fetching single appointment (id: ${id})...`);
          const detail = await get(`/appointments/${id}`, token);
          console.log(`  GET /appointments/${id} → ${detail.status}`);
          if (detail.ok) {
            shapes.appointmentDetail = detail.data;
            console.log(JSON.stringify(detail.data, null, 2));
          }
        }
      } else {
        console.log("  (no appointments today — try a date with known bookings)");
      }
      break;
    } else {
      console.log(`  ❌ ${JSON.stringify(result.data)}`);
    }
  }

  // 4. Contacts endpoint
  console.log("\n👤 Fetching contacts sample...");
  const contactEndpoints = [
    "/contacts",
    "/contact/list",
    "/customers",
  ];
  for (const path of contactEndpoints) {
    const result = await get(path, token, { pageSize: 1 });
    console.log(`  GET ${path} → ${result.status}`);
    if (result.ok) {
      shapes.contactsSample = result.data;
      console.log(JSON.stringify(result.data, null, 2));
      break;
    }
  }

  // 5. Appointment types
  console.log("\n🏷️  Fetching appointment types...");
  const typeEndpoints = [
    "/appointmentTypes",
    "/appointment-types",
    "/appointmentType/list",
  ];
  for (const path of typeEndpoints) {
    const result = await get(path, token);
    console.log(`  GET ${path} → ${result.status}`);
    if (result.ok) {
      shapes.appointmentTypes = result.data;
      console.log(JSON.stringify(result.data, null, 2));
      break;
    }
  }

  // 6. Staff / associates
  console.log("\n👥 Fetching staff / associates...");
  const staffEndpoints = [
    "/employees",
    "/associates",
    "/staff",
    "/users",
  ];
  for (const path of staffEndpoints) {
    const result = await get(path, token);
    console.log(`  GET ${path} → ${result.status}`);
    if (result.ok) {
      shapes.staff = result.data;
      console.log(JSON.stringify(result.data, null, 2));
      break;
    }
  }

  // 7. Fitting rooms / locations
  console.log("\n🏠 Fetching fitting rooms...");
  const roomEndpoints = [
    "/fittingRooms",
    "/fitting-rooms",
    "/locations",
    "/rooms",
  ];
  for (const path of roomEndpoints) {
    const result = await get(path, token);
    console.log(`  GET ${path} → ${result.status}`);
    if (result.ok) {
      shapes.fittingRooms = result.data;
      console.log(JSON.stringify(result.data, null, 2));
      break;
    }
  }

  // Write output file
  const outPath = join(__dirname, "bridallive-api-shapes.json");
  writeFileSync(outPath, JSON.stringify(shapes, null, 2));
  console.log(`\n✅ Full output written to: scripts/bridallive-api-shapes.json`);
  console.log("Paste that file's contents back to continue building the integration.");
}

explore().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
