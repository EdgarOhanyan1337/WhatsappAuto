import { corsHeaders } from '../_shared/cors.ts';
import { invokeWorker, jsonResponse, readObject, requireUser } from '../_shared/request.ts';

/** Tests an enabled provider owned by the caller without exposing its credential to the dashboard. */
Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders() });
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);
  try {
    const { user, supabase } = await requireUser(request);
    const body = await readObject(request);
    const provider = typeof body.provider === 'string' ? body.provider : '';
    if (!provider) return jsonResponse({ error: 'provider is required' }, 400);
    const { data, error } = await supabase
      .from('ai_providers')
      .select('name')
      .eq('user_id', user.id)
      .eq('name', provider)
      .eq('enabled', true)
      .maybeSingle();
    if (error) throw error;
    if (!data) return jsonResponse({ error: 'Provider is unavailable' }, 404);
    return jsonResponse(await invokeWorker({ action: 'test-provider', provider }));
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : 'Request failed' }, 400);
  }
});

