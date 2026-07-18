/** CORS headers for the static dashboard; set ALLOWED_ORIGIN to the deployed GitHub Pages URL. */
export function corsHeaders(): HeadersInit {
  const allowedOrigin = Deno.env.get('ALLOWED_ORIGIN') ?? '*';
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
}

