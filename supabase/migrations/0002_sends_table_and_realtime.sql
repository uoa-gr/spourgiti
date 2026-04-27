create table public.sends (
  id                       uuid       primary key default gen_random_uuid(),
  sender_id                uuid       not null references public.profiles(id) on delete cascade,
  recipient_id             uuid       not null references public.profiles(id) on delete cascade,
  transport                text       not null check (transport in ('cloud', 'p2p')),
  status                   text       not null check (status in ('staged', 'delivered', 'revoked', 'expired')),
  size_bytes               bigint     not null check (size_bytes >= 0),
  storage_object           text,
  encrypted_manifest       bytea      not null,
  manifest_sig             bytea      not null check (octet_length(manifest_sig) = 64),
  wrapped_key              bytea      not null check (octet_length(wrapped_key) = 80),
  created_at               timestamptz not null default now(),
  delivered_at             timestamptz,
  expires_at               timestamptz not null default (now() + interval '7 days'),
  check ((status = 'delivered') = (delivered_at is not null)),
  check ((transport = 'cloud') = (storage_object is not null))
);

create index sends_recipient_status_created on public.sends (recipient_id, status, created_at desc);
create index sends_sender_created           on public.sends (sender_id, created_at desc);
create index sends_storage_object           on public.sends (storage_object) where storage_object is not null;
create index sends_expires_at               on public.sends (expires_at) where status = 'staged';

alter table public.sends enable row level security;

-- Read: row visible to sender and recipient.
create policy "sends_party_select" on public.sends
  for select to authenticated
  using (sender_id = auth.uid() or recipient_id = auth.uid());

-- Direct INSERT denied; only commit_upload RPC (migration 0004) writes.
-- Direct UPDATE/DELETE denied; only mark_delivered / revoke_send RPCs write.
-- The RPCs are SECURITY DEFINER so they bypass these policies.

-- Realtime publication: clients subscribe to postgres_changes filtered on
-- recipient_id = self for the inbox feed.
alter publication supabase_realtime add table public.sends;

comment on table public.sends is
  'One file-transfer envelope per row. encrypted_manifest is sealed-box to recipient. wrapped_key is sealed-box(K, recipient_x25519). manifest_sig is detached Ed25519 over JCS(manifest). All UPDATEs are RPC-gated.';
