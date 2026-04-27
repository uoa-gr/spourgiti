-- Single-row global pool. Capacity tuned to leave headroom under Supabase
-- free tier (1 GB). 800 MB == 838860800 bytes.
create table public.global_quota_state (
  id                   smallint primary key default 1 check (id = 1),
  total_capacity_bytes bigint not null,
  used_bytes           bigint not null default 0 check (used_bytes >= 0)
);
insert into public.global_quota_state (id, total_capacity_bytes) values (1, 800 * 1024 * 1024);

-- Per-user pending counter — anti-abuse, not a user-visible quota.
create table public.user_quota_state (
  user_id              uuid primary key references public.profiles(id) on delete cascade,
  pending_bytes        bigint not null default 0 check (pending_bytes >= 0),
  updated_at           timestamptz not null default now()
);

-- Reservation tokens. Sender calls reserve_quota; gets a token; uploads;
-- then calls commit_upload with the token. Tokens expire after 15 minutes
-- and are swept by pg_cron (migration 0005).
create table public.pending_uploads (
  token         uuid       primary key default gen_random_uuid(),
  sender_id     uuid       not null references public.profiles(id) on delete cascade,
  size_bytes    bigint     not null check (size_bytes > 0),
  expires_at    timestamptz not null default (now() + interval '15 minutes')
);
create index pending_uploads_expires_at on public.pending_uploads (expires_at);

-- Deferred storage deletion queue. mark_delivered / revoke_send / expire_sends
-- enqueue rows here; an Edge Function worker drains them.
create table public.object_deletion_jobs (
  storage_object   text       primary key,
  enqueued_at      timestamptz not null default now(),
  attempts         int        not null default 0,
  last_error       text
);

-- Administrative tables — RLS enabled with explicit deny-all client policies.
-- SECURITY DEFINER RPCs (migration 0004) bypass RLS as the table owner.
-- Service-role Edge Function workers bypass RLS via the service-role key.
-- Clients (anon, authenticated) have no path to these tables.
alter table public.global_quota_state    enable row level security;
alter table public.user_quota_state      enable row level security;
alter table public.pending_uploads       enable row level security;
alter table public.object_deletion_jobs  enable row level security;

revoke all on public.global_quota_state    from anon, authenticated;
revoke all on public.user_quota_state      from anon, authenticated;
revoke all on public.pending_uploads       from anon, authenticated;
revoke all on public.object_deletion_jobs  from anon, authenticated;

create policy "deny_all_clients" on public.global_quota_state    for all to anon, authenticated using (false) with check (false);
create policy "deny_all_clients" on public.user_quota_state      for all to anon, authenticated using (false) with check (false);
create policy "deny_all_clients" on public.pending_uploads       for all to anon, authenticated using (false) with check (false);
create policy "deny_all_clients" on public.object_deletion_jobs  for all to anon, authenticated using (false) with check (false);

comment on table public.global_quota_state is
  'Single-row global Supabase Storage pool counter. Updated atomically by reserve_quota / commit_upload / mark_delivered.';
comment on table public.pending_uploads is
  'Reservations awaiting commit_upload. Auto-swept after 15 minutes by sweep_pending_uploads pg_cron job.';
comment on table public.object_deletion_jobs is
  'Queue drained by the storage-deletion-worker Edge Function. Postgres function cannot atomically delete a Storage object, so deletion is deferred.';
