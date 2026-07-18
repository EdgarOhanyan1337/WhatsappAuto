import { createClient, SupabaseClient, User } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from './cors.ts';

/** Returns a CORS-aware JSON response from any dashboard Edge Function. */
export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(), 'Content-Type': 'application/json; charset=utf-8' },
  });
}

/** Authenticates a dashboard caller and creates a database client scoped to that user's RLS rules. */
export async function requireUser(request: Request): Promise<{ user: User; supabase: SupabaseClient }> {
  const authorization = request.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) throw new Error('Unauthorized');
  const token = authorization.slice('Bearer '.length);
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } },
  );
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) throw new Error('Unauthorized');
  return { user: data.user, supabase };
}

/** Parses a JSON object body and rejects primitives or arrays. */
export async function readObject(request: Request): Promise<Record<string, unknown>> {
  const value: unknown = await request.json();
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('JSON object expected');
  return value as Record<string, unknown>;
}

/** Sends a verified command from an Edge Function to the worker's protected internal API. */
export async function invokeWorker(payload: Record<string, unknown>): Promise<unknown> {
  const baseUrl = Deno.env.get('WORKER_INTERNAL_URL');
  const token = Deno.env.get('WORKER_COMMAND_TOKEN');
  if (!baseUrl || !token) throw new Error('Worker command integration is not configured');
  const response = await fetch(`${baseUrl.replace(/\/$/, '')}/commands`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const body: unknown = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message =
      body && typeof body === 'object' && 'error' in body ? String(body.error) : 'Worker command failed';
    throw new Error(message);
  }
  return body;
}

