-- AI WhatsApp Assistant: initial production schema and row-level access rules.
-- This migration is intentionally scoped to the tables defined in the engineering specification.

create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

-- ========== USERS (mirrors Supabase auth.users) ==========
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now()
);

-- ========== WHATSAPP SESSIONS ==========
create table public.whatsapp_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'disconnected',
  qr_code text,
  session_data jsonb,
  last_connected_at timestamptz,
  updated_at timestamptz not null default now()
);

-- ========== CONTACTS ==========
create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  phone text not null,
  display_name text,
  is_blacklisted boolean not null default false,
  is_whitelisted boolean not null default false,
  bot_mode text not null default 'inherit',
  created_at timestamptz not null default now(),
  unique (user_id, phone)
);

-- ========== CONVERSATIONS ==========
create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  is_pinned boolean not null default false,
  last_message_at timestamptz,
  unread_count integer not null default 0,
  created_at timestamptz not null default now()
);

-- ========== MESSAGES ==========
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  role text not null,
  content text,
  media_url text,
  media_type text,
  ai_provider text,
  status text not null default 'sent',
  created_at timestamptz not null default now()
);

create index idx_messages_conversation on public.messages(conversation_id, created_at);

-- ========== MEMORY (long-term facts per contact) ==========
create table public.memories (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.contacts(id) on delete cascade,
  fact text not null,
  category text,
  is_pinned boolean not null default false,
  created_at timestamptz not null default now()
);

-- ========== AI PROVIDERS CONFIG ==========
create table public.ai_providers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  priority integer not null,
  enabled boolean not null default true,
  cooldown_until timestamptz,
  unique (user_id, name)
);

-- ========== PROVIDER CALL LOGS ==========
create table public.provider_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  provider text not null,
  success boolean not null,
  latency_ms integer,
  error_message text,
  created_at timestamptz not null default now()
);

-- ========== BOT SETTINGS ==========
create table public.bot_settings (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  bot_enabled boolean not null default true,
  default_mode text not null default 'auto',
  system_prompt text not null default 'You are replying on behalf of the user. Be natural, brief, and match their tone.',
  reply_delay_seconds integer not null default 0,
  working_hours_start time,
  working_hours_end time,
  updated_at timestamptz not null default now()
);

-- ========== ROW LEVEL SECURITY ==========
alter table public.profiles enable row level security;
alter table public.whatsapp_sessions enable row level security;
alter table public.contacts enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.memories enable row level security;
alter table public.ai_providers enable row level security;
alter table public.provider_logs enable row level security;
alter table public.bot_settings enable row level security;

create policy "own profile only" on public.profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

create policy "own whatsapp sessions only" on public.whatsapp_sessions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own contacts only" on public.contacts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own conversations only" on public.conversations
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own messages only" on public.messages
  for all using (
    exists (
      select 1
      from public.conversations c
      where c.id = messages.conversation_id
        and c.user_id = auth.uid()
    )
  ) with check (
    exists (
      select 1
      from public.conversations c
      where c.id = messages.conversation_id
        and c.user_id = auth.uid()
    )
  );

create policy "own memories only" on public.memories
  for all using (
    exists (
      select 1
      from public.contacts co
      where co.id = memories.contact_id
        and co.user_id = auth.uid()
    )
  ) with check (
    exists (
      select 1
      from public.contacts co
      where co.id = memories.contact_id
        and co.user_id = auth.uid()
    )
  );

create policy "own AI provider configuration only" on public.ai_providers
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own provider logs only" on public.provider_logs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own bot settings only" on public.bot_settings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Keep profile creation and visible timestamps reliable without client cooperation.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', new.email));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_auth_user();

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger whatsapp_sessions_set_updated_at
  before update on public.whatsapp_sessions
  for each row execute procedure public.set_updated_at();

create trigger bot_settings_set_updated_at
  before update on public.bot_settings
  for each row execute procedure public.set_updated_at();

-- Dashboard subscriptions need these tables in Supabase Realtime's publication.
alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.whatsapp_sessions;
