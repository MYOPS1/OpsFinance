import { NextResponse } from 'next/server';

import { createSupabaseAdminClient, createSupabaseServerClient } from '@/lib/supabase/server';
import { ToyyibPayProvider, resolveNextSubscriptionStatus } from '@/packages/payments';

function parseCallbackPayload(rawBody: string): Record<string, string> {
  if (!rawBody) {
    return {};
  }

  try {
    const parsed = JSON.parse(rawBody) as Record<string, unknown>;
    if (parsed && typeof parsed === 'object') {
      return Object.fromEntries(Object.entries(parsed).map(([key, value]) => [key, String(value ?? '')]));
    }
  } catch {
    // Fall back to URL-encoded form parsing for ToyyibPay callback payloads.
  }

  const params = new URLSearchParams(rawBody);
  return Object.fromEntries(Array.from(params.entries()).map(([key, value]) => [key, value]));
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const parsedPayload = parseCallbackPayload(rawBody);
  const signature = request.headers.get('x-signature') ?? request.headers.get('x-toyyibpay-signature') ?? parsedPayload.hash ?? null;

  const provider = new ToyyibPayProvider({
    mode: process.env.TOYYIBPAY_MODE === 'live' ? 'live' : 'sandbox',
    secret: process.env.TOYYIBPAY_SECRET_KEY ?? 'sandbox-toyyibpay-secret',
    categoryCode: process.env.TOYYIBPAY_CATEGORY_CODE ?? 'sandbox-category',
    baseUrl: process.env.TOYYIBPAY_BASE_URL ?? 'https://toyyibpay.com',
  });

  if (!provider.verifyWebhookSignature(rawBody, signature)) {
    return NextResponse.json({ error: 'Invalid webhook signature.' }, { status: 400 });
  }

  const event = provider.parseWebhookEvent(parsedPayload);
  const admin = createSupabaseAdminClient();
  const supabase = await createSupabaseServerClient();

  const { data: existingPayment, error: lookupError } = await admin
    .from('subscription_payments')
    .select('*')
    .or(`provider_payment_id.eq.${event.eventId},webhook_event_id.eq.${event.eventId},provider_reference.eq.${event.reference}`)
    .maybeSingle();

  if (lookupError) {
    return NextResponse.json({ error: lookupError.message }, { status: 400 });
  }

  const paymentStatus = event.status === 'PAID' ? 'PAID' : event.status === 'FAILED' ? 'FAILED' : event.status;

  if (existingPayment) {
    if (existingPayment.webhook_event_id === event.eventId) {
      return NextResponse.json({ ok: true, idempotent: true, payment: existingPayment });
    }

    const { error: updateError } = await admin
      .from('subscription_payments')
      .update({
        status: paymentStatus,
        failure_reason: event.failureReason ?? null,
        provider_reference: event.reference,
        webhook_event_id: event.eventId,
        metadata: {
          ...(existingPayment.metadata ?? {}),
          last_event: event.eventId,
          provider: event.provider,
          status: paymentStatus,
        },
        updated_at: new Date().toISOString(),
      })
      .eq('id', existingPayment.id);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 400 });
    }
  } else {
    const { data: createdPayment, error: insertError } = await admin
      .from('subscription_payments')
      .insert({
        business_id: event.businessId || null,
        subscription_id: event.subscriptionId || null,
        provider: 'TOYYIBPAY',
        provider_payment_id: event.eventId,
        provider_reference: event.reference,
        webhook_event_id: event.eventId,
        amount: Number(event.amount || '29.00'),
        currency: event.currency || 'MYR',
        status: paymentStatus,
        failure_reason: event.failureReason ?? null,
        metadata: {
          provider: event.provider,
          raw_event: parsedPayload,
        },
      })
      .select('*')
      .single();

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 400 });
    }

    if (!createdPayment?.subscription_id) {
      return NextResponse.json({ ok: true, idempotent: false, payment: createdPayment ?? null });
    }
  }

  const { data: subscriptionRow } = await admin
    .from('subscriptions')
    .select('*')
    .eq('id', event.subscriptionId || existingPayment?.subscription_id)
    .maybeSingle();

  if (!subscriptionRow) {
    return NextResponse.json({ ok: true, accepted: true, ignored: true });
  }

  const nextStatus = resolveNextSubscriptionStatus(subscriptionRow.status, paymentStatus);
  const now = new Date().toISOString();
  const updatePayload: Record<string, unknown> = {
    status: nextStatus,
    updated_at: now,
  };

  if (paymentStatus === 'PAID') {
    updatePayload.trial_started_at = subscriptionRow.trial_started_at ?? now;
    updatePayload.trial_ends_at = subscriptionRow.trial_ends_at ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    updatePayload.current_period_start = subscriptionRow.current_period_start ?? now;
    updatePayload.current_period_end = subscriptionRow.current_period_end ?? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  }

  if (paymentStatus === 'FAILED' && subscriptionRow.status === 'ACTIVE') {
    updatePayload.status = 'PAST_DUE';
  }

  const { error: subscriptionUpdateError } = await admin
    .from('subscriptions')
    .update(updatePayload)
    .eq('id', subscriptionRow.id);

  if (subscriptionUpdateError) {
    return NextResponse.json({ error: subscriptionUpdateError.message }, { status: 400 });
  }

  const { error: memberError } = await supabase
    .from('business_members')
    .select('business_id')
    .eq('business_id', subscriptionRow.business_id)
    .limit(1);

  if (memberError) {
    return NextResponse.json({ error: memberError.message }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    provider: event.provider,
    eventId: event.eventId,
    paymentStatus,
    subscriptionStatus: updatePayload.status,
    idempotent: existingPayment ? true : false,
  });
}
