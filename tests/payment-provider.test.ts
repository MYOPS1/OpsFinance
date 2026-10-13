import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { PaymentIdempotencyGuard, ToyyibPayProvider, resolveNextSubscriptionStatus } from '../packages/payments';

describe('ToyyibPay payment gateway', () => {
  it('creates a configured checkout session and enforces the RM29 amount', () => {
    const provider = new ToyyibPayProvider({
      mode: 'sandbox',
      secret: 'test-secret',
      categoryCode: 'test-category',
      baseUrl: 'https://toyyibpay.com',
    });
    const session = provider.createCheckoutSession({
      businessId: 'business-123',
      subscriptionId: 'sub-123',
      amount: '29.00',
      currency: 'MYR',
      customerEmail: 'owner@example.com',
      customerName: 'Demo Owner',
    });

    expect(session.provider).toBe('TOYYIBPAY');
    expect(session.mode).toBe('sandbox');
    expect(session.sessionUrl).toContain('toyyibpay.com');
    expect(session.amount).toBe('29.00');
    expect(session.metadata.business_id).toBe('business-123');
  });

  it('verifies the official ToyyibPay callback hash and rejects tampering', () => {
    const provider = new ToyyibPayProvider({ mode: 'sandbox', secret: 'test-secret', categoryCode: 'test-category' });
    const orderId = 'OPSFINANCE-business-123';
    const refNo = 'REF-123';
    const hash = createHash('md5').update(`test-secret1${orderId}${refNo}ok`).digest('hex');
    const payload = JSON.stringify({ status: '1', order_id: orderId, refno: refNo, hash });

    expect(provider.verifyWebhookSignature(payload, hash)).toBe(true);
    expect(provider.verifyWebhookSignature(payload, 'bad-hash')).toBe(false);
  });

  it('fails safely when payment credentials are missing', () => {
    const provider = new ToyyibPayProvider({ mode: 'sandbox', secret: '', categoryCode: '' });
    expect(() => provider.createCheckoutSession({ businessId: 'business-123', subscriptionId: 'sub-123', amount: '29.00' })).toThrow('ToyyibPay credentials are not configured. Payment onboarding required.');
    expect(provider.verifyWebhookSignature('{}', 'abc')).toBe(false);
  });

  it('applies the correct subscription state transitions for successful and failed payments', () => {
    expect(resolveNextSubscriptionStatus('TRIAL', 'PAID')).toBe('ACTIVE');
    expect(resolveNextSubscriptionStatus('ACTIVE', 'PAID')).toBe('ACTIVE');
    expect(resolveNextSubscriptionStatus('ACTIVE', 'FAILED')).toBe('PAST_DUE');
    expect(resolveNextSubscriptionStatus('TRIAL', 'FAILED')).toBe('TRIAL');
    expect(resolveNextSubscriptionStatus('GRACE_PERIOD', 'PAID')).toBe('ACTIVE');
  });

  it('enforces webhook idempotency for duplicate events', () => {
    const guard = new PaymentIdempotencyGuard();
    expect(guard.markProcessed('evt-duplicate')).toBe(true);
    expect(guard.markProcessed('evt-duplicate')).toBe(false);
  });
});
