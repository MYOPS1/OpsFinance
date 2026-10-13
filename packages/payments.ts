import { createHash } from 'node:crypto';

export type PaymentProviderName = 'TOYYIBPAY' | 'CURLEC';
export type PaymentProviderMode = 'sandbox' | 'live';
export type PaymentStatus = 'INITIATED' | 'PENDING' | 'AUTHORIZED' | 'PAID' | 'FAILED' | 'CANCELLED' | 'REFUNDED';

export interface PaymentProviderResponse {
  provider: PaymentProviderName;
  checkoutId: string;
  sessionUrl: string;
  providerReference: string;
  amount: string;
  currency: string;
  mode: PaymentProviderMode;
  status: 'INITIATED' | 'PENDING';
  metadata: Record<string, string>;
}

export interface PaymentWebhookEvent {
  provider: PaymentProviderName;
  eventId: string;
  status: PaymentStatus;
  amount: string;
  currency: string;
  reference: string;
  businessId: string;
  subscriptionId: string;
  failureReason?: string | null;
  raw: unknown;
}

export interface PaymentProviderOptions {
  mode?: PaymentProviderMode;
  secret?: string;
  categoryCode?: string;
  baseUrl?: string;
}

export abstract class PaymentProvider {
  public abstract readonly providerName: PaymentProviderName;
  public abstract readonly mode: PaymentProviderMode;

  public abstract createCheckoutSession(input: {
    businessId: string;
    subscriptionId: string;
    amount: string;
    currency?: string;
    customerEmail?: string;
    customerName?: string;
    reference?: string;
    metadata?: Record<string, string>;
  }): PaymentProviderResponse;

  public abstract verifyWebhookSignature(rawBody: string, signatureHeader?: string | null): boolean;

  public abstract parseWebhookEvent(payload: unknown): PaymentWebhookEvent;
}

export class ToyyibPayProvider extends PaymentProvider {
  public readonly providerName: PaymentProviderName = 'TOYYIBPAY';
  public readonly mode: PaymentProviderMode;
  private readonly secret: string;
  private readonly categoryCode: string;
  private readonly baseUrl: string;

  constructor(options: PaymentProviderOptions = {}) {
    super();
    this.mode = options.mode ?? 'sandbox';
    this.secret = options.secret ?? process.env.TOYYIBPAY_SECRET_KEY ?? '';
    this.categoryCode = options.categoryCode ?? process.env.TOYYIBPAY_CATEGORY_CODE ?? '';
    this.baseUrl = options.baseUrl ?? process.env.TOYYIBPAY_BASE_URL ?? 'https://toyyibpay.com';
  }

  createCheckoutSession(input: {
    businessId: string;
    subscriptionId: string;
    amount: string;
    currency?: string;
    customerEmail?: string;
    customerName?: string;
    reference?: string;
    metadata?: Record<string, string>;
  }): PaymentProviderResponse {
    if (!this.secret || !this.categoryCode) {
      throw new Error('ToyyibPay credentials are not configured. Payment onboarding required.');
    }

    const normalizedAmount = String(input.amount || '29.00');
    const normalizedCurrency = (input.currency || 'MYR').toUpperCase();
    const reference = input.reference || `OPSFINANCE-${input.businessId}-${input.subscriptionId}-${Date.now()}`;
    const checkoutId = `toyyibpay_${Date.now()}_${Math.random().toString(16).slice(2, 9)}`;
    const billCode = reference.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24) || checkoutId;
    const metadata = {
      business_id: input.businessId,
      subscription_id: input.subscriptionId,
      bill_code: billCode,
      ...(input.metadata ?? {}),
    };

    return {
      provider: 'TOYYIBPAY',
      checkoutId,
      sessionUrl: `${this.baseUrl}/${billCode}`,
      providerReference: reference,
      amount: normalizedAmount,
      currency: normalizedCurrency,
      mode: this.mode,
      status: 'INITIATED',
      metadata,
    };
  }

  verifyWebhookSignature(rawBody: string, signatureHeader?: string | null): boolean {
    const signature = (signatureHeader ?? '').trim();
    if (!this.secret) {
      return false;
    }

    const parsed = this.parsePayload(rawBody);
    const payloadHash = signature || String(parsed.hash ?? '').trim();
    if (!payloadHash) {
      return false;
    }

    const status = String(parsed.status ?? '0');
    const orderId = String(parsed.order_id ?? parsed.orderId ?? '');
    const refNo = String(parsed.refno ?? parsed.refNo ?? parsed.reference ?? '');
    const expected = createHash('md5').update(`${this.secret}${status}${orderId}${refNo}ok`).digest('hex');
    return payloadHash.toLowerCase() === expected.toLowerCase() || payloadHash.toLowerCase() === `md5(${expected})`;
  }

  parseWebhookEvent(payload: unknown): PaymentWebhookEvent {
    const event = (payload ?? {}) as Record<string, any>;
    const statusValue = Number(event.status ?? event.payment_status ?? 0);
    const normalizedStatus: PaymentStatus =
      statusValue === 1 ? 'PAID'
      : statusValue === 2 ? 'PENDING'
      : statusValue === 3 ? 'FAILED'
      : 'INITIATED';
    const reference = String(event.order_id ?? event.reference ?? event.refno ?? event.bill_external_reference_no ?? event.id ?? 'toyyibpay');
    const eventId = String(event.refno ?? event.billcode ?? event.transaction_id ?? event.id ?? `toyyibpay-${Date.now()}`);

    return {
      provider: 'TOYYIBPAY',
      eventId,
      status: normalizedStatus,
      amount: String(event.amount ?? event.billpaymentamount ?? event.billpaymentAmount ?? '29.00'),
      currency: String(event.currency ?? 'MYR'),
      reference,
      businessId: String(event.business_id ?? event.metadata?.business_id ?? ''),
      subscriptionId: String(event.subscription_id ?? event.metadata?.subscription_id ?? ''),
      failureReason: event.reason ?? event.failure_reason ?? null,
      raw: payload,
    };
  }

  private parsePayload(rawBody: string): Record<string, string> {
    if (!rawBody) {
      return {};
    }

    try {
      const parsed = JSON.parse(rawBody) as Record<string, unknown>;
      if (parsed && typeof parsed === 'object') {
        return Object.fromEntries(Object.entries(parsed).map(([key, value]) => [key, String(value ?? '')]));
      }
    } catch {
      // ignore and fall back to URL-encoded form parsing
    }

    const params = new URLSearchParams(rawBody);
    return Object.fromEntries(Array.from(params.entries()).map(([key, value]) => [key, value]));
  }
}

export class CurlecPaymentProvider extends ToyyibPayProvider {
  public override readonly providerName: PaymentProviderName = 'CURLEC';
}

export function resolveNextSubscriptionStatus(currentStatus: string, paymentStatus: PaymentStatus): string {
  if (paymentStatus === 'PAID') {
    return 'ACTIVE';
  }

  if (paymentStatus === 'FAILED' && currentStatus === 'ACTIVE') {
    return 'PAST_DUE';
  }

  if (paymentStatus === 'FAILED' && currentStatus === 'TRIAL') {
    return 'TRIAL';
  }

  if (paymentStatus === 'CANCELLED') {
    return 'CANCELLED';
  }

  return currentStatus;
}

export class PaymentIdempotencyGuard {
  private readonly processed = new Set<string>();

  public markProcessed(eventId: string): boolean {
    if (this.processed.has(eventId)) {
      return false;
    }
    this.processed.add(eventId);
    return true;
  }
}
