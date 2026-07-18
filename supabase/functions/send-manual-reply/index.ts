import { corsHeaders } from '../_shared/cors.ts';
import { jsonResponse, readObject, requireUser } from '../_shared/request.ts';

/** Approves a single AI draft; the worker's Realtime listener sends it over WhatsApp. */
Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders() });
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);
  try {
    const { user, supabase } = await requireUser(request);
    const body = await readObject(request);
    const messageId = typeof body.messageId === 'string' ? body.messageId : '';
    const content = typeof body.content === 'string' ? body.content.trim() : '';
    if (!messageId || !content || content.length > 8_000) return jsonResponse({ error: 'Invalid draft' }, 400);

    const { data, error } = await supabase
      .from('messages')
      .update({ content, status: 'sent' })
      .eq('id', messageId)
      .eq('role', 'assistant')
      .eq('status', 'draft')
      .select('id')
      .maybeSingle();
    if (error) throw error;
    if (!data) return jsonResponse({ error: 'Draft not found' }, 404);
    return jsonResponse({ ok: true, id: data.id });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : 'Request failed' }, 401);
  }
});
