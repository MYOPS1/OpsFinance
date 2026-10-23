/**
 * This billing service is retained for compatibility with existing platform data models,
 * but OpsFinance's standalone accounting experience intentionally does not enforce any
 * subscription, payment-status, or trial-expiry gate before allowing accounting access.
 *
 * Business membership, Supabase auth, RLS, and tenant isolation remain the only access
 * controls that affect business data. Billing data is kept isolated and is not used as an
 * authorization boundary for accounting functionality.
 */
export type PlanCode = 'STARTER';
export type SubscriptionLifecycleStatus = 'TRIAL' | 'ACTIVE' | 'PAST_DUE' | 'GRACE_PERIOD' | 'SUSPENDED' | 'CANCELLED';
export type PaymentStatus = 'INITIATED' | 'PENDING' | 'AUTHORIZED' | 'PAID' | 'FAILED' | 'CANCELLED' | 'REFUNDED';
export type AccessOperation = 'READ' | 'WRITE';
export type BillingFeature =
  | 'dashboard'
  | 'transactions'
  | 'accounts'
  | 'upload_and_convert'
  | 'reports'
  | 'reports_view'
  | 'report_print'
  | 'report_download'
  | 'report_export'
  | 'account_statement_view'
  | 'account_statement_print'
  | 'account_statement_download'
  | 'account_statement_export'
  | 'reconciliation'
  | 'settings'
  | 'accounting_rules'
  | 'multi_user'
  | 'multi_business'
  | 'advanced_ai'
  | 'payroll'
  | 'inventory'
  | 'advanced_tax'
  | 'advanced_approval';

export interface PlanDefinition {
  code: PlanCode;
  name: string;
  monthlyPrice: string;
  currency: string;
  maxBusinesses: number;
  maxUsers: number;
  graceDays: number;
  cancellationPolicy: 'PERIOD_END';
  features: BillingFeature[];
}

export interface SubscriptionRecord {
  id: string;
  businessId: string;
  ownerUserId: string;
  plan: PlanCode;
  status: SubscriptionLifecycleStatus;
  monthlyPrice: string;
  currency: string;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  nextBillingDate: string;
  trialStartedAt?: string | null;
  trialEndsAt?: string | null;
  gracePeriodStart?: string | null;
  gracePeriodEnd?: string | null;
  suspendedAt?: string | null;
  cancelledAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentRecord {
  id: string;
  subscriptionId: string;
  businessId: string;
  provider: 'INTERNAL_ABSTRACTION';
  providerEventId?: string | null;
  invoiceReference: string;
  billingPeriod: string;
  amount: string;
  currency: string;
  status: PaymentStatus;
  paymentDate?: string | null;
  failureReason?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BillingAuditEvent {
  id: string;
  businessId: string;
  actor: string;
  event: string;
  target: string;
  timestamp: string;
  metadata?: Record<string, string | number | boolean | null>;
}

export interface EntitlementContext {
  businessId: string;
  userId: string;
  operation?: AccessOperation;
}

export interface BillingConfiguration {
  monthlyPrice: string;
  currency: string;
  graceDays: number;
  cancellationPolicy: 'PERIOD_END';
  providerConfigured: boolean;
  liveSupabaseUat: 'BLOCKED' | 'NOT_AVAILABLE';
  livePaymentProvider: 'NOT_CONFIGURED';
}

export const STARTER_PLAN: PlanDefinition = {
  code: 'STARTER',
  name: 'Starter',
  monthlyPrice: '29.00',
  currency: 'MYR',
  maxBusinesses: 1,
  maxUsers: 1,
  graceDays: 7,
  cancellationPolicy: 'PERIOD_END',
  features: [
    'dashboard',
    'transactions',
    'accounts',
    'upload_and_convert',
    'reports',
    'reports_view',
    'report_print',
    'report_download',
    'report_export',
    'account_statement_view',
    'account_statement_print',
    'account_statement_download',
    'account_statement_export',
    'reconciliation',
    'settings',
    'accounting_rules',
  ],
};

export const DEFAULT_BILLING_CONFIGURATION: BillingConfiguration = {
  monthlyPrice: '29.00',
  currency: 'MYR',
  graceDays: 7,
  cancellationPolicy: 'PERIOD_END',
  providerConfigured: false,
  liveSupabaseUat: 'BLOCKED',
  livePaymentProvider: 'NOT_CONFIGURED',
};

const TRANSITIONS: Record<SubscriptionLifecycleStatus, SubscriptionLifecycleStatus[]> = {
  TRIAL: ['ACTIVE', 'PAST_DUE', 'CANCELLED'],
  ACTIVE: ['ACTIVE', 'PAST_DUE', 'CANCELLED'],
  PAST_DUE: ['ACTIVE', 'GRACE_PERIOD'],
  GRACE_PERIOD: ['ACTIVE', 'SUSPENDED'],
  SUSPENDED: ['ACTIVE'],
  CANCELLED: [],
};

export class SubscriptionService {
  private readonly subscriptions = new Map<string, SubscriptionRecord>();
  private readonly businessSubscriptionById = new Map<string, string>();
  private readonly membersByBusiness = new Map<string, Map<string, 'OWNER' | 'ADMIN' | 'ACCOUNTANT' | 'STAFF' | 'VIEWER'>>();
  private readonly paymentsBySubscription = new Map<string, PaymentRecord[]>();
  private readonly paymentsByEventId = new Map<string, PaymentRecord>();
  private readonly paymentIdempotency = new Map<string, string>();
  private readonly auditTrail = new Map<string, BillingAuditEvent[]>();
  private readonly renewedPeriods = new Set<string>();
  private readonly config: BillingConfiguration;

  constructor(config: Partial<BillingConfiguration> = {}) {
    this.config = { ...DEFAULT_BILLING_CONFIGURATION, ...config };
  }

  private isBillingEnforced(): boolean {
    return this.config.providerConfigured === true;
  }

  getConfig(): BillingConfiguration {
    return { ...this.config };
  }

  getPlanDefinition(plan: PlanCode): PlanDefinition {
    if (plan !== 'STARTER') {
      throw new Error(`Unsupported plan: ${plan}`);
    }
    return STARTER_PLAN;
  }

  private hasSuccessfulPaidPayment(subscriptionId: string): boolean {
    return (this.paymentsBySubscription.get(subscriptionId) ?? []).some((payment) => payment.status === 'PAID');
  }

  private isTrialActiveRecord(subscription: SubscriptionRecord): boolean {
    if (subscription.status === 'CANCELLED' || subscription.status === 'SUSPENDED') {
      return false;
    }

    if (!subscription.trialEndsAt || this.hasSuccessfulPaidPayment(subscription.id)) {
      return false;
    }

    const endsAt = new Date(subscription.trialEndsAt).getTime();
    return Number.isFinite(endsAt) && Date.now() < endsAt;
  }

  private syncSubscriptionLifecycle(subscription: SubscriptionRecord): void {
    if (subscription.status === 'CANCELLED' || subscription.status === 'SUSPENDED') {
      return;
    }

    if (this.hasSuccessfulPaidPayment(subscription.id)) {
      if (['ACTIVE', 'TRIAL', 'PAST_DUE'].includes(subscription.status)) {
        subscription.status = 'ACTIVE';
        subscription.trialEndsAt = null;
        subscription.updatedAt = new Date().toISOString();
      }
      return;
    }

    if (subscription.trialEndsAt && ['ACTIVE', 'TRIAL'].includes(subscription.status)) {
      const endsAt = new Date(subscription.trialEndsAt).getTime();
      if (Number.isFinite(endsAt) && Date.now() >= endsAt) {
        subscription.status = 'PAST_DUE';
        subscription.updatedAt = new Date().toISOString();
      }
    }
  }

  getBusinessSubscription(businessId: string, actor?: string): SubscriptionRecord {
    if (actor) this.assertBusinessMember(businessId, actor);
    const subscriptionId = this.businessSubscriptionById.get(businessId);
    if (!subscriptionId) {
      throw new Error('Subscription not found for business.');
    }
    const subscription = this.subscriptions.get(subscriptionId);
    if (!subscription) {
      throw new Error('Subscription record missing.');
    }
    this.syncSubscriptionLifecycle(subscription);
    return { ...subscription };
  }

  getTrialState(businessId: string, actor?: string): {
    businessId: string;
    isActive: boolean;
    daysRemaining: number;
    startedAt: string | null;
    endsAt: string | null;
    status: SubscriptionLifecycleStatus;
  } {
    const subscription = this.getBusinessSubscription(businessId, actor);
    const endsAt = subscription.trialEndsAt ?? null;
    const startedAt = subscription.trialStartedAt ?? null;
    const isActive = this.isTrialActiveRecord(subscription);
    const daysRemaining = endsAt ? Math.max(0, Math.ceil((new Date(endsAt).getTime() - Date.now()) / 86400000)) : 0;

    return {
      businessId,
      isActive,
      daysRemaining,
      startedAt,
      endsAt,
      status: subscription.status,
    };
  }

  getFeatureAccessMessage(feature: BillingFeature): string {
    const detailMap: Partial<Record<BillingFeature, string>> = {
      report_print: 'Standalone accounting access is enabled; billing gates are disabled for this application.',
      report_download: 'Standalone accounting access is enabled; billing gates are disabled for this application.',
      report_export: 'Standalone accounting access is enabled; billing gates are disabled for this application.',
      account_statement_print: 'Standalone accounting access is enabled; billing gates are disabled for this application.',
      account_statement_download: 'Standalone accounting access is enabled; billing gates are disabled for this application.',
      account_statement_export: 'Standalone accounting access is enabled; billing gates are disabled for this application.',
      reconciliation: 'Standalone accounting access is enabled; billing gates are disabled for this application.',
    };

    return detailMap[feature] ?? 'Standalone accounting access is enabled; billing gates are disabled for this application.';
  }

  getEntitlementSummary(businessId: string, actor?: string): {
    businessId: string;
    trial: ReturnType<SubscriptionService['getTrialState']>;
    price: string;
    currency: string;
    isTrialActive: boolean;
  } {
    const trial = this.getTrialState(businessId, actor);
    return {
      businessId,
      trial,
      price: `${STARTER_PLAN.monthlyPrice} / month / company`,
      currency: STARTER_PLAN.currency,
      isTrialActive: trial.isActive,
    };
  }

  getAuditTrail(subscriptionId: string, actor?: string): BillingAuditEvent[] {
    const subscription = this.getSubscription(subscriptionId);
    if (actor) this.assertBusinessMember(subscription.businessId, actor);
    return [...(this.auditTrail.get(subscriptionId) ?? [])];
  }

  getPaymentHistory(subscriptionId: string, actor?: string): PaymentRecord[] {
    const subscription = this.getSubscription(subscriptionId);
    if (actor) this.assertBusinessMember(subscription.businessId, actor);
    return [...(this.paymentsBySubscription.get(subscriptionId) ?? [])];
  }

  private setAuditEvent(subscriptionId: string, businessId: string, actor: string, event: string, target: string, metadata: Record<string, string | number | boolean | null> = {}): void {
    const trail = this.auditTrail.get(subscriptionId) ?? [];
    trail.push({ id: `billing-audit-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`, businessId, actor, event, target, timestamp: new Date().toISOString(), metadata });
    this.auditTrail.set(subscriptionId, trail);
  }

  private getSubscription(subscriptionId: string): SubscriptionRecord {
    const subscription = this.subscriptions.get(subscriptionId);
    if (!subscription) throw new Error('Subscription not found.');
    return subscription;
  }

  private assertBusinessMember(businessId: string, actor: string): void {
    const members = this.membersByBusiness.get(businessId);
    if (!members?.has(actor)) {
      throw new Error('Business access denied.');
    }
  }

  private assertBusinessOwnerForSubscription(subscription: SubscriptionRecord, actor: string): void {
    this.assertBusinessMember(subscription.businessId, actor);
    if (subscription.ownerUserId !== actor) {
      throw new Error('Business access denied.');
    }
  }

  private recordDeniedAccess(businessId: string, actor: string, event: string, target: string): void {
    const subscriptionId = this.businessSubscriptionById.get(businessId);
    if (subscriptionId) this.setAuditEvent(subscriptionId, businessId, actor, event, target, { allowed: false });
  }

  private assertStatusTransition(from: SubscriptionLifecycleStatus, to: SubscriptionLifecycleStatus): void {
    if (from === to) {
      return;
    }
    const allowed = TRANSITIONS[from] ?? [];
    if (!allowed.includes(to)) {
      throw new Error(`Invalid subscription transition from ${from} to ${to}.`);
    }
  }

  private assertBusinessOwner(businessId: string, userId: string): void {
    const subscription = this.businessSubscriptionById.get(businessId);
    if (!subscription) {
      throw new Error('No subscription registered for business.');
    }
    const record = this.subscriptions.get(subscription);
    if (!record) {
      throw new Error('Subscription record missing.');
    }
    if (record.ownerUserId !== userId) {
      throw new Error('User is not the subscription owner for this business.');
    }
  }

  private ensureStarterBusinessLimit(businessId: string, userId: string): void {
    const existingSubscription = this.businessSubscriptionById.get(businessId);
    if (existingSubscription) {
      return;
    }

    const businessCount = this.businessSubscriptionById.size;
    if (businessCount >= STARTER_PLAN.maxBusinesses) {
      throw new Error('Starter plan allows only one business.');
    }

    const memberSet = this.membersByBusiness.get(businessId) ?? new Set<string>();
    if (!memberSet.has(userId) && memberSet.size >= STARTER_PLAN.maxUsers) {
      throw new Error('Starter plan allows only one active user.');
    }
  }

  registerBusiness(businessId: string, ownerUserId: string): SubscriptionRecord {
    const existing = this.businessSubscriptionById.get(businessId);
    if (existing) {
      const existingSubscription = this.getSubscription(existing);
      if (existingSubscription.ownerUserId !== ownerUserId) throw new Error('Business access denied.');
      return { ...existingSubscription };
    }

    this.ensureStarterBusinessLimit(businessId, ownerUserId);

    const now = new Date().toISOString();
    const subscription: SubscriptionRecord = {
      id: `sub-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      businessId,
      ownerUserId,
      plan: 'STARTER',
      status: 'ACTIVE',
      monthlyPrice: STARTER_PLAN.monthlyPrice,
      currency: STARTER_PLAN.currency,
      currentPeriodStart: now,
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      nextBillingDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      trialStartedAt: now,
      trialEndsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      gracePeriodStart: null,
      gracePeriodEnd: null,
      suspendedAt: null,
      cancelledAt: null,
      createdAt: now,
      updatedAt: now,
    };

    this.subscriptions.set(subscription.id, subscription);
    this.businessSubscriptionById.set(businessId, subscription.id);
    const activeMembers = this.membersByBusiness.get(businessId) ?? new Map<string, 'OWNER' | 'ADMIN' | 'ACCOUNTANT' | 'STAFF' | 'VIEWER'>();
    activeMembers.set(ownerUserId, 'OWNER');
    this.membersByBusiness.set(businessId, activeMembers);

    this.setAuditEvent(subscription.id, businessId, ownerUserId, 'subscription_created', subscription.id, {
      plan: subscription.plan,
      status: subscription.status,
      monthlyPrice: subscription.monthlyPrice,
      currency: subscription.currency,
    });
    this.setAuditEvent(subscription.id, businessId, ownerUserId, 'subscription_activated', subscription.id, {
      plan: subscription.plan,
      status: 'ACTIVE',
    });
    return { ...subscription };
  }

  addBusinessMember(businessId: string, userId: string, role: 'OWNER' | 'ADMIN' | 'ACCOUNTANT' | 'STAFF' | 'VIEWER' = 'VIEWER', actor?: string): void {
    const subscriptionId = this.businessSubscriptionById.get(businessId);
    if (!subscriptionId) {
      throw new Error('Business is not subscribed.');
    }

    const subscription = this.getSubscription(subscriptionId);
    const actingUser = actor ?? subscription.ownerUserId;
    this.assertBusinessOwnerForSubscription(subscription, actingUser);
    const current = this.membersByBusiness.get(businessId) ?? new Map<string, 'OWNER' | 'ADMIN' | 'ACCOUNTANT' | 'STAFF' | 'VIEWER'>();
    const plan = subscription.plan;
    if (plan === 'STARTER' && !current.has(userId) && current.size >= STARTER_PLAN.maxUsers) {
      this.recordDeniedAccess(businessId, actingUser, 'user_limit_denied', userId);
      throw new Error('Starter plan allows only one active user on the business.');
    }

    current.set(userId, role);
    this.membersByBusiness.set(businessId, current);
    this.setAuditEvent(subscription.id, businessId, userId, 'member_added', userId, { role, businessId });
  }

  assertFeatureAccess(businessId: string, feature: BillingFeature, actor: string, operation: AccessOperation = 'WRITE'): void {
    if (!actor) {
      throw new Error('Business access denied.');
    }

    const subscriptionId = this.businessSubscriptionById.get(businessId);
    if (subscriptionId) {
      const subscription = this.getSubscription(subscriptionId);
      this.assertBusinessMember(subscription.businessId, actor);
      this.setAuditEvent(subscription.id, businessId, actor, 'feature_access_checked', feature, {
        allowed: true,
        feature,
        operation,
        billing_disabled: true,
        standalone: true,
      });
      return;
    }

    this.assertBusinessMember(businessId, actor);
    this.setAuditEvent(`standalone-${businessId}`, businessId, actor, 'feature_access_checked', feature, { allowed: true, feature, operation, standalone: true });
  }

  canAccess(feature: BillingFeature, context: EntitlementContext): boolean {
    try {
      this.assertFeatureAccess(context.businessId, feature, context.userId, context.operation ?? 'READ');
      return true;
    } catch {
      return false;
    }
  }

  transitionStatus(subscriptionId: string, nextStatus: SubscriptionLifecycleStatus, actor: string): SubscriptionRecord {
    const subscription = this.getSubscription(subscriptionId);
    this.assertBusinessOwnerForSubscription(subscription, actor);
    if (nextStatus === 'ACTIVE' && subscription.status === 'SUSPENDED') {
      throw new Error('Suspended subscriptions require payment-backed reactivation.');
    }

    this.assertStatusTransition(subscription.status, nextStatus);
    subscription.status = nextStatus;
    subscription.updatedAt = new Date().toISOString();

    if (nextStatus === 'PAST_DUE') {
      subscription.gracePeriodStart = null;
      subscription.gracePeriodEnd = null;
    }
    if (nextStatus === 'GRACE_PERIOD') {
      const graceStart = new Date().toISOString();
      subscription.gracePeriodStart = graceStart;
      subscription.gracePeriodEnd = new Date(Date.now() + this.config.graceDays * 24 * 60 * 60 * 1000).toISOString();
    }
    if (nextStatus === 'SUSPENDED') {
      subscription.suspendedAt = new Date().toISOString();
    }
    if (nextStatus === 'CANCELLED') {
      subscription.cancelledAt = new Date().toISOString();
    }

    const eventName = nextStatus === 'GRACE_PERIOD' ? 'grace_period_started' : `subscription_${nextStatus.toLowerCase()}`;
    this.setAuditEvent(subscription.id, subscription.businessId, actor, eventName, subscription.id, {
      plan: subscription.plan,
      status: nextStatus,
    });
    return { ...subscription };
  }

  reactivateSubscription(subscriptionId: string, actor: string): SubscriptionRecord {
    const subscription = this.getSubscription(subscriptionId);
    this.assertBusinessOwnerForSubscription(subscription, actor);

    const allowedStatuses: SubscriptionLifecycleStatus[] = ['PAST_DUE', 'GRACE_PERIOD', 'SUSPENDED'];
    if (!allowedStatuses.includes(subscription.status)) {
      throw new Error(`Reactivation requires status in ${allowedStatuses.join(', ')}.`);
    }
    if (subscription.status === 'SUSPENDED') {
      const hasPaidPayment = (this.paymentsBySubscription.get(subscriptionId) ?? []).some((payment) => payment.status === 'PAID');
      if (!hasPaidPayment) {
        throw new Error('Reactivation requires a successful payment.');
      }
    }
    subscription.status = 'ACTIVE';
    subscription.gracePeriodStart = null;
    subscription.gracePeriodEnd = null;
    subscription.suspendedAt = null;
    subscription.updatedAt = new Date().toISOString();
    this.setAuditEvent(subscription.id, subscription.businessId, actor, 'subscription_reactivated', subscription.id, {
      status: 'ACTIVE',
      plan: subscription.plan,
    });
    return { ...subscription };
  }

  initiatePayment(subscriptionId: string, invoiceReference: string, amount: string, currency: string, actor: string, providerEventId?: string): PaymentRecord {
    const subscription = this.getSubscription(subscriptionId);
    this.assertBusinessOwnerForSubscription(subscription, actor);
    if (amount !== subscription.monthlyPrice || currency.toUpperCase() !== subscription.currency) {
      throw new Error('Payment amount or currency does not match the subscription.');
    }

    const key = providerEventId ?? invoiceReference;
    if (this.paymentIdempotency.has(key)) {
      return this.paymentsByEventId.get(key)!;
    }

    const payment: PaymentRecord = {
      id: `pay-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      subscriptionId,
      businessId: subscription.businessId,
      provider: 'INTERNAL_ABSTRACTION',
      providerEventId: providerEventId ?? null,
      invoiceReference,
      billingPeriod: `${subscription.currentPeriodStart}::${subscription.currentPeriodEnd}`,
      amount,
      currency,
      status: 'INITIATED',
      paymentDate: null,
      failureReason: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.paymentIdempotency.set(key, payment.id);
    this.paymentsByEventId.set(key, payment);
    const history = this.paymentsBySubscription.get(subscriptionId) ?? [];
    history.push(payment);
    this.paymentsBySubscription.set(subscriptionId, history);
    this.setAuditEvent(subscription.id, subscription.businessId, actor, 'payment_initiated', payment.id, {
      invoiceReference,
      amount,
      currency,
      status: 'INITIATED',
    });
    return { ...payment };
  }

  recordPaymentStatus(subscriptionId: string, providerEventId: string, status: PaymentStatus, actor: string, failureReason?: string): PaymentRecord {
    const subscription = this.getSubscription(subscriptionId);
    this.assertBusinessOwnerForSubscription(subscription, actor);

    const payment = [...(this.paymentsBySubscription.get(subscriptionId) ?? [])].find((entry) => entry.providerEventId === providerEventId)
      ?? this.paymentsByEventId.get(providerEventId)
      ?? [...(this.paymentsBySubscription.get(subscriptionId) ?? [])].find((entry) => entry.id === providerEventId);

    if (payment && payment.subscriptionId !== subscriptionId) {
      throw new Error('Payment event not found.');
    }

    if (!payment) {
      const fallbackPayment: PaymentRecord = {
        id: `pay-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
        subscriptionId,
        businessId: subscription.businessId,
        provider: 'INTERNAL_ABSTRACTION',
        providerEventId,
        invoiceReference: `invoice-${providerEventId}`,
        billingPeriod: `${subscription.currentPeriodStart}::${subscription.currentPeriodEnd}`,
        amount: '0.00',
        currency: subscription.currency,
        status: 'INITIATED',
        paymentDate: null,
        failureReason: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      this.paymentIdempotency.set(providerEventId, fallbackPayment.id);
      this.paymentsByEventId.set(providerEventId, fallbackPayment);
      const history = this.paymentsBySubscription.get(subscriptionId) ?? [];
      history.push(fallbackPayment);
      this.paymentsBySubscription.set(subscriptionId, history);
      this.setAuditEvent(subscription.id, subscription.businessId, actor, 'payment_initiated', fallbackPayment.id, {
        invoiceReference: fallbackPayment.invoiceReference,
        amount: fallbackPayment.amount,
        currency: fallbackPayment.currency,
        status: 'INITIATED',
      });
      return this.recordPaymentStatus(subscriptionId, providerEventId, status, actor, failureReason);
    }

    if (payment.status === status) {
      return { ...payment };
    }

    payment.status = status;
    payment.updatedAt = new Date().toISOString();
    if (status === 'PAID') {
      payment.paymentDate = new Date().toISOString();

      if (['ACTIVE', 'TRIAL', 'PAST_DUE', 'GRACE_PERIOD'].includes(subscription.status)) {
        subscription.status = 'ACTIVE';
        subscription.trialEndsAt = null;
        subscription.trialStartedAt = null;
        subscription.gracePeriodStart = null;
        subscription.gracePeriodEnd = null;
        subscription.suspendedAt = null;
        subscription.updatedAt = new Date().toISOString();
      }
    }
    if (failureReason) {
      payment.failureReason = failureReason;
    }

    this.paymentsByEventId.set(providerEventId, payment);
    this.paymentIdempotency.set(providerEventId, payment.id);

    this.setAuditEvent(subscription.id, subscription.businessId, actor, status === 'PAID' ? 'payment_succeeded' : status === 'FAILED' ? 'payment_failed' : 'payment_state_updated', payment.id, {
      status,
      providerEventId,
      failureReason: failureReason ?? '',
    });

    return { ...payment };
  }

  renewSubscription(subscriptionId: string, actor: string): SubscriptionRecord {
    const subscription = this.getSubscription(subscriptionId);
    this.assertBusinessOwnerForSubscription(subscription, actor);

    const payment = this.paymentsBySubscription.get(subscriptionId)?.find((entry) => entry.status === 'PAID') ?? null;
    if (!payment) {
      this.transitionStatus(subscriptionId, 'PAST_DUE', actor);
      this.setAuditEvent(subscription.id, subscription.businessId, actor, 'renewal_failed', subscription.id, { plan: subscription.plan, status: 'PAST_DUE' });
      return { ...this.subscriptions.get(subscriptionId)! };
    }

    const renewalKey = `${subscription.id}:${payment.id}`;
    if (this.renewedPeriods.has(renewalKey)) return { ...subscription };

    const oldPeriodEnd = new Date(subscription.currentPeriodEnd);
    const now = new Date();
    subscription.currentPeriodStart = subscription.currentPeriodEnd;
    subscription.currentPeriodEnd = new Date(oldPeriodEnd.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
    subscription.nextBillingDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
    subscription.status = 'ACTIVE';
    subscription.trialStartedAt = null;
    subscription.trialEndsAt = null;
    subscription.gracePeriodStart = null;
    subscription.gracePeriodEnd = null;
    subscription.suspendedAt = null;
    subscription.cancelledAt = null;
    subscription.updatedAt = new Date().toISOString();
    this.renewedPeriods.add(renewalKey);
    this.setAuditEvent(subscription.id, subscription.businessId, actor, 'renewal_succeeded', subscription.id, {
      plan: subscription.plan,
      nextBillingDate: subscription.nextBillingDate,
    });
    return { ...subscription };
  }

  failRenewal(subscriptionId: string, actor: string, reason: string): SubscriptionRecord {
    const subscription = this.getSubscription(subscriptionId);
    this.assertBusinessOwnerForSubscription(subscription, actor);
    if (subscription.status === 'ACTIVE') {
      this.transitionStatus(subscriptionId, 'PAST_DUE', actor);
    }
    const payment = this.paymentsBySubscription.get(subscriptionId)?.at(-1);
    if (payment) {
      payment.failureReason = reason;
      payment.status = 'FAILED';
      payment.updatedAt = new Date().toISOString();
    }
    this.setAuditEvent(subscription.id, subscription.businessId, actor, 'renewal_failed', subscription.id, { reason });
    return { ...this.subscriptions.get(subscriptionId)! };
  }

  cancelSubscription(subscriptionId: string, actor: string, effectiveAt: 'IMMEDIATE' | 'PERIOD_END' = 'PERIOD_END'): SubscriptionRecord {
    const subscription = this.getSubscription(subscriptionId);
    this.assertBusinessOwnerForSubscription(subscription, actor);

    if (effectiveAt === 'PERIOD_END') {
      this.assertStatusTransition(subscription.status, 'CANCELLED');
      subscription.status = 'CANCELLED';
      subscription.cancelledAt = new Date().toISOString();
      subscription.updatedAt = new Date().toISOString();
      this.setAuditEvent(subscription.id, subscription.businessId, actor, 'subscription_cancelled', subscription.id, {
        cancellationPolicy: this.config.cancellationPolicy,
      });
      return { ...subscription };
    }

    this.assertStatusTransition(subscription.status, 'CANCELLED');
    subscription.status = 'CANCELLED';
    subscription.cancelledAt = new Date().toISOString();
    this.setAuditEvent(subscription.id, subscription.businessId, actor, 'subscription_cancelled', subscription.id, {
      cancellationPolicy: this.config.cancellationPolicy,
    });
    return { ...subscription };
  }

  async validateSubscriptionAndAccess(businessId: string, feature: BillingFeature, actor: string): Promise<boolean> {
    try {
      this.assertFeatureAccess(businessId, feature, actor);
      return true;
    } catch {
      return false;
    }
  }
}

export const subscriptionFeatureMatrix: Record<PlanCode, BillingFeature[]> = {
  STARTER: STARTER_PLAN.features,
};

export const PLATFORM_FINANCE_POLICY = {
  description: 'Platform billing is separate from business accounting. Subscription charges do not create business journal entries or financial statements.',
  businessAccountingIsolation: true,
};

export const LIVE_PROVIDER_STATUS = {
  liveSupabaseUat: 'BLOCKED / NOT AVAILABLE',
  livePaymentProvider: 'NOT CONFIGURED',
};
