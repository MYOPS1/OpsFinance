import { describe, expect, it } from 'vitest';

import { AccountingEngine } from '../packages/accounting';
import { BusinessService } from '../packages/business';
import { PLATFORM_FINANCE_POLICY, STARTER_PLAN, SubscriptionService } from '../packages/subscriptions';
import { TransactionService } from '../packages/transactions';

describe('Phase 8 subscription and billing', () => {
  it('defines the locked Starter plan and lifecycle states', () => {
    const service = new SubscriptionService();
    const plan = service.getPlanDefinition('STARTER');

    expect(plan.monthlyPrice).toBe('29.00');
    expect(plan.currency).toBe('MYR');
    expect(plan.maxBusinesses).toBe(1);
    expect(plan.maxUsers).toBe(1);
    expect(plan.features).toContain('dashboard');
    expect(plan.features).toContain('upload_and_convert');
    expect(plan.features).not.toContain('multi_business');
    expect(plan.features).not.toContain('advanced_ai');
    expect(STARTER_PLAN.monthlyPrice).toBe('29.00');
  });

  it('enforces the exact subscription lifecycle and rejects invalid transitions', () => {
    const service = new SubscriptionService();
    const subscription = service.registerBusiness('business-a', 'user-a');

    expect(subscription.status).toBe('ACTIVE');

    service.transitionStatus(subscription.id, 'PAST_DUE', 'user-a');
    expect(service.getBusinessSubscription('business-a').status).toBe('PAST_DUE');

    service.transitionStatus(subscription.id, 'GRACE_PERIOD', 'user-a');
    expect(service.getBusinessSubscription('business-a').status).toBe('GRACE_PERIOD');

    service.transitionStatus(subscription.id, 'SUSPENDED', 'user-a');
    service.initiatePayment(subscription.id, 'INV-REACTIVATE', '29.00', 'MYR', 'user-a', 'evt-reactivate');
    service.recordPaymentStatus(subscription.id, 'evt-reactivate', 'PAID', 'user-a');
    expect(service.getBusinessSubscription('business-a').status).toBe('SUSPENDED');

    service.reactivateSubscription(subscription.id, 'user-a');
    expect(service.getBusinessSubscription('business-a').status).toBe('ACTIVE');

    service.transitionStatus(subscription.id, 'CANCELLED', 'user-a');
    expect(service.getBusinessSubscription('business-a').status).toBe('CANCELLED');

    expect(() => service.transitionStatus(subscription.id, 'ACTIVE', 'user-a')).toThrow();
    expect(() => service.transitionStatus(subscription.id, 'PAST_DUE', 'user-a')).toThrow();
  });

  it('enforces Starter limits for business and user membership', () => {
    const service = new SubscriptionService();
    const businessA = service.registerBusiness('business-a', 'user-a');

    expect(service.getBusinessSubscription('business-a').id).toBe(businessA.id);
    expect(() => service.registerBusiness('business-b', 'user-b')).toThrow('Starter plan allows only one business.');

    service.addBusinessMember('business-a', 'user-a');
    expect(() => service.addBusinessMember('business-a', 'user-b')).toThrow('Starter plan allows only one active user on the business.');
  });

  it('allows core accounting features when billing is not configured and keeps the gate available for future provider-backed deployments', () => {
    const service = new SubscriptionService();
    service.registerBusiness('business-a', 'user-a');

    expect(service.getBusinessSubscription('business-a').plan).toBe('STARTER');
    expect(() => service.assertFeatureAccess('business-a', 'multi_business', 'user-a')).not.toThrow();
    expect(() => service.assertFeatureAccess('business-a', 'advanced_ai', 'user-a')).not.toThrow();
    expect(() => service.assertFeatureAccess('business-a', 'reports', 'user-a')).not.toThrow();
    expect(() => service.assertFeatureAccess('business-a', 'upload_and_convert', 'user-a')).not.toThrow();

    const gated = new SubscriptionService({ providerConfigured: true });
    gated.registerBusiness('business-b', 'user-b');
    expect(() => gated.assertFeatureAccess('business-b', 'multi_business', 'user-b')).toThrow('Feature access denied.');
  });

  it('tracks payment state, history, and idempotent events', () => {
    const service = new SubscriptionService();
    const subscription = service.registerBusiness('business-a', 'user-a');

    const first = service.initiatePayment(subscription.id, 'INV-001', '29.00', 'MYR', 'user-a', 'evt-1');
    const duplicate = service.initiatePayment(subscription.id, 'INV-001', '29.00', 'MYR', 'user-a', 'evt-1');
    expect(first.id).toBe(duplicate.id);

    const paid = service.recordPaymentStatus(subscription.id, 'evt-1', 'PAID', 'user-a');
    expect(paid.status).toBe('PAID');
    expect(service.getPaymentHistory(subscription.id).length).toBeGreaterThan(0);

    const failed = service.recordPaymentStatus(subscription.id, 'evt-2', 'FAILED', 'user-a', 'Card declined');
    expect(failed.status).toBe('FAILED');
    expect(failed.failureReason).toBe('Card declined');

    const events = service.getAuditTrail(subscription.id).map((event) => event.event);
    expect(events).toContain('subscription_created');
    expect(events).toContain('payment_initiated');
    expect(events).toContain('payment_succeeded');
    expect(events).toContain('payment_failed');
  });

  it('handles renewal, grace period and suspension recovery deterministically', () => {
    const service = new SubscriptionService();
    const subscription = service.registerBusiness('business-a', 'user-a');
    service.initiatePayment(subscription.id, 'INV-RENEW', '29.00', 'MYR', 'user-a', 'evt-renew');
    service.recordPaymentStatus(subscription.id, 'evt-renew', 'PAID', 'user-a');

    const renewed = service.renewSubscription(subscription.id, 'user-a');
    expect(renewed.status).toBe('ACTIVE');
    expect(renewed.nextBillingDate).toBeTruthy();

    service.transitionStatus(subscription.id, 'PAST_DUE', 'user-a');
    service.transitionStatus(subscription.id, 'GRACE_PERIOD', 'user-a');
    expect(service.getBusinessSubscription('business-a').status).toBe('GRACE_PERIOD');

    service.transitionStatus(subscription.id, 'SUSPENDED', 'user-a');
    expect(service.getBusinessSubscription('business-a').status).toBe('SUSPENDED');

    service.reactivateSubscription(subscription.id, 'user-a');
    expect(service.getBusinessSubscription('business-a').status).toBe('ACTIVE');
  });

  it('supports cancellation while preserving business accounting data', () => {
    const service = new SubscriptionService();
    const subscription = service.registerBusiness('business-a', 'user-a');

    const cancelled = service.cancelSubscription(subscription.id, 'user-a', 'PERIOD_END');
    expect(cancelled.status).toBe('CANCELLED');
    expect(cancelled.cancelledAt).toBeTruthy();
    expect(service.getAuditTrail(subscription.id).some((event) => event.event === 'subscription_cancelled')).toBe(true);
  });

  it('separates platform finance from business accounting records', () => {
    const service = new SubscriptionService();
    const subscription = service.registerBusiness('business-a', 'user-a');
    service.initiatePayment(subscription.id, 'INV-PLATFORM', '29.00', 'MYR', 'user-a', 'evt-platform');
    service.recordPaymentStatus(subscription.id, 'evt-platform', 'PAID', 'user-a');

    expect(PLATFORM_FINANCE_POLICY.businessAccountingIsolation).toBe(true);
    expect(service.getPaymentHistory(subscription.id)[0].amount).toBe('29.00');
    expect(service.getBusinessSubscription('business-a').plan).toBe('STARTER');
  });

  it('prevents cross-business access for subscription and payment records', () => {
    const service = new SubscriptionService();
    const subA = service.registerBusiness('business-a', 'user-a');

    expect(() => service.registerBusiness('business-b', 'user-b')).toThrow('Starter plan allows only one business.');
    expect(subA.businessId).toBe('business-a');
    expect(service.getPaymentHistory(subA.id)).toEqual([]);
    expect(() => service.assertFeatureAccess('business-b', 'reports', 'user-b')).toThrow();
  });

  it('emits real audit events for subscription lifecycle and billing operations', () => {
    const service = new SubscriptionService();
    const subscription = service.registerBusiness('business-a', 'user-a');

    service.transitionStatus(subscription.id, 'PAST_DUE', 'user-a');
    service.transitionStatus(subscription.id, 'GRACE_PERIOD', 'user-a');
    service.transitionStatus(subscription.id, 'SUSPENDED', 'user-a');
    service.initiatePayment(subscription.id, 'INV-AUDIT-REACTIVATE', '29.00', 'MYR', 'user-a', 'evt-audit-reactivate');
    service.recordPaymentStatus(subscription.id, 'evt-audit-reactivate', 'PAID', 'user-a');
    service.reactivateSubscription(subscription.id, 'user-a');
    service.initiatePayment(subscription.id, 'INV-AUDIT', '29.00', 'MYR', 'user-a', 'evt-audit');
    service.recordPaymentStatus(subscription.id, 'evt-audit', 'PAID', 'user-a');

    const events = service.getAuditTrail(subscription.id).map((event) => event.event);
    expect(events).toEqual(expect.arrayContaining([
      'subscription_created',
      'subscription_activated',
      'subscription_past_due',
      'grace_period_started',
      'subscription_suspended',
      'subscription_reactivated',
      'payment_initiated',
      'payment_succeeded',
    ]));
  });

  it('prevents duplicate provider callbacks from creating duplicate payment records', () => {
    const service = new SubscriptionService();
    const subscription = service.registerBusiness('business-a', 'user-a');

    service.initiatePayment(subscription.id, 'INV-DUP', '29.00', 'MYR', 'user-a', 'evt-duplicate');
    service.recordPaymentStatus(subscription.id, 'evt-duplicate', 'PAID', 'user-a');
    service.recordPaymentStatus(subscription.id, 'evt-duplicate', 'PAID', 'user-a');

    const events = service.getAuditTrail(subscription.id).filter((event) => event.event === 'payment_succeeded');
    expect(service.getPaymentHistory(subscription.id).filter((payment) => payment.providerEventId === 'evt-duplicate')).toHaveLength(1);
    expect(events).toHaveLength(1);
  });

  it('enforces server-side business and plan state for client-supplied values when billing is configured', () => {
    const service = new SubscriptionService({ providerConfigured: true });
    const subscription = service.registerBusiness('business-a', 'user-a');

    expect(service.getBusinessSubscription('business-a').plan).toBe('STARTER');
    expect(service.getBusinessSubscription('business-a').status).toBe('ACTIVE');
    expect(() => service.assertFeatureAccess('business-a', 'multi_business', 'user-a')).toThrow();
    expect(() => service.assertFeatureAccess('business-a', 'reports', 'user-b')).toThrow();
    expect(() => service.transitionStatus(subscription.id, 'ACTIVE', 'user-a')).not.toThrow();
  });

  it('keeps subscription payments out of the accounting ledger and trial balance', () => {
    const service = new SubscriptionService();
    const subscription = service.registerBusiness('business-a', 'user-a');
    const engine = new AccountingEngine({
      businessId: 'business-a',
      accounts: [
        { id: 'acct-revenue', businessId: 'business-a', code: '4000', name: 'Sales', accountType: 'REVENUE', normalBalance: 'CREDIT', isSystem: false, isActive: true },
        { id: 'acct-bank', businessId: 'business-a', code: '1100', name: 'Bank', accountType: 'ASSET', normalBalance: 'DEBIT', isSystem: false, isActive: true },
      ],
      periods: [{ id: 'period-sub', businessId: 'business-a', name: '2026-09', startDate: '2026-09-01', endDate: '2026-09-30', status: 'OPEN' }],
    });

    const before = engine.getTrialBalance('business-a');
    expect(before.accounts).toHaveLength(0);

    service.initiatePayment(subscription.id, 'INV-ACCOUNTING', '29.00', 'MYR', 'user-a', 'evt-accounting');
    service.recordPaymentStatus(subscription.id, 'evt-accounting', 'PAID', 'user-a');

    const journal = engine.createJournal({
      businessId: 'business-a',
      journalNo: 'J-PLATFORM-001',
      journalDate: '2026-09-12',
      sourceType: 'SYSTEM',
      description: 'Only business accounting entry',
      lines: [
        { accountId: 'acct-bank', debit: '29.00' },
        { accountId: 'acct-revenue', credit: '29.00' },
      ],
    });
    engine.postJournal(journal, { postedBy: 'user-a', idempotencyKey: 'platform-check' });

    const after = engine.getTrialBalance('business-a');
    expect(after.accounts.map((account) => account.accountId)).toEqual(expect.arrayContaining(['acct-bank', 'acct-revenue']));
    expect(after.accounts).toHaveLength(2);
    expect(engine.getLedger({ businessId: 'business-a', accountId: 'acct-bank' }).entries).toHaveLength(1);
    expect(service.getPaymentHistory(subscription.id)[0].amount).toBe('29.00');
  });

  it('contains the locked starter defaults and provider status flags', () => {
    const service = new SubscriptionService();
    expect(STARTER_PLAN.monthlyPrice).toBe('29.00');
    expect(service.getConfig().livePaymentProvider).toBe('NOT_CONFIGURED');
    expect(service.getConfig().liveSupabaseUat).toBe('BLOCKED');
  });

  it('enforces owner authorization and safe cross-business failures', () => {
    const service = new SubscriptionService();
    const subscription = service.registerBusiness('business-a', 'owner-a');

    expect(() => service.transitionStatus(subscription.id, 'PAST_DUE', 'attacker')).toThrow('Business access denied.');
    expect(() => service.getBusinessSubscription('business-a', 'attacker')).toThrow('Business access denied.');
    expect(() => service.getPaymentHistory(subscription.id, 'attacker')).toThrow('Business access denied.');
    expect(() => service.assertFeatureAccess('business-a', 'reports', 'attacker')).toThrow('Business access denied.');
    expect(() => service.assertFeatureAccess('business-b', 'reports', 'attacker')).toThrow('Business access denied.');
  });

  it('allows suspended reads and records denials only when billing is enforcing the plan', () => {
    const service = new SubscriptionService({ providerConfigured: true });
    const subscription = service.registerBusiness('business-a', 'owner-a');
    service.transitionStatus(subscription.id, 'PAST_DUE', 'owner-a');
    service.transitionStatus(subscription.id, 'GRACE_PERIOD', 'owner-a');
    service.transitionStatus(subscription.id, 'SUSPENDED', 'owner-a');

    expect(service.canAccess('reports', { businessId: 'business-a', userId: 'owner-a', operation: 'READ' })).toBe(true);
    expect(service.canAccess('transactions', { businessId: 'business-a', userId: 'owner-a', operation: 'WRITE' })).toBe(false);
    expect(() => service.assertFeatureAccess('business-a', 'transactions', 'owner-a')).toThrow('Feature access denied.');
    expect(service.getAuditTrail(subscription.id, 'owner-a').some((event) => event.event === 'entitlement_denied')).toBe(true);
  });

  it('makes business registration idempotent and enforces the Starter business limit at the service boundary', () => {
    const subscriptions = new SubscriptionService();
    const businesses = new BusinessService([], [], {}, subscriptions);
    const input = {
      id: 'business-a',
      name: 'Business A',
      baseCurrency: 'MYR',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };

    const first = businesses.registerBusiness(input, 'owner-a');
    const repeat = businesses.registerBusiness(input, 'owner-a');
    expect(repeat.id).toBe(first.id);
    expect(() => businesses.registerBusiness({ ...input, id: 'business-b', name: 'Business B' }, 'owner-b')).toThrow('Starter plan allows only one business.');
  });

  it('does not renew twice for the same paid payment event', () => {
    const service = new SubscriptionService();
    const subscription = service.registerBusiness('business-a', 'owner-a');
    service.initiatePayment(subscription.id, 'INV-RENEW-IDEMPOTENT', '29.00', 'MYR', 'owner-a', 'evt-renew-idempotent');
    service.recordPaymentStatus(subscription.id, 'evt-renew-idempotent', 'PAID', 'owner-a');

    const first = service.renewSubscription(subscription.id, 'owner-a');
    const second = service.renewSubscription(subscription.id, 'owner-a');
    expect(second.currentPeriodEnd).toBe(first.currentPeriodEnd);
    expect(service.getAuditTrail(subscription.id, 'owner-a').filter((event) => event.event === 'renewal_succeeded')).toHaveLength(1);
  });

  it('enforces subscription entitlement at the canonical transaction boundary', () => {
    const subscriptions = new SubscriptionService();
    subscriptions.registerBusiness('business-a', 'owner-a');
    const engine = new AccountingEngine({
      businessId: 'business-a',
      accounts: [{ id: 'revenue', businessId: 'business-a', code: '4000', name: 'Revenue', accountType: 'REVENUE', normalBalance: 'CREDIT', isActive: true }],
      periods: [{ id: 'period', businessId: 'business-a', name: '2026-09', startDate: '2026-09-01', endDate: '2026-09-30', status: 'OPEN' }],
      financialAccounts: [{ id: 'bank', businessId: 'business-a', name: 'Bank', type: 'BANK', accountCode: 'BANK', currency: 'MYR', status: 'ACTIVE' }],
    });
    const transactions = new TransactionService(engine, { subscriptionService: subscriptions });

    expect(() => transactions.createTransaction({
      businessId: 'business-a',
      type: 'MONEY_IN',
      date: '2026-09-12',
      description: 'Authorized payment',
      amount: '10.00',
      financialAccountId: 'bank',
      accountId: 'revenue',
      createdBy: 'owner-a',
    })).not.toThrow();
    expect(() => transactions.createTransaction({
      businessId: 'business-a',
      type: 'MONEY_IN',
      date: '2026-09-12',
      description: 'Unauthorized payment',
      amount: '10.00',
      financialAccountId: 'bank',
      accountId: 'revenue',
      createdBy: 'attacker',
    })).toThrow('Business access denied.');
  });

  it('tracks the trial state without blocking core accounting when billing is disabled', () => {
    const service = new SubscriptionService();
    const subscription = service.registerBusiness('business-trial', 'owner-trial');

    expect(subscription.trialStartedAt).toBeTruthy();
    expect(subscription.trialEndsAt).toBeTruthy();
    expect(service.getTrialState('business-trial', 'owner-trial').isActive).toBe(true);

    expect(() => service.assertFeatureAccess('business-trial', 'report_print', 'owner-trial')).not.toThrow();
    expect(() => service.assertFeatureAccess('business-trial', 'report_export', 'owner-trial')).not.toThrow();
    expect(() => service.assertFeatureAccess('business-trial', 'reconciliation', 'owner-trial')).not.toThrow();
    expect(() => service.assertFeatureAccess('business-trial', 'reports', 'owner-trial', 'READ')).not.toThrow();
    expect(() => service.assertFeatureAccess('business-trial', 'account_statement_view', 'owner-trial', 'READ')).not.toThrow();

    const gated = new SubscriptionService({ providerConfigured: true });
    const gatedSub = gated.registerBusiness('business-trial-gated', 'owner-trial-gated');
    expect(() => gated.assertFeatureAccess('business-trial-gated', 'report_print', 'owner-trial-gated')).toThrow('Feature access denied.');
    expect(() => gated.assertFeatureAccess('business-trial-gated', 'reconciliation', 'owner-trial-gated')).toThrow('Feature access denied.');
    expect(gated.getBusinessSubscription('business-trial-gated', 'owner-trial-gated').id).toBe(gatedSub.id);
  });

  it('keeps the trial lifecycle visible without blocking access when billing is disabled, and re-enables gating when a provider is configured', () => {
    const service = new SubscriptionService();
    const subscription = service.registerBusiness('business-expired', 'owner-expired');
    const record = (service as any).subscriptions.get(subscription.id);
    record.trialEndsAt = new Date(Date.now() - 60 * 1000).toISOString();

    expect(service.getBusinessSubscription('business-expired', 'owner-expired').status).toBe('PAST_DUE');
    expect(service.getTrialState('business-expired', 'owner-expired').isActive).toBe(false);
    expect(() => service.assertFeatureAccess('business-expired', 'report_download', 'owner-expired')).not.toThrow();

    const gated = new SubscriptionService({ providerConfigured: true });
    const gatedSub = gated.registerBusiness('business-expired-gated', 'owner-expired-gated');
    const gatedRecord = (gated as any).subscriptions.get(gatedSub.id);
    gatedRecord.trialEndsAt = new Date(Date.now() - 60 * 1000).toISOString();

    expect(gated.getBusinessSubscription('business-expired-gated', 'owner-expired-gated').status).toBe('PAST_DUE');
    expect(() => gated.assertFeatureAccess('business-expired-gated', 'report_download', 'owner-expired-gated')).toThrow('Feature access denied.');

    gated.initiatePayment(gatedSub.id, 'INV-TRIAL-CLEAR', '29.00', 'MYR', 'owner-expired-gated', 'evt-trial-clear');
    gated.recordPaymentStatus(gatedSub.id, 'evt-trial-clear', 'PAID', 'owner-expired-gated');

    expect(gated.getBusinessSubscription('business-expired-gated', 'owner-expired-gated').status).toBe('ACTIVE');
    expect(() => gated.assertFeatureAccess('business-expired-gated', 'report_download', 'owner-expired-gated')).not.toThrow();
  });
});
