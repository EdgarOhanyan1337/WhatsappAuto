import { corsHeaders } from '../_shared/cors.ts';
import { jsonResponse, readObject, requireUser } from '../_shared/request.ts';

/** Updates the authenticated owner's global bot switch. */
Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders() });
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);
  try {
    const { user, supabase } = await requireUser(request);
    const body = await readObject(request);
    if (typeof body.enabled !== 'boolean') return jsonResponse({ error: 'enabled must be boolean' }, 400);
    const { error } = await supabase
      .from('bot_settings')
      .upsert({ user_id: user.id, bot_enabled: body.enabled }, { onConflict: 'user_id' });
    if (error) throw error;
    return jsonResponse({ ok: true, enabled: body.enabled });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : 'Request failed' }, 401);
  }
});

