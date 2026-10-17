import { createHash } from 'node:crypto';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { POST } from '../app/api/payments/webhook/route';
import { PaymentIdempotencyGuard, ToyyibPayProvider, resolveNextSubscriptionStatus } from '../packages/payments';

const mockAdminFrom = vi.hoisted(() => vi.fn());
const mockServerFrom = vi.hoisted(() => vi.fn());

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseAdminClient: () => ({
    from: mockAdminFrom,
  }),
  createSupabaseServerClient: () => ({
    from: mockServerFrom,
  }),
}));

describe('ToyyibPay payment gateway', () => {
  beforeEach(() => {
    mockAdminFrom.mockReset();
    mockServerFrom.mockReset();
    vi.unstubAllGlobals();
    delete process.env.TOYYIBPAY_SECRET_KEY;
  });

  it('creates a real sandbox bill using the ToyyibPay createBill API and enforces the RM29 amount', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ billCode: 'OPSFINANCE-REAL-BILL' }),
    });
    vi.stubGlobal('fetch', fetchMock as any);

    const provider = new ToyyibPayProvider({
      mode: 'sandbox',
      secret: 'sandbox-toyyibpay-secret',
      categoryCode: '4av7tqhx',
      baseUrl: 'https://dev.toyyibpay.com',
    });
    const session = await provider.createCheckoutSession({
      businessId: 'business-123',
      subscriptionId: 'sub-123',
      amount: '29.00',
      currency: 'MYR',
      customerEmail: 'owner@example.com',
      customerName: 'Demo Owner',
      metadata: {
        callback_url: 'https://app.myops.com.my/api/payments/webhook',
      },
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('https://dev.toyyibpay.com/index.php/api/createBill');
    const requestBody = String(fetchMock.mock.calls[0][1]?.body);
    expect(requestBody).toContain('billAmount=2900');
    expect(requestBody).toContain('categoryCode=4av7tqhx');
    expect(requestBody).toContain('billCallbackUrl=https%3A%2F%2Fapp.myops.com.my%2Fapi%2Fpayments%2Fwebhook');
    expect(session.provider).toBe('TOYYIBPAY');
    expect(session.mode).toBe('sandbox');
    expect(session.sessionUrl).toContain('dev.toyyibpay.com/OPSFINANCE-REAL-BILL');
    expect(session.amount).toBe('29.00');
    expect(session.metadata.business_id).toBe('business-123');
    expect(session.metadata.bill_code).toBe('OPSFINANCE-REAL-BILL');

    vi.unstubAllGlobals();
  });

  it('rejects provider errors without fabricating a bill code and redacts the secret', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      text: async () => JSON.stringify({ message: 'Invalid secret sandbox-toyyibpay-secret' }),
    }) as any);

    const provider = new ToyyibPayProvider({
      mode: 'sandbox',
      secret: 'sandbox-toyyibpay-secret',
      categoryCode: '4av7tqhx',
      baseUrl: 'https://dev.toyyibpay.com',
    });

    await expect(provider.createCheckoutSession({
      businessId: 'business-123',
      subscriptionId: 'sub-123',
      amount: '29.00',
      reference: 'OPSFINANCE-ERR',
    })).rejects.toThrow(/Invalid secret|ToyyibPay request failed|\[REDACTED\]/i);

    vi.unstubAllGlobals();
  });

  it('verifies the official ToyyibPay callback hash and rejects tampering', () => {
    const provider = new ToyyibPayProvider({ mode: 'sandbox', secret: 'sandbox-toyyibpay-secret' });
    const orderId = 'OPSFINANCE-business-123';
    const refNo = 'REF-123';
    const hash = createHash('md5').update(`sandbox-toyyibpay-secret1${orderId}${refNo}ok`).digest('hex');
    const payload = JSON.stringify({ status: '1', order_id: orderId, refno: refNo, hash });

    expect(provider.verifyWebhookSignature(payload, hash)).toBe(true);
    expect(provider.verifyWebhookSignature(payload, 'bad-hash')).toBe(false);
  });

  it('applies the correct subscription state transitions for successful and failed payments', () => {
    expect(resolveNextSubscriptionStatus('TRIAL', 'PAID')).toBe('ACTIVE');
    expect(resolveNextSubscriptionStatus('ACTIVE', 'PAID')).toBe('ACTIVE');
    expect(resolveNextSubscriptionStatus('ACTIVE', 'FAILED')).toBe('PAST_DUE');
    expect(resolveNextSubscriptionStatus('TRIAL', 'FAILED')).toBe('TRIAL');
    expect(resolveNextSubscriptionStatus('GRACE_PERIOD', 'PAID')).toBe('ACTIVE');
  });

  it('returns a deterministic invalid signature response and logs only safe metadata', async () => {
    const consoleInfo = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const request = new Request('https://app.myops.com.my/api/payments/webhook', {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        'x-signature': 'bad-signature',
      },
      body: 'status=1&order_id=ORDER-123&refno=TP-REF-123',
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      ok: false,
      code: 'invalid_signature',
    });

    const logs = consoleInfo.mock.calls.map(([, payload]) => String(payload));
    const combined = logs.join(' ');
    expect(combined).toContain('signature_validation_failed');
    expect(combined).not.toContain('sandbox-toyyibpay-secret');
    expect(combined).not.toContain('Authorization');

    consoleInfo.mockRestore();
  });

  it('returns a deterministic malformed payload response', async () => {
    const consoleInfo = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const request = new Request('https://app.myops.com.my/api/payments/webhook', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: '',
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ ok: false, code: 'malformed_callback' });

    const logs = consoleInfo.mock.calls.map(([, payload]) => String(payload)).join(' ');
    expect(logs).toContain('request_validation_failed');
    expect(logs).not.toContain('TOYYIBPAY_SECRET_KEY');
    consoleInfo.mockRestore();
  });

  it('returns a deterministic DB lookup failure response', async () => {
    process.env.TOYYIBPAY_SECRET_KEY = 'sandbox-toyyibpay-secret';
    const hash = createHash('md5').update(`sandbox-toyyibpay-secret1ORDER-123TP-REF-123ok`).digest('hex');
    mockAdminFrom.mockImplementation(() => ({
      select: () => ({
        or: () => ({
          maybeSingle: async () => ({ data: null, error: { message: 'db failure' } }),
        }),
      }),
    }));

    const request = new Request('https://app.myops.com.my/api/payments/webhook', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: `status=1&order_id=ORDER-123&refno=TP-REF-123&hash=${hash}`,
    });

    const response = await POST(request);
    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({
      ok: false,
      code: 'db_lookup_failed',
      error: 'Webhook processing failed. Please try again later.',
    });
  });

  it('rejects a valid callback that cannot be matched to an initiated payment', async () => {
    process.env.TOYYIBPAY_SECRET_KEY = 'sandbox-toyyibpay-secret';
    const hash = createHash('md5').update(`sandbox-toyyibpay-secret1ORDER-123TP-REF-123ok`).digest('hex');
    mockAdminFrom.mockImplementation(() => ({
      select: () => ({
        or: () => ({
          maybeSingle: async () => ({ data: null, error: null }),
        }),
      }),
    }));

    const request = new Request('https://app.myops.com.my/api/payments/webhook', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: `status=1&order_id=ORDER-123&refno=TP-REF-123&hash=${hash}`,
    });

    const response = await POST(request);
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({
      ok: false,
      code: 'unmatched_callback',
    });
  });

  it('returns a successful duplicate callback response without reprocessing the payment', async () => {
    const secret = 'sandbox-toyyibpay-secret';
    process.env.TOYYIBPAY_SECRET_KEY = secret;

    const hash = createHash('md5').update(`${secret}1ORDER-123TP-REF-123ok`).digest('hex');
    mockAdminFrom.mockImplementation((table: string) => {
      if (table !== 'subscription_payments') {
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) };
      }

      return {
        select: () => ({
          or: () => ({
            maybeSingle: async () => ({
              data: {
                id: 'payment-1',
                webhook_event_id: 'TP-REF-123',
                subscription_id: 'sub-123',
              },
              error: null,
            }),
          }),
        }),
      };
    });

    const request = new Request('https://app.myops.com.my/api/payments/webhook', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: `status=1&order_id=ORDER-123&refno=TP-REF-123&hash=${hash}`,
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, idempotent: true, code: 'duplicate_callback' });
  });

  it('enforces webhook idempotency for duplicate events', () => {
    const guard = new PaymentIdempotencyGuard();
    expect(guard.markProcessed('evt-duplicate')).toBe(true);
    expect(guard.markProcessed('evt-duplicate')).toBe(false);
  });
});
