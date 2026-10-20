-- One table, owner-only RLS, published to Realtime.
-- RLS reads the JWT (auth.uid()), so a Realtime join without a valid token
-- receives no rows: that is the #1730 symptom.
create table public.messages (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

alter table public.messages enable row level security;

create policy "owner reads" on public.messages for select to authenticated using (user_id = auth.uid());
create policy "owner inserts" on public.messages for insert to authenticated with check (user_id = auth.uid());

alter publication supabase_realtime add table public.messages;

-- Newer local stacks don't auto-grant new public tables to the API roles.
grant select, insert on public.messages to authenticated;
