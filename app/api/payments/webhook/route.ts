import { NextResponse } from 'next/server';

import { createSupabaseAdminClient, createSupabaseServerClient } from '@/lib/supabase/server';
import { ToyyibPayProvider, resolveNextSubscriptionStatus } from '@/packages/payments';

const SAFE_WEBHOOK_LOG_KEYS = ['status', 'order_id', 'refno', 'billcode', 'reason', 'amount'];

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

function safeLogValue(value: string | null | undefined): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  if (/^(?:[A-Za-z0-9_-]{6,})$/.test(trimmed) || /^TP[0-9A-Za-z_-]+$/.test(trimmed)) {
    return trimmed;
  }

  if (/^[0-9]+$/.test(trimmed)) {
    return trimmed;
  }

  return null;
}

function summarizeWebhookPayload(payload: Record<string, string>) {
  const visibleFields = Object.keys(payload).filter((key) => !/secret|token|cookie|authorization|email|phone|pii|raw/i.test(key) && key !== 'hash' && key !== 'signature');
  const safeFields = SAFE_WEBHOOK_LOG_KEYS.filter((key) => Object.prototype.hasOwnProperty.call(payload, key));
  const status = safeLogValue(payload.status ?? payload.payment_status ?? null);
  const billcode = safeLogValue(payload.billcode ?? payload.billCode ?? null);
  const refno = safeLogValue(payload.refno ?? payload.reference ?? payload.order_id ?? null);
  const amount = safeLogValue(payload.amount ?? payload.billpaymentamount ?? payload.billpaymentAmount ?? null);

  return {
    parsed_field_names: visibleFields,
    safe_fields: safeFields,
    status: status ?? null,
    billcode: billcode ?? null,
    refno: refno ?? null,
    amount: amount ?? null,
    signature_present: Boolean(payload.hash || payload.signature || payload['x-signature'] || payload['x-toyyibpay-signature']),
  };
}

function logWebhookLifecycle(stage: string, details: Record<string, unknown>) {
  const payload = {
    timestamp: new Date().toISOString(),
    stage,
    ...details,
  };

  console.info(`[toyyibpay-webhook] ${stage}`, JSON.stringify(payload));
}

function createErrorResponse(status: number, message: string, code: string, meta: Record<string, unknown> = {}) {
  logWebhookLifecycle('webhook_response', {
    http_status: status,
    error_category: code,
    final_http_status: status,
    ...meta,
  });

  return NextResponse.json({ ok: false, error: message, code }, { status });
}

function createDbFailureResponse(code: string, meta: Record<string, unknown> = {}) {
  return createErrorResponse(500, 'Webhook processing failed. Please try again later.', code, {
    persistence_result: 'db_failure',
    ...meta,
  });
}

export async function POST(request: Request) {
  const startedAt = Date.now();
  const contentType = request.headers.get('content-type') ?? 'unknown';
  const rawBody = await request.text();
  const parsedPayload = parseCallbackPayload(rawBody);
  const signature = request.headers.get('x-signature') ?? request.headers.get('x-toyyibpay-signature') ?? parsedPayload.hash ?? null;
  const summary = summarizeWebhookPayload(parsedPayload);

  logWebhookLifecycle('request_received', {
    content_type: contentType,
    payload_size: rawBody.length,
    ...summary,
  });

  if (!rawBody.trim()) {
    logWebhookLifecycle('request_validation_failed', {
      validation_result: 'malformed',
      reason: 'empty_body',
      duration_ms: Date.now() - startedAt,
    });
    return createErrorResponse(400, 'Malformed callback payload.', 'malformed_callback', {
      validation_result: 'malformed',
      duration_ms: Date.now() - startedAt,
    });
  }

  const provider = new ToyyibPayProvider({
    mode: process.env.TOYYIBPAY_MODE === 'live' ? 'live' : 'sandbox',
    secret: process.env.TOYYIBPAY_SECRET_KEY ?? 'sandbox-toyyibpay-secret',
    categoryCode: process.env.TOYYIBPAY_CATEGORY_CODE ?? 'sandbox-category',
    baseUrl: process.env.TOYYIBPAY_BASE_URL ?? 'https://toyyibpay.com',
  });

  if (!provider.verifyWebhookSignature(rawBody, signature)) {
    logWebhookLifecycle('signature_validation_failed', {
      validation_result: 'invalid_signature',
      signature_present: Boolean(signature),
      duration_ms: Date.now() - startedAt,
    });
    return createErrorResponse(400, 'Invalid webhook signature.', 'invalid_signature', {
      validation_result: 'invalid_signature',
      duration_ms: Date.now() - startedAt,
    });
  }

  const event = provider.parseWebhookEvent(parsedPayload);
  const admin = createSupabaseAdminClient();
  const supabase = await createSupabaseServerClient();

  logWebhookLifecycle('signature_validation_passed', {
    validation_result: 'valid',
    provider: event.provider,
    event_id: event.eventId,
    status: summary.status,
    billcode: summary.billcode,
    refno: summary.refno,
    duration_ms: Date.now() - startedAt,
  });

  const { data: existingPayment, error: lookupError } = await admin
    .from('subscription_payments')
    .select('*')
    .or(`provider_payment_id.eq.${event.eventId},webhook_event_id.eq.${event.eventId},provider_reference.eq.${event.reference}`)
    .maybeSingle();

  if (lookupError) {
    return createDbFailureResponse('db_lookup_failed', {
      validation_result: 'valid',
      duration_ms: Date.now() - startedAt,
    });
  }

  const paymentStatus = event.status === 'PAID' ? 'PAID' : event.status === 'FAILED' ? 'FAILED' : event.status;

  if (existingPayment) {
    if (existingPayment.webhook_event_id === event.eventId) {
      logWebhookLifecycle('duplicate_callback', {
        validation_result: 'valid',
        persistence_result: 'duplicate',
        http_status: 200,
        provider: event.provider,
        event_id: event.eventId,
        duration_ms: Date.now() - startedAt,
      });
      logWebhookLifecycle('response_sent', {
        validation_result: 'valid',
        persistence_result: 'duplicate',
        http_status: 200,
        final_http_status: 200,
        provider: event.provider,
        event_id: event.eventId,
        duration_ms: Date.now() - startedAt,
      });
      return NextResponse.json({ ok: true, idempotent: true, code: 'duplicate_callback', payment: existingPayment }, { status: 200 });
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
      return createDbFailureResponse('db_update_failed', {
        validation_result: 'valid',
        duration_ms: Date.now() - startedAt,
      });
    }
  } else {
    logWebhookLifecycle('payment_mapping_failed', {
      validation_result: 'valid',
      persistence_result: 'unmatched_callback',
      http_status: 422,
      final_http_status: 422,
      provider: event.provider,
      event_id: event.eventId,
      duration_ms: Date.now() - startedAt,
    });
    return createErrorResponse(422, 'Payment callback could not be matched to an initiated payment.', 'unmatched_callback', {
      validation_result: 'valid',
      duration_ms: Date.now() - startedAt,
    });
  }

  const { data: subscriptionRow } = await admin
    .from('subscriptions')
    .select('*')
    .eq('id', event.subscriptionId || existingPayment?.subscription_id)
    .maybeSingle();

  if (!subscriptionRow) {
    logWebhookLifecycle('subscription_mapping_failed', {
      validation_result: 'valid',
      persistence_result: 'payment_recorded_unknown_subscription',
      http_status: 200,
      final_http_status: 200,
      provider: event.provider,
      payment_reference: event.reference,
      duration_ms: Date.now() - startedAt,
    });
    return NextResponse.json({ ok: true, accepted: true, ignored: true, code: 'unknown_subscription' }, { status: 200 });
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
    return createDbFailureResponse('db_subscription_update_failed', {
      validation_result: 'valid',
      duration_ms: Date.now() - startedAt,
    });
  }

  const { error: memberError } = await supabase
    .from('business_members')
    .select('business_id')
    .eq('business_id', subscriptionRow.business_id)
    .limit(1);

  if (memberError) {
    return createDbFailureResponse('db_business_members_lookup_failed', {
      validation_result: 'valid',
      duration_ms: Date.now() - startedAt,
    });
  }

  const responseBody = {
    ok: true,
    provider: event.provider,
    eventId: event.eventId,
    paymentStatus,
    subscriptionStatus: updatePayload.status,
    idempotent: Boolean(existingPayment),
  };

  logWebhookLifecycle('webhook_completed', {
    validation_result: 'valid',
    persistence_result: 'success',
    http_status: 200,
    final_http_status: 200,
    provider: event.provider,
    event_id: event.eventId,
    payment_status: paymentStatus,
    subscription_status: updatePayload.status,
    duration_ms: Date.now() - startedAt,
  });

  logWebhookLifecycle('response_sent', {
    validation_result: 'valid',
    persistence_result: 'success',
    http_status: 200,
    final_http_status: 200,
    provider: event.provider,
    event_id: event.eventId,
    duration_ms: Date.now() - startedAt,
  });

  return NextResponse.json(responseBody, { status: 200 });
}
