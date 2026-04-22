import { NextRequest } from 'next/server';
import { getStripe } from '@/lib/stripe';
import { createServerClient } from '@/lib/supabase.server';

export async function POST(request: NextRequest) {
  if (!process.env.STRIPE_SECRET_KEY) {
    return Response.json({ error: 'Stripe not configured' }, { status: 503 });
  }

  const supabase = await createServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { plan } = await request.json() as { plan: 'pro' | 'credits' };
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

  const priceId =
    plan === 'pro'
      ? process.env.STRIPE_PRO_PRICE_ID
      : process.env.STRIPE_CREDITS_PRICE_ID;

  const session = await getStripe().checkout.sessions.create({
    mode: plan === 'pro' ? 'subscription' : 'payment',
    payment_method_types: ['card'],
    line_items: priceId
      ? [{ price: priceId, quantity: 1 }]
      : [
          {
            price_data: {
              currency: 'usd',
              product_data: { name: plan === 'pro' ? 'ContractDiff Pro' : '10 Comparison Credits' },
              unit_amount: plan === 'pro' ? 7900 : 2500,
              ...(plan === 'pro' ? { recurring: { interval: 'month' } } : {}),
            },
            quantity: 1,
          },
        ],
    metadata: { user_id: user.id, plan },
    success_url: `${appUrl}/dashboard?upgraded=true`,
    cancel_url: `${appUrl}/dashboard`,
  });

  return Response.json({ url: session.url });
}
