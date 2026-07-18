# Relay — AI WhatsApp Assistant

Relay is a private, production-oriented WhatsApp assistant with persistent conversation context, durable contact memory, manual approval controls, and automatic AI-provider failover.

## Architecture

```
WhatsApp ↔ Node/Baileys worker ↔ Supabase (Postgres, Auth, Realtime)
                                      ↕
                              React dashboard (GitHub Pages)
```

The worker is the only component with AI-provider credentials and the Supabase service-role key. The dashboard uses the anonymous key and relies on RLS.

## Local setup

1. Install Node.js 20+, Docker Desktop, Git, and the Supabase CLI.
2. Create a Supabase project, then run from this repository:

```powershell
supabase login
supabase link --project-ref <project-ref>
supabase db push
supabase functions deploy send-manual-reply
supabase functions deploy toggle-bot
supabase functions deploy regenerate-draft
supabase functions deploy test-provider
```

3. Configure the worker:

```powershell
Copy-Item worker\.env.example worker\.env
cd worker
npm install
npm run build
npm test
```

Set `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `WORKER_USER_ID`, `WORKER_COMMAND_TOKEN`, and at least one AI provider key in `worker/.env`. `WORKER_USER_ID` must be the UUID of the Supabase Auth user who will use Relay.

4. Configure the dashboard:

```powershell
Copy-Item dashboard\.env.example dashboard\.env
cd dashboard
npm install
npm run dev
```

Put only the Supabase URL and anonymous key in `dashboard/.env`.

## Deploy worker to Fly.io

```bash
cd worker
fly auth login
fly launch --no-deploy
fly volumes create sessions_data --size 1
fly secrets set SUPABASE_URL=<url> SUPABASE_SERVICE_ROLE_KEY=<service-role-key> WORKER_USER_ID=<auth-user-id> WORKER_COMMAND_TOKEN=<long-random-token> GEMINI_API_KEY=<optional-key>
fly deploy
```

Add further provider keys using `fly secrets set`. Configure Supabase Edge Function secrets so dashboard commands can call the worker:

```bash
supabase secrets set ALLOWED_ORIGIN=https://<github-user>.github.io WORKER_INTERNAL_URL=https://<fly-app>.fly.dev WORKER_COMMAND_TOKEN=<same-long-random-token>
supabase functions deploy regenerate-draft
supabase functions deploy test-provider
```

## Deploy dashboard to GitHub Pages

1. Push to GitHub’s `main` branch.
2. In GitHub Settings → Pages, set Source to **GitHub Actions**.
3. Add repository Actions secrets `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
4. Push to `main`; the included workflow deploys `dashboard/dist`.

## Verification checklist

- Sign in to the dashboard with the same Supabase Auth user as `WORKER_USER_ID`.
- Scan the QR code in Overview via WhatsApp Linked Devices.
- Send a message from another number and confirm it appears in Conversations.
- Confirm Automatic mode sends a reply and logs the selected provider.
- Set a contact to Manual, send another message, and approve a draft.
- Disable the bot and confirm no reply is sent.

## Tests

`worker/npm test` covers provider failover and reply eligibility. To run the repository integration test against `supabase start`, export `SUPABASE_TEST_URL` and `SUPABASE_TEST_SERVICE_ROLE_KEY` before running the test command.

