# Deploy Checklist

## Before Netlify

1. Confirm `.env.local` works locally.
2. Run:
   - `npm run build`
3. Confirm historical data is imported:
   - `npm run prisma:import:metadata`
   - `npm run prisma:import:appointments`
4. Sanity-check these routes locally:
   - `/login`
   - `/dashboard`
   - `/daily-log`
   - `/analytics`
   - `/stylists`
   - `/settings`
   - `/admin-view`

## Netlify Environment Variables

Add these in Netlify:

- `DATABASE_URL`
- `DIRECT_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `APP_STORE_DEFAULT`

## First Internal Beta Launch

1. Deploy from the `live-app` folder.
2. Open the deployed site.
3. Verify login works for:
   - `User`
   - `Stylist`
   - `Manager`
   - `Admin`
4. Verify store switching as `Admin`.
5. Verify `Galleria and Curve` combined reporting.
6. Verify one full workflow:
   - check in
   - mark waiting
   - mark active
   - check out
   - confirm the row appears in Daily Log

## After Internal Beta

The next production-hardening step is replacing the temporary internal-password login flow with
real Supabase Auth users and permanent passwords.
