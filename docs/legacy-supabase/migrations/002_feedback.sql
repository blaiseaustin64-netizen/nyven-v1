-- Optional feedback persistence (Phase polish). Safe to apply when ready.
create table if not exists public.message_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  conversation_id uuid,
  message_id text,
  feedback_type text not null check (feedback_type in ('positive', 'negative')),
  reason text,
  details text,
  client_version text,
  created_at timestamptz not null default now()
);

create index if not exists message_feedback_user_idx on public.message_feedback (user_id, created_at desc);
alter table public.message_feedback enable row level security;

drop policy if exists "feedback_insert" on public.message_feedback;
create policy "feedback_insert" on public.message_feedback
  for insert with check (user_id is null or auth.uid() = user_id);

drop policy if exists "feedback_select_own" on public.message_feedback;
create policy "feedback_select_own" on public.message_feedback
  for select using (auth.uid() = user_id);

create table if not exists public.bug_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  summary text not null,
  category text,
  details text,
  route text,
  conversation_id text,
  message_id text,
  user_agent text,
  client_version text,
  created_at timestamptz not null default now()
);

create index if not exists bug_reports_created_idx on public.bug_reports (created_at desc);
alter table public.bug_reports enable row level security;

drop policy if exists "bug_insert" on public.bug_reports;
create policy "bug_insert" on public.bug_reports
  for insert with check (user_id is null or auth.uid() = user_id);

-- No client select of all bugs — operators use service role / dashboard
