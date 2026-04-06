# Impression Bridal Daily Log Live App

This folder is the production scaffold for taking the current prototype live with:

- `Next.js`
- `Netlify`
- `Supabase Auth`
- `Supabase Postgres`
- `Prisma`

## What Is Here

- [package.json](/Users/JustinYeh/Documents/Codex%20Building/live-app/package.json): app dependencies and scripts
- [netlify.toml](/Users/JustinYeh/Documents/Codex%20Building/live-app/netlify.toml): Netlify build config
- [.env.example](/Users/JustinYeh/Documents/Codex%20Building/live-app/.env.example): required environment variables
- [prisma/schema.prisma](/Users/JustinYeh/Documents/Codex%20Building/live-app/prisma/schema.prisma): production schema for stores, users, staff members, customers, appointments, and store-managed dropdowns
- [prisma/seed.mjs](/Users/JustinYeh/Documents/Codex%20Building/live-app/prisma/seed.mjs): starter seed for the four stores plus baseline dropdown values
- [supabase/rls.sql](/Users/JustinYeh/Documents/Codex%20Building/live-app/supabase/rls.sql): starter row-level security policies for store-scoped access

## Schema Decisions

The production schema is intentionally shaped around the workflow from the prototype:

- `Store`
  - the four real physical stores only: Curve by IB, Galleria, San Antonio, Atlanta
  - the combined `Galleria and Curve` view should stay an app-level reporting view, not a real database store row
- `User`
  - supports `USER`, `STYLIST`, `MANAGER`, and `ADMIN`
  - links to Supabase Auth through `authUserId`
  - can optionally be tied to one `StaffMember`
- `StaffMember`
  - holds both stylists and seamstresses via the `StaffRole` enum
  - this is the canonical people table for assignments and stylist logins
- `StoreOption`
  - one generic table for appointment types, walk-in types, lead sources, price points, sizes, and reason-did-not-buy values
  - this matches the `Settings > Dropdowns` direction from the prototype
- `Appointment`
  - stores snapshot labels like `appointmentTypeLabel`, `pricePointLabel`, and `reasonDidNotBuyLabel`
  - also keeps optional foreign keys back to the current store option row
  - this lets historical reporting stay accurate even if dropdown labels change later

## Current Status

The app is now much further along than the original scaffold:

- live Dashboard
- live Daily Log
- live Analytics
- live Stylists
- live Settings / dropdown management
- combined `Galleria and Curve` reporting/store view
- internal beta login with role/store routing

The main thing still pending before a true long-term production launch is replacing the temporary
internal-password login flow with full Supabase Auth user accounts.

## Recommended Launch Order

1. Install Node.js 20+ on this machine.
2. From `/Users/JustinYeh/Documents/Codex Building/live-app`, run `npm install`.
3. Create a Supabase project.
4. Copy `.env.example` to `.env.local` and fill in your Supabase values.
5. Run `npx prisma migrate dev --name init`.
6. Run `npm run prisma:seed`.
7. Apply [supabase/rls.sql](/Users/JustinYeh/Documents/Codex%20Building/live-app/supabase/rls.sql) in the Supabase SQL editor.
8. Import the live metadata and historical rows:
   - `npm run prisma:import:metadata`
   - `npm run prisma:import:appointments`
9. Run `npm run build` locally to verify the production build.
10. Connect the project to Netlify and set the same env vars there.
11. Deploy an internal beta first.

## Permission Model

- `USER`
  - Check in customers
  - Update current customers
  - Add and edit daily log entries
  - No analytics or stylist reporting
- `STYLIST`
  - Read only their own performance for their assigned store profile
  - No front-desk entry or dropdown management
- `MANAGER`
  - All front-desk permissions
  - View analytics and stylist reporting for their store
  - Edit store-level dropdowns, staff members, locations, and operational settings for their store
- `ADMIN`
  - All manager permissions
  - Switch stores
  - Manage users and stores across the business

## Immediate Next Build Step

The next implementation step is no longer the app shell. The highest-value next step is replacing
the temporary internal beta password flow with real Supabase Auth users:

1. create real `User` rows tied to `auth.users`
2. swap cookie-based demo login for Supabase session login
3. keep the existing role/store/stylist scoping logic
4. move manager/admin password checks onto real user records
5. deploy that auth-backed beta to Netlify

## Important Note

This folder is now a running live-app candidate, not just a scaffold. The older prototype still
exists in the root files for reference:

- [index.html](/Users/JustinYeh/Documents/Codex%20Building/index.html)
- [styles.css](/Users/JustinYeh/Documents/Codex%20Building/styles.css)
- [app.js](/Users/JustinYeh/Documents/Codex%20Building/app.js)

The remaining work is mostly:

- production auth/accounts
- final data verification
- Netlify/domain launch
