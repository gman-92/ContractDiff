import { NextRequest } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase.server';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from('comparisons')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !data) {
    return Response.json(
      { error: error?.message ?? 'Not found', code: error?.code },
      { status: 404 }
    );
  }
  return Response.json(data);
}
