import { NextRequest } from 'next/server';
import { getStripe } from '@/lib/stripe';
import { createServiceRoleClient } from '@/lib/supabase.server';

export async function POST(request: NextRequest) {
  const body = await request.text();
  const sig = request.headers.get('stripe-signature');

  if (!sig || !process.env.STRIPE_WEBHOOK_SECRET) {
    return Response.json({ error: 'Missing stripe signature' }, { status: 400 });
  }

  let event;
  try {
    event = getStripe().webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('[webhook] constructEvent error:', err);
    return Response.json({ error: 'Webhook signature verification failed' }, { status: 400 });
  }

  const serviceClient = createServiceRoleClient();

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const userId = session.metadata?.user_id;
    const plan = session.metadata?.plan;

    if (!userId) return Response.json({ received: true });

    if (plan === 'pro') {
      await serviceClient
        .from('profiles')
        .update({ tier: 'pro' })
        .eq('id', userId);
    } else if (plan === 'credits') {
      const { data: profile } = await serviceClient
        .from('profiles')
        .select('credits')
        .eq('id', userId)
        .single();
      const current = (profile as { credits?: number } | null)?.credits ?? 0;
      await serviceClient
        .from('profiles')
        .update({ credits: current + 10 })
        .eq('id', userId);
    }
  }

  if (event.type === 'customer.subscription.deleted') {
    const sub = event.data.object;
    const customerId = sub.customer as string;
    await serviceClient
      .from('profiles')
      .update({ tier: 'free' })
      .eq('stripe_customer_id', customerId);
  }

  return Response.json({ received: true });
}
