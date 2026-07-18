# AI WhatsApp Assistant — Engineering Specification
### Volume I–XIV — Production-Ready Free-Tier Architecture
Version 1.0 · Prepared for use as a grounding document for an AI coding agent (Claude Code, Cursor, etc.)

---

## 0. How To Use This Document

This file is the **single source of truth** for building the project. Feed it to your AI coding agent (Claude Code / Cursor / Windsurf) together with the file `MASTER_CODING_PROMPT.md`. The agent should:

1. Read this entire document before writing any code.
2. Build the project **phase by phase**, in the order listed in Volume XIV.
3. Never invent architecture that contradicts this spec. If something is ambiguous, it should ask, not guess.
4. Treat every SQL table, interface, and folder name below as the *actual* names to use — not placeholders.

**Scope decision (assumption made explicit):** This spec builds a **Hybrid** system — fully usable by you alone today, but structured so multi-user/SaaS mode is a config flip away (every table already has `user_id`, every query is already scoped). If you only ever want single-user, you simply never build the signup flow for other people.

---

## 1. Project Vision

Build a system where incoming WhatsApp messages are answered automatically by an AI that:

- Knows the conversation history with each contact.
- Remembers long-term facts about each contact (job, preferences, running jokes, promises made).
- Can be toggled between **Automatic** (sends replies instantly) and **Manual/Approval** (drafts a reply, you approve/edit/reject from a dashboard).
- Never depends on a single AI provider — if one is rate-limited or down, it silently fails over to the next free provider.
- Is fully visible and controllable from a web dashboard, so you never have to touch the database directly.
- Costs **$0/month** to run at low volume (a few dozen conversations/day), using only free tiers.

Future-proofing: the same architecture should be able to add Telegram, Instagram, or Discord as new "channel adapters" without touching the AI Router, Memory System, or Dashboard.

---

## 2. Corrected Architecture (Important Fix)

Your original idea was: **GitHub Pages (frontend) + Supabase (backend)**. This is *half* right and needs one correction, explained plainly:

> GitHub Pages only serves static files. Supabase Edge Functions only run for a few seconds per invocation. **Neither can hold a permanent WhatsApp Web connection open 24/7.** WhatsApp Web works over a persistent WebSocket session — it needs a process that never stops running.

So the real architecture has **three** components, not two:

```
┌─────────────────────┐        ┌──────────────────────────┐        ┌────────────────────────┐
│   WhatsApp Client    │◄──────►│   Worker Process          │◄──────►│   Supabase              │
│   (your phone, via   │  ws    │   (Node.js + Baileys)     │  https │   Postgres + Auth +     │
│   linked device)     │        │   ALWAYS-ON, small host   │        │   Realtime + Storage    │
└─────────────────────┘        └──────────────────────────┘        └───────────┬────────────┘
                                                                                 │ Realtime
                                                                                 ▼
                                                                     ┌────────────────────────┐
                                                                     │   React Dashboard       │
                                                                     │   hosted on GitHub Pages│
                                                                     └────────────────────────┘
```

**Where the Worker runs (free options, pick one):**
- Fly.io free allowance (small VM, enough for a Node process + Baileys)
- Railway free trial credits
- Render free web service (spins down on idle — not ideal for a socket, use Fly.io instead)
- Your own PC/Raspberry Pi running 24/7 (genuinely $0, but only works while it's on)

The AI Router itself lives **inside the Worker process** (not in Supabase Edge Functions), because that's where it's simplest to call multiple providers with retries — no extra network hop needed. Supabase Edge Functions are used only for actions the *dashboard* triggers directly (e.g. "send this manual reply now", "regenerate this draft").

---

## 3. Tech Stack

| Layer | Choice | Why |
|---|---|---|
| WhatsApp integration | **Baileys** (`@whiskeysockets/baileys`) | Pure WebSocket implementation, no headless Chrome/Puppeteer needed (unlike whatsapp-web.js) → far lighter, cheaper to host |
| Worker runtime | Node.js 20 + TypeScript | Matches frontend language, one mental model |
| Database/Auth/Realtime/Storage | Supabase (Postgres) | Free tier, built-in RLS, Realtime channels for live dashboard updates |
| Frontend | React + Vite + TypeScript + TailwindCSS + Zustand + React Query | Modern, fast, small bundle for GitHub Pages |
| AI Providers (in priority order, all free-tier) | Google Gemini (AI Studio free tier) → Groq (Llama/Mixtral, very generous free limits + fast) → OpenRouter free models (Qwen, DeepSeek) → HuggingFace Inference (free tier) → Ollama (local, only if you later run your own server) | Redundancy against rate limits |
| Hosting: frontend | GitHub Pages | Free, static |
| Hosting: worker | Fly.io free allowance | Only option here that keeps a socket open 24/7 for free |
| CI/CD | GitHub Actions | Auto-deploy frontend on push to `main` |

---

## 4. Database Schema (Supabase / Postgres)

```sql
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
  status text not null default 'disconnected', -- 'disconnected' | 'qr_pending' | 'connected' | 'error'
  qr_code text,                                  -- base64 QR, cleared once scanned
  session_data jsonb,                            -- encrypted Baileys auth state (or pointer to Storage)
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
  bot_mode text not null default 'inherit',      -- 'inherit' | 'auto' | 'manual' | 'off' (per-contact override)
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
  role text not null,                             -- 'user' | 'assistant' | 'system'
  content text,
  media_url text,
  media_type text,                                -- 'image' | 'voice' | 'document' | null
  ai_provider text,                                -- which provider generated this (assistant msgs only)
  status text not null default 'sent',            -- 'draft' | 'sent' | 'rejected' | 'failed'
  created_at timestamptz not null default now()
);
create index idx_messages_conversation on public.messages(conversation_id, created_at);

-- ========== MEMORY (long-term facts per contact) ==========
create table public.memories (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.contacts(id) on delete cascade,
  fact text not null,                              -- e.g. "Works as a nurse, planning maternity leave"
  category text,                                    -- 'personal' | 'preference' | 'promise' | 'other'
  is_pinned boolean not null default false,
  created_at timestamptz not null default now()
);

-- ========== AI PROVIDERS CONFIG ==========
create table public.ai_providers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,                              -- 'gemini' | 'groq' | 'openrouter' | 'huggingface' | 'ollama'
  priority integer not null,
  enabled boolean not null default true,
  cooldown_until timestamptz,                      -- set when rate-limited, cleared after cooldown
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
  default_mode text not null default 'auto',       -- 'auto' | 'manual'
  system_prompt text not null default 'You are replying on behalf of the user. Be natural, brief, and match their tone.',
  reply_delay_seconds integer not null default 0,
  working_hours_start time,
  working_hours_end time,
  updated_at timestamptz not null default now()
);

-- ========== ROW LEVEL SECURITY ==========
alter table public.whatsapp_sessions enable row level security;
alter table public.contacts enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.memories enable row level security;
alter table public.ai_providers enable row level security;
alter table public.provider_logs enable row level security;
alter table public.bot_settings enable row level security;

-- Example policy pattern (repeat per table, adjusting the join to reach user_id):
create policy "own rows only" on public.contacts
  for all using (auth.uid() = user_id);

create policy "own conversations only" on public.conversations
  for all using (auth.uid() = user_id);

create policy "own messages only" on public.messages
  for all using (
    exists (select 1 from public.conversations c
            where c.id = messages.conversation_id and c.user_id = auth.uid())
  );

create policy "own memories only" on public.memories
  for all using (
    exists (select 1 from public.contacts co
            where co.id = memories.contact_id and co.user_id = auth.uid())
  );
```

> Note: the **Worker** connects with the Supabase **service role key** (server-side only, never shipped to the frontend), so it bypasses RLS by design. RLS exists to protect the **dashboard's** direct queries.

---

## 5. AI Router (multi-provider failover)

### 5.1 Interface

```typescript
// worker/src/ai/AIProvider.ts
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AIProvider {
  name: string;
  generateReply(messages: ChatMessage[]): Promise<string>;
}
```

### 5.2 Example implementation (Gemini)

```typescript
// worker/src/ai/providers/GeminiProvider.ts
import { AIProvider, ChatMessage } from '../AIProvider';

export class GeminiProvider implements AIProvider {
  name = 'gemini';
  constructor(private apiKey: string, private model = 'gemini-2.5-flash') {}

  async generateReply(messages: ChatMessage[]): Promise<string> {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: messages
            .filter(m => m.role !== 'system')
            .map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
          systemInstruction: {
            parts: [{ text: messages.find(m => m.role === 'system')?.content ?? '' }],
          },
        }),
      }
    );

    if (res.status === 429) throw new RateLimitError('gemini');
    if (!res.ok) throw new Error(`Gemini error ${res.status}`);

    const data = await res.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  }
}

export class RateLimitError extends Error {
  constructor(public provider: string) {
    super(`${provider} rate limited`);
  }
}
```

Implement `GroqProvider`, `OpenRouterProvider`, `HuggingFaceProvider`, `OllamaProvider` the same way — same interface, different endpoint/auth. Groq and OpenRouter are OpenAI-compatible, so those two implementations are nearly identical (just different base URL + key).

### 5.3 Router with cooldown-based failover

```typescript
// worker/src/ai/AIRouter.ts
import { AIProvider, ChatMessage } from './AIProvider';
import { RateLimitError } from './providers/GeminiProvider';
import { supabase } from '../supabaseClient';

export class AIRouter {
  constructor(private providers: AIProvider[], private userId: string) {}

  async generateReply(messages: ChatMessage[]): Promise<{ text: string; provider: string }> {
    const { data: config } = await supabase
      .from('ai_providers')
      .select('*')
      .eq('user_id', this.userId)
      .eq('enabled', true)
      .order('priority', { ascending: true });

    const orderedNames = (config ?? []).map(c => c.name);
    const cooldowns = new Map((config ?? []).map(c => [c.name, c.cooldown_until]));

    const ordered = orderedNames
      .map(name => this.providers.find(p => p.name === name))
      .filter((p): p is AIProvider => !!p)
      .filter(p => {
        const until = cooldowns.get(p.name);
        return !until || new Date(until) < new Date();
      });

    for (const provider of ordered.length ? ordered : this.providers) {
      const start = Date.now();
      try {
        const text = await provider.generateReply(messages);
        await this.log(provider.name, true, Date.now() - start, null);
        return { text, provider: provider.name };
      } catch (err) {
        const latency = Date.now() - start;
        await this.log(provider.name, false, latency, String(err));
        if (err instanceof RateLimitError) {
          await supabase
            .from('ai_providers')
            .update({ cooldown_until: new Date(Date.now() + 5 * 60 * 1000).toISOString() })
            .eq('user_id', this.userId)
            .eq('name', provider.name);
        }
        // fall through to next provider
      }
    }
    throw new Error('All AI providers failed or are rate-limited.');
  }

  private async log(provider: string, success: boolean, latencyMs: number, error: string | null) {
    await supabase.from('provider_logs').insert({
      user_id: this.userId, provider, success, latency_ms: latencyMs, error_message: error,
    });
  }
}
```

This gives you exactly the behavior you asked for: try provider 1, on 429/error mark it in cooldown and move to the next, log everything, and the dashboard can show "which provider answered" per message (`messages.ai_provider` column).

---

## 6. Memory System

Two layers:

1. **Short-term** — last N messages per conversation (e.g. last 30), pulled straight from the `messages` table and fed into every prompt.
2. **Long-term** — durable facts in the `memories` table, extracted periodically.

### 6.1 Prompt assembly

```typescript
function buildPrompt(systemPrompt: string, memories: string[], history: ChatMessage[]): ChatMessage[] {
  const memoryBlock = memories.length
    ? `Known facts about this contact:\n- ${memories.join('\n- ')}`
    : '';
  return [
    { role: 'system', content: `${systemPrompt}\n\n${memoryBlock}` },
    ...history,
  ];
}
```

### 6.2 Extracting new memories

After every ~10 messages in a conversation, run one extra AI call with a dedicated prompt:

```
Read this conversation. Extract any new durable facts about the contact
(job, preferences, upcoming plans, promises made, important dates).
Return a JSON array of short strings. If nothing new, return [].
```

Parse the JSON, insert new rows into `memories`, and skip duplicates via a simple similarity check (e.g. skip if a very similar fact already exists — exact-match or trigram similarity in Postgres via `pg_trgm`).

---

## 7. WhatsApp Integration Engine (Baileys)

### 7.1 Responsibilities
- Establish and maintain the WebSocket connection.
- Persist auth credentials so restarts don't require re-scanning the QR code.
- On QR needed: encode as base64, write to `whatsapp_sessions.qr_code`, dashboard renders it.
- On incoming message: check `bot_settings.bot_enabled` and per-contact `bot_mode`, then either auto-reply or create a `draft` message row for manual approval.
- On outgoing message (from dashboard, manual mode): send via Baileys, update message `status`.
- Handle reconnдобавление, working hours, blacklist.

### 7.2 Skeleton

```typescript
// worker/src/whatsapp/connection.ts
import makeWASocket, { useMultiFileAuthState, DisconnectReason } from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import { supabase } from '../supabaseClient';
import { handleIncomingMessage } from './messageHandler';

export async function startWhatsApp(userId: string) {
  const { state, saveCreds } = await useMultiFileAuthState(`./sessions/${userId}`);
  const sock = makeWASocket({ auth: state, printQRInTerminal: false });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;
    if (qr) {
      await supabase.from('whatsapp_sessions')
        .update({ status: 'qr_pending', qr_code: qr })
        .eq('user_id', userId);
    }
    if (connection === 'open') {
      await supabase.from('whatsapp_sessions')
        .update({ status: 'connected', qr_code: null, last_connected_at: new Date().toISOString() })
        .eq('user_id', userId);
    }
    if (connection === 'close') {
      const shouldReconnect =
        (lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
      await supabase.from('whatsapp_sessions').update({ status: 'disconnected' }).eq('user_id', userId);
      if (shouldReconnect) startWhatsApp(userId);
    }
  });

  sock.ev.on('messages.upsert', async ({ messages }) => {
    for (const msg of messages) {
      if (msg.key.fromMe) continue;
      await handleIncomingMessage(userId, sock, msg);
    }
  });

  return sock;
}
```

`useMultiFileAuthState` writes session files to disk — on Fly.io, mount a small persistent volume so the session survives redeploys; otherwise you'll re-scan the QR every deploy.

---

## 8. Backend Actions (Supabase Edge Functions)

Only used for dashboard-triggered actions that need a secure server context (never for the always-on WhatsApp loop):

| Function | Purpose |
|---|---|
| `send-manual-reply` | Dashboard approves a draft → marks it `sent`, worker picks it up via Realtime and actually sends it through Baileys |
| `toggle-bot` | Flip `bot_settings.bot_enabled` |
| `regenerate-draft` | Re-run the AI Router for a given draft message |
| `test-provider` | Manually test one AI provider's connectivity from the dashboard |

---

## 9. Dashboard (Frontend) Specification

**Pages:**
- **Overview** — connection status, bot on/off switch, today's message count, which provider answered most recently.
- **Conversations** — list of contacts sorted by `last_message_at`, unread badges, pinned at top.
- **Conversation View** — chat-bubble UI (like Telegram), infinite scroll, shows `ai_provider` tag on assistant messages, draft messages show Approve/Edit/Reject buttons.
- **Memory Viewer** — per-contact list of `memories`, pin/delete/edit.
- **Providers** — list from `ai_providers`, drag to reorder priority, enable/disable, view `provider_logs`.
- **Settings** — system prompt, default mode, working hours, reply delay, blacklist/whitelist management.

**State/data:** React Query for Supabase fetches, a Supabase Realtime subscription on `messages` and `whatsapp_sessions` to update the UI live without polling.

**Design:** dark theme by default, Tailwind, minimal chrome, no default shadcn look-alike — see your project's existing glassmorphism/dark-forest-green preferences if you want visual consistency with your other apps.

---

## 10. Security

- Service role key **only** ever lives in the Worker's environment variables — never in frontend code, never committed to git.
- Frontend uses the Supabase **anon key** + RLS to scope every query to `auth.uid()`.
- All AI provider API keys live in the Worker's `.env`, never sent to the browser.
- Rate-limit dashboard-triggered Edge Functions (Supabase has built-in options; add a simple per-user counter table if you need finer control).
- Sanitize any text rendered from WhatsApp messages before display (avoid raw HTML injection in the dashboard).

---

## 11. Logging & Monitoring

- Every AI call → row in `provider_logs` (already covered above).
- Worker process logs to stdout; on Fly.io, view with `fly logs`.
- Optional: a `worker_health` table with a heartbeat row updated every minute, so the dashboard can show "Worker: online/offline".

---

## 12. Coding Standards

- TypeScript strict mode everywhere.
- ESLint + Prettier, shared config between `worker/` and `dashboard/`.
- One class per file for providers, handlers, and services.
- No duplicated Supabase query logic — put it behind small repository functions (`getContactById`, `insertMessage`, etc.), not scattered raw queries.
- Every exported function has a one-line JSDoc description.

---

## 13. Testing Strategy

- **Unit:** AI Router failover logic (mock providers, force a `RateLimitError`, assert it moves to the next one and logs correctly).
- **Integration:** message handler end-to-end against a Supabase local dev instance (`supabase start`).
- **Manual/E2E checklist:** scan QR → send yourself a test message → confirm reply appears in WhatsApp and in dashboard → toggle bot off → confirm no auto-reply → toggle manual mode → confirm draft appears and Approve sends it.

---

## 14. Deployment Guide (from zero)

> **Build-aligned update (v1.1):** The implemented repository includes the complete worker, dashboard, Edge Functions, Fly configuration, GitHub Pages workflow, lockfiles, and a validated command sequence. The canonical deployment walkthrough is now [`README.md`](../README.md). Use that guide instead of the historical bootstrap commands below; it reflects the checked-in project structure and the worker-to-Edge-Function command token required for secure draft regeneration and provider tests.

```bash
# 1. Prerequisites
# Install Node.js 20+, Git, and the Supabase CLI
npm install -g supabase

# 2. Create the repo
git init ai-whatsapp-assistant
cd ai-whatsapp-assistant

# 3. Create the Supabase project at https://supabase.com/dashboard
#    Copy: Project URL, anon key, service role key

# 4. Apply the schema
supabase link --project-ref <your-project-ref>
supabase db push   # after putting the SQL from Volume 4 into supabase/migrations/

# 5. Worker setup
cd worker
npm install @whiskeysockets/baileys @supabase/supabase-js dotenv
# .env:
#   SUPABASE_URL=...
#   SUPABASE_SERVICE_ROLE_KEY=...
#   GEMINI_API_KEY=...
#   GROQ_API_KEY=...
#   OPENROUTER_API_KEY=...

# 6. Deploy worker to Fly.io
curl -L https://fly.io/install.sh | sh
fly launch          # creates fly.toml, pick the smallest free-tier machine
fly volumes create sessions_data --size 1     # persistent volume for Baileys session
fly deploy

# 7. Frontend setup
cd ../dashboard
npm create vite@latest . -- --template react-ts
npm install @supabase/supabase-js @tanstack/react-query zustand tailwindcss
# set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env

# 8. Deploy frontend to GitHub Pages
npm install -D gh-pages
# add to package.json: "homepage": "https://<user>.github.io/<repo>"
# add scripts: "predeploy": "npm run build", "deploy": "gh-pages -d dist"
npm run deploy

# 9. First run
# Open the dashboard → Overview → scan the QR code shown there with WhatsApp
# (Linked Devices → Link a Device)

# 10. Test
# Send yourself a WhatsApp message from another number and confirm the flow works end-to-end
```

**Updating:** `git push` → GitHub Actions rebuilds and redeploys the dashboard; `fly deploy` redeploys the worker.
**Backups:** Supabase takes automatic daily backups on paid tiers; on the free tier, periodically export via `supabase db dump` yourself.

---

## 15. Phased Build Order (for the AI coding agent)

1. Database schema + RLS policies
2. Worker skeleton + Baileys connection + QR flow
3. AI Router + one provider (Gemini) working end-to-end
4. Message handler (incoming → AI Router → outgoing), auto mode only
5. Add remaining providers + failover logic
6. Memory system (extraction + injection into prompts)
7. Manual/approval mode
8. Dashboard: Overview + Conversations + Conversation View
9. Dashboard: Providers + Memory Viewer + Settings
10. Security pass (RLS review, secrets audit)
11. Deployment (Fly.io + GitHub Pages)
12. End-to-end manual test pass

Each phase should be **fully working** before moving to the next — no skipped steps, no placeholder code.
