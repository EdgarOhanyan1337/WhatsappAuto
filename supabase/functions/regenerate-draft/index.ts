import { corsHeaders } from '../_shared/cors.ts';
import { invokeWorker, jsonResponse, readObject, requireUser } from '../_shared/request.ts';

/** Verifies draft ownership then asks the credential-holding worker to regenerate it. */
Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders() });
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);
  try {
    const { user, supabase } = await requireUser(request);
    const body = await readObject(request);
    const messageId = typeof body.messageId === 'string' ? body.messageId : '';
    if (!messageId) return jsonResponse({ error: 'messageId is required' }, 400);
    const { data, error } = await supabase
      .from('messages')
      .select('id')
      .eq('id', messageId)
      .eq('status', 'draft')
      .maybeSingle();
    if (error) throw error;
    if (!data) return jsonResponse({ error: 'Draft not found' }, 404);
    return jsonResponse(await invokeWorker({ action: 'regenerate-draft', messageId }));
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : 'Request failed' }, 400);
  }
});
