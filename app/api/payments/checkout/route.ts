import { NextResponse } from 'next/server';

import { createSupabaseServerClient } from '@/lib/supabase/server';
import { ToyyibPayProvider } from '@/packages/payments';

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const payload = await request.json().catch(() => ({}));
  const businessId = String(payload.businessId ?? payload.business_id ?? '').trim();
  const subscriptionId = String(payload.subscriptionId ?? payload.subscription_id ?? '').trim();

  if (!businessId || !subscriptionId) {
    return NextResponse.json({ error: 'businessId and subscriptionId are required.' }, { status: 400 });
  }

  const { data: membershipRows, error: membershipError } = await supabase
    .from('business_members')
    .select('business_id')
    .eq('user_id', user.id);

  if (membershipError) {
    return NextResponse.json({ error: membershipError.message }, { status: 400 });
  }

  const authorizedBusinessIds = new Set((membershipRows ?? []).map((row: any) => String(row.business_id ?? '').trim()).filter(Boolean));
  if (!authorizedBusinessIds.has(businessId)) {
    return NextResponse.json({ error: 'Business access denied.' }, { status: 403 });
  }

  const { data: subscriptionRow, error: subscriptionError } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('id', subscriptionId)
    .eq('business_id', businessId)
    .maybeSingle();

  if (subscriptionError) {
    return NextResponse.json({ error: subscriptionError.message }, { status: 400 });
  }

  if (!subscriptionRow) {
    return NextResponse.json({ error: 'Subscription not found.' }, { status: 404 });
  }

  const provider = new ToyyibPayProvider({
    mode: process.env.TOYYIBPAY_MODE === 'live' ? 'live' : 'sandbox',
    secret: process.env.TOYYIBPAY_SECRET_KEY ?? 'sandbox-toyyibpay-secret',
    categoryCode: process.env.TOYYIBPAY_CATEGORY_CODE ?? 'sandbox-category',
    baseUrl: process.env.TOYYIBPAY_BASE_URL ?? 'https://toyyibpay.com',
  });

  const checkout = await provider.createCheckoutSession({
    businessId,
    subscriptionId: subscriptionRow.id,
    amount: '29.00',
    currency: 'MYR',
    customerEmail: user.email ?? undefined,
    customerName: String(user.user_metadata?.full_name ?? user.email ?? 'Customer'),
    customerPhone: String(user.user_metadata?.phone ?? '60123456789'),
    reference: String(payload.reference ?? `opsfinance-${subscriptionRow.id}`),
    metadata: {
      business_id: businessId,
      subscription_id: subscriptionRow.id,
      callback_url: process.env.TOYYIBPAY_CALLBACK_URL ?? `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.myops.com.my'}/api/payments/webhook`,
      return_url: `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.myops.com.my'}/settings/subscription`,
    },
  });

  const { error: insertError } = await supabase.from('subscription_payments').insert({
    business_id: businessId,
    subscription_id: subscriptionRow.id,
    provider: 'TOYYIBPAY',
    provider_payment_id: checkout.checkoutId,
    provider_reference: checkout.providerReference,
    checkout_session_id: checkout.checkoutId,
    amount: 29.00,
    currency: 'MYR',
    status: 'INITIATED',
    metadata: {
      mode: provider.mode,
      checkout_url: checkout.sessionUrl,
      provider_reference: checkout.providerReference,
    },
  });

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 400 });
  }

  return NextResponse.json({
    provider: checkout.provider,
    mode: checkout.mode,
    checkoutSession: {
      id: checkout.checkoutId,
      url: checkout.sessionUrl,
      reference: checkout.providerReference,
      amount: checkout.amount,
      currency: checkout.currency,
    },
  });
}
