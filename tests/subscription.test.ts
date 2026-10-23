import { describe, expect, it } from 'vitest';

import { SubscriptionService } from '../packages/subscriptions';

describe('standalone accounting compatibility', () => {
  it('keeps billing compatibility but removes billing gates from accounting access', () => {
    const service = new SubscriptionService();
    service.registerBusiness('business-a', 'user-a');

    expect(service.getBusinessSubscription('business-a').businessId).toBe('business-a');
    expect(() => service.assertFeatureAccess('business-a', 'dashboard', 'user-a')).not.toThrow();
    expect(() => service.assertFeatureAccess('business-a', 'transactions', 'user-a')).not.toThrow();
    expect(() => service.assertFeatureAccess('business-a', 'report_export', 'user-a')).not.toThrow();
    expect(() => service.assertFeatureAccess('business-a', 'reconciliation', 'user-a')).not.toThrow();
  });

  it('preserves member and tenant checks without allowing access to another business', () => {
    const service = new SubscriptionService();
    const business = service.registerBusiness('business-a', 'user-a');

    expect(() => service.assertFeatureAccess('business-a', 'reports', 'user-b')).toThrow('Business access denied.');
    expect(() => service.assertFeatureAccess('business-b', 'reports', 'user-b')).toThrow('Business access denied.');
    expect(business.businessId).toBe('business-a');
  });

  it('keeps legacy billing metadata isolated from the accounting domain', () => {
    const service = new SubscriptionService();
    const subscription = service.registerBusiness('business-a', 'user-a');

    expect(service.getBusinessSubscription('business-a').plan).toBe('STARTER');
    expect(service.getFeatureAccessMessage('report_export')).toContain('Standalone accounting access');
    expect(service.getPaymentHistory(subscription.id)).toEqual([]);
  });
});
