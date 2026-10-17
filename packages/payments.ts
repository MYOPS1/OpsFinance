import { createHash, timingSafeEqual } from 'node:crypto';

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

function sanitizeToyyibPayError(error: unknown): string {
  const value = error instanceof Error ? error.message : String(error ?? '');
  const sanitized = value
    .replace(/(userSecretKey|secret)[^A-Za-z0-9_-]*[:=]?[A-Za-z0-9_-]+/gi, '$1=[REDACTED]')
    .replace(/(TOYYIBPAY_SECRET_KEY=)[^\s]+/gi, '$1[REDACTED]')
    .replace(/sandbox-toyyibpay-secret/gi, '[REDACTED]')
    .replace(/[\r\n]+/g, ' ')
    .trim();

  return sanitized || 'ToyyibPay request failed.';
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
    customerPhone?: string;
    reference?: string;
    metadata?: Record<string, string>;
  }): Promise<PaymentProviderResponse>;

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
    this.secret = options.secret ?? process.env.TOYYIBPAY_SECRET_KEY ?? (this.mode === 'live' ? '' : 'sandbox-toyyibpay-secret');
    this.categoryCode = options.categoryCode ?? process.env.TOYYIBPAY_CATEGORY_CODE ?? 'sandbox-category';
    this.baseUrl = options.baseUrl ?? process.env.TOYYIBPAY_BASE_URL ?? 'https://toyyibpay.com';
  }

  async createCheckoutSession(input: {
    businessId: string;
    subscriptionId: string;
    amount: string;
    currency?: string;
    customerEmail?: string;
    customerName?: string;
    customerPhone?: string;
    reference?: string;
    metadata?: Record<string, string>;
  }): Promise<PaymentProviderResponse> {
    if (this.mode === 'live' && !this.secret) {
      throw new Error('ToyyibPay live credentials are not configured. Payment onboarding required.');
    }

    const normalizedAmount = String(input.amount || '29.00');
    const normalizedCurrency = (input.currency || 'MYR').toUpperCase();
    const reference = input.reference || `OPSFINANCE-${input.businessId}-${input.subscriptionId}-${Date.now()}`;
    const checkoutId = `toyyibpay_${Date.now()}_${Math.random().toString(16).slice(2, 9)}`;
    const callbackUrl = input.metadata?.callback_url ?? process.env.TOYYIBPAY_CALLBACK_URL ?? `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.myops.com.my'}/api/payments/webhook`;
    const returnUrl = input.metadata?.return_url ?? process.env.TOYYIBPAY_RETURN_URL ?? `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.myops.com.my'}/settings/subscription`;
    const billAmountCents = Math.round(Number.parseFloat(normalizedAmount) * 100);

    if (!Number.isFinite(billAmountCents) || billAmountCents <= 0) {
      throw new Error('ToyyibPay bill amount must be greater than zero.');
    }

    const payload = new URLSearchParams({
      userSecretKey: this.secret,
      categoryCode: this.categoryCode,
      billName: 'OpsFinance Subscription',
      billDescription: `OpsFinance Subscription - ${reference}`,
      billPriceSetting: '1',
      billPayorInfo: '1',
      billAmount: String(billAmountCents),
      billReturnUrl: returnUrl,
      billCallbackUrl: callbackUrl,
      billExternalReferenceNo: reference,
    });

    payload.set('billTo', input.customerName || 'OpsFinance Customer');
    if (input.customerEmail) {
      payload.set('billEmail', input.customerEmail);
    }
    payload.set('billPhone', (input.customerPhone ?? '60123456789').replace(/\D/g, '').slice(0, 15) || '60123456789');

    let response: Response;

    try {
      response = await fetch(`${this.baseUrl}/index.php/api/createBill`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        },
        body: payload.toString(),
      });
    } catch (error) {
      throw new Error(sanitizeToyyibPayError(error));
    }

    const rawText = await response.text();
    const parsedResponse = this.parseCreateBillResponse(rawText);
    const billCode = this.extractBillCode(parsedResponse);

    if (!response.ok || !billCode) {
      const message = this.extractCreateBillError(parsedResponse, rawText) ?? 'ToyyibPay bill creation failed.';
      throw new Error(sanitizeToyyibPayError(message));
    }

    const metadata = {
      business_id: input.businessId,
      subscription_id: input.subscriptionId,
      bill_code: billCode,
      callback_url: callbackUrl,
      return_url: returnUrl,
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

  private parseCreateBillResponse(rawText: string): unknown {
    if (!rawText) {
      return null;
    }

    try {
      return JSON.parse(rawText);
    } catch {
      // Some ToyyibPay createBill responses are plain text, e.g. an ID or a single response row.
      return rawText;
    }
  }

  private extractBillCode(response: unknown): string | null {
    if (!response) {
      return null;
    }

    if (typeof response === 'string') {
      const trimmed = response.trim();
      if (!trimmed) {
        return null;
      }

      const normalized = trimmed.toLowerCase();
      if (['error', 'failed', 'success', 'ok', 'null', 'undefined'].includes(normalized) || normalized.includes('billto') || normalized.includes('parameter is empty')) {
        return null;
      }

      if (/^[A-Za-z0-9_-]+$/.test(trimmed) && trimmed.length >= 6) {
        return trimmed;
      }

      return null;
    }

    if (Array.isArray(response)) {
      for (const item of response) {
        const extracted = this.extractBillCode(item);
        if (extracted) {
          return extracted;
        }
      }
      return null;
    }

    if (typeof response === 'object') {
      const record = response as Record<string, unknown>;
      for (const key of ['billCode', 'BillCode', 'billcode', 'code', 'id']) {
        const value = record[key];
        if (typeof value === 'string' && value.trim()) {
          return value.trim();
        }
      }

      for (const nestedValue of Object.values(record)) {
        const extracted = this.extractBillCode(nestedValue);
        if (extracted) {
          return extracted;
        }
      }
    }

    return null;
  }

  private extractCreateBillError(response: unknown, fallback: string): string | null {
    if (!response) {
      return fallback || null;
    }

    if (typeof response === 'string') {
      const trimmed = response.trim();
      if (trimmed && /^\d+$/.test(trimmed)) {
        return null;
      }
      return trimmed || null;
    }

    if (Array.isArray(response)) {
      for (const item of response) {
        const nested = this.extractCreateBillError(item, '');
        if (nested) {
          return nested;
        }
      }
      return null;
    }

    if (typeof response === 'object') {
      const record = response as Record<string, unknown>;
      for (const key of ['message', 'error', 'status', 'code', 'detail', 'description']) {
        const value = record[key];
        if (typeof value === 'string' && value.trim()) {
          return value.trim();
        }
      }

      for (const nestedValue of Object.values(record)) {
        const nested = this.extractCreateBillError(nestedValue, '');
        if (nested) {
          return nested;
        }
      }
    }

    return null;
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
    const normalizedPayloadHash = payloadHash.toLowerCase().replace(/^md5\((.*)\)$/, '$1');
    const expectedHash = Buffer.from(expected, 'utf8');
    const receivedHash = Buffer.from(normalizedPayloadHash, 'utf8');

    return receivedHash.length === expectedHash.length && timingSafeEqual(receivedHash, expectedHash);
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
