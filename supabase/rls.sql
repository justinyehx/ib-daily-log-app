-- Impression Bridal Daily Log starter RLS policies.
-- Assumes public."User"."authUserId" is synced to Supabase auth.users.id.
-- This is the first production-ready pass, not the final hardening pass.

alter table public."Store" enable row level security;
alter table public."User" enable row level security;
alter table public."StaffMember" enable row level security;
alter table public."Location" enable row level security;
alter table public."Customer" enable row level security;
alter table public."StoreOption" enable row level security;
alter table public."Appointment" enable row level security;

create or replace function public.current_app_user_id()
returns text
language sql
stable
as $$
  select "id"
  from public."User"
  where "authUserId" = auth.uid()::text
  limit 1
$$;

create or replace function public.current_app_user_role()
returns text
language sql
stable
as $$
  select role::text
  from public."User"
  where "authUserId" = auth.uid()::text
  limit 1
$$;

create or replace function public.current_app_user_store()
returns text
language sql
stable
as $$
  select "storeId"
  from public."User"
  where "authUserId" = auth.uid()::text
  limit 1
$$;

create or replace function public.current_app_staff_member_id()
returns text
language sql
stable
as $$
  select "staffMemberId"
  from public."User"
  where "authUserId" = auth.uid()::text
  limit 1
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
as $$
  select coalesce(public.current_app_user_role() = 'ADMIN', false)
$$;

create or replace function public.is_manager()
returns boolean
language sql
stable
as $$
  select coalesce(public.current_app_user_role() = 'MANAGER', false)
$$;

create or replace function public.is_front_desk()
returns boolean
language sql
stable
as $$
  select coalesce(public.current_app_user_role() = any (array['USER', 'MANAGER', 'ADMIN']), false)
$$;

create or replace function public.is_same_store(target_store_id text)
returns boolean
language sql
stable
as $$
  select coalesce(target_store_id = public.current_app_user_store(), false)
$$;

create policy "stores readable to signed-in users"
on public."Store"
for select
using (
  public.is_admin()
  or id = public.current_app_user_store()
);

create policy "users readable by self manager admin"
on public."User"
for select
using (
  id = public.current_app_user_id()
  or public.is_admin()
  or (public.is_manager() and "storeId" = public.current_app_user_store())
);

create policy "users writable by admin"
on public."User"
for all
using (public.is_admin())
with check (public.is_admin());

create policy "staff readable within store"
on public."StaffMember"
for select
using (
  public.is_admin()
  or public.is_same_store("storeId")
);

create policy "staff writable by manager admin"
on public."StaffMember"
for all
using (
  public.is_admin()
  or (public.is_manager() and public.is_same_store("storeId"))
)
with check (
  public.is_admin()
  or (public.is_manager() and public.is_same_store("storeId"))
);

create policy "locations readable within store"
on public."Location"
for select
using (
  public.is_admin()
  or public.is_same_store("storeId")
);

create policy "locations writable by manager admin"
on public."Location"
for all
using (
  public.is_admin()
  or (public.is_manager() and public.is_same_store("storeId"))
)
with check (
  public.is_admin()
  or (public.is_manager() and public.is_same_store("storeId"))
);

create policy "customers readable within store"
on public."Customer"
for select
using (
  public.is_admin()
  or public.is_same_store("storeId")
);

create policy "customers writable by front desk and above"
on public."Customer"
for all
using (
  public.is_admin()
  or (public.is_front_desk() and public.is_same_store("storeId"))
)
with check (
  public.is_admin()
  or (public.is_front_desk() and public.is_same_store("storeId"))
);

create policy "store options readable within store"
on public."StoreOption"
for select
using (
  public.is_admin()
  or public.is_same_store("storeId")
);

create policy "store options writable by manager admin"
on public."StoreOption"
for all
using (
  public.is_admin()
  or (public.is_manager() and public.is_same_store("storeId"))
)
with check (
  public.is_admin()
  or (public.is_manager() and public.is_same_store("storeId"))
);

create policy "appointments readable by role scope"
on public."Appointment"
for select
using (
  public.is_admin()
  or (
    public.current_app_user_role() in ('USER', 'MANAGER')
    and public.is_same_store("storeId")
  )
  or (
    public.current_app_user_role() = 'STYLIST'
    and public.is_same_store("storeId")
    and "assignedStaffMemberId" = public.current_app_staff_member_id()
  )
);

create policy "appointments writable by front desk and above"
on public."Appointment"
for all
using (
  public.is_admin()
  or (public.is_front_desk() and public.is_same_store("storeId"))
)
with check (
  public.is_admin()
  or (public.is_front_desk() and public.is_same_store("storeId"))
);
