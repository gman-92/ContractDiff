export const runtime = 'nodejs';

export async function GET() {
  return Response.json({
    ok: true,
    ts: new Date().toISOString(),
    anthropic_key: !!process.env.ANTHROPIC_API_KEY,
    supabase_url: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    service_role: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
  });
}
