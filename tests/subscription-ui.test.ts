import { render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { describe, expect, it } from 'vitest';

import { SubscriptionSettings } from '../components/subscription-settings';
import { SubscriptionService } from '../packages/subscriptions';

describe('standalone accounting access', () => {
  it('renders the compatibility notice instead of pricing and billing UI', () => {
    render(createElement(SubscriptionSettings));

    expect(screen.getByText(/Standalone accounting access/i)).toBeTruthy();
    expect(screen.queryByText(/RM29\/month/i)).toBeNull();
    expect(screen.queryByText(/Payment provider/i)).toBeNull();
    expect(screen.getByText(/billing data is retained only for compatibility/i)).toBeTruthy();
  });

  it('allows accounting access without a subscription while keeping tenant boundaries', () => {
    const service = new SubscriptionService();
    service.registerBusiness('business-a', 'user-a');

    expect(() => service.assertFeatureAccess('business-a', 'transactions', 'user-a')).not.toThrow();
    expect(() => service.assertFeatureAccess('business-a', 'report_export', 'user-a')).not.toThrow();
    expect(() => service.assertFeatureAccess('business-b', 'transactions', 'user-b')).toThrow('Business access denied.');
  });
});
