'use client';

import React, { useMemo, useState } from 'react';

import { SubscriptionService } from '../packages/subscriptions';
import type { PaymentRecord, SubscriptionRecord } from '../packages/subscriptions';

const BUSINESS_ID = 'business-a';
const ACTOR_ID = 'user-a';
const FIXED_SUBSCRIPTION_NOW = new Date('2026-10-17T00:00:00.000Z').getTime();

function formatDate(value?: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-MY', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(date);
}

function statusLabel(status: string): string {
  return status.replace(/_/g, ' ');
}

function getActionButtons(service: SubscriptionService, subscription: SubscriptionRecord, onRefresh: () => void) {
  const actions: Array<{ label: string; onClick: () => void; disabled?: boolean }> = [];

  if (subscription.status === 'ACTIVE') {
    actions.push({
      label: 'Mark Past Due',
      onClick: () => {
        service.transitionStatus(subscription.id, 'PAST_DUE', ACTOR_ID);
        onRefresh();
      },
    });
    actions.push({
      label: 'Cancel',
      onClick: () => {
        service.cancelSubscription(subscription.id, ACTOR_ID, 'PERIOD_END');
        onRefresh();
      },
    });
  }

  if (subscription.status === 'PAST_DUE') {
    actions.push({
      label: 'Move to Grace Period',
      onClick: () => {
        service.transitionStatus(subscription.id, 'GRACE_PERIOD', ACTOR_ID);
        onRefresh();
      },
    });
  }

  if (subscription.status === 'GRACE_PERIOD') {
    actions.push({
      label: 'Suspend',
      onClick: () => {
        service.transitionStatus(subscription.id, 'SUSPENDED', ACTOR_ID);
        onRefresh();
      },
    });
    actions.push({
      label: 'Reactivate',
      onClick: () => {
        service.reactivateSubscription(subscription.id, ACTOR_ID);
        onRefresh();
      },
    });
  }

  if (subscription.status === 'SUSPENDED') {
    actions.push({
      label: 'Reactivate',
      onClick: () => {
        service.reactivateSubscription(subscription.id, ACTOR_ID);
        onRefresh();
      },
    });
  }

  if (subscription.status === 'CANCELLED') {
    actions.push({
      label: 'Cancelled',
      onClick: () => undefined,
      disabled: true,
    });
  }

  return actions;
}

export function SubscriptionSettings() {
  const service = useMemo(() => new SubscriptionService({ now: () => FIXED_SUBSCRIPTION_NOW }), []);
  const [subscription, setSubscription] = useState<SubscriptionRecord>(() => {
    const record = service.registerBusiness(BUSINESS_ID, ACTOR_ID);
    const paymentHistory = service.getPaymentHistory(record.id);
    if (paymentHistory.length === 0) {
      service.initiatePayment(record.id, 'INV-SUB-001', '29.00', 'MYR', ACTOR_ID, 'evt-sub-demo');
      service.recordPaymentStatus(record.id, 'evt-sub-demo', 'PAID', ACTOR_ID);
      return service.getBusinessSubscription(BUSINESS_ID);
    }
    return record;
  });

  const [paymentHistory, setPaymentHistory] = useState<PaymentRecord[]>(() => service.getPaymentHistory(subscription.id));

  const refresh = () => {
    const nextSubscription = service.getBusinessSubscription(BUSINESS_ID);
    setSubscription(nextSubscription);
    setPaymentHistory(service.getPaymentHistory(nextSubscription.id));
  };

  const config = service.getConfig();
  const actions = getActionButtons(service, subscription, refresh);

  return (
    <main style={{ padding: '2rem', fontFamily: 'sans-serif', maxWidth: '1100px', margin: '0 auto' }}>
      <h1>OpsFinance current plan</h1>
      <div style={{ display: 'grid', gap: '1.5rem', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', marginTop: '1.5rem' }}>
        <section style={{ border: '1px solid #d0d7de', borderRadius: '12px', padding: '1.25rem', background: '#fff' }}>
          <p style={{ margin: 0, color: '#57606a', fontSize: '0.8rem', textTransform: 'uppercase' }}>Plan</p>
          <h2 style={{ margin: '0.5rem 0 0' }}>Starter</h2>
          <p style={{ margin: '0.5rem 0 0', fontSize: '1.4rem', fontWeight: 700 }}>RM29/month</p>
        </section>

        <section style={{ border: '1px solid #d0d7de', borderRadius: '12px', padding: '1.25rem', background: '#fff' }}>
          <p style={{ margin: 0, color: '#57606a', fontSize: '0.8rem', textTransform: 'uppercase' }}>Current status</p>
          <div style={{ marginTop: '0.75rem', display: 'inline-flex', padding: '0.35rem 0.7rem', borderRadius: '999px', background: '#eef6ff', color: '#0a3a62', fontWeight: 700 }}>
            {statusLabel(subscription.status)}
          </div>
          <p style={{ margin: '0.8rem 0 0' }}><strong>Billing period:</strong> {formatDate(subscription.currentPeriodStart)} → {formatDate(subscription.currentPeriodEnd)}</p>
          <p style={{ margin: '0.35rem 0 0' }}><strong>Next billing date:</strong> {formatDate(subscription.nextBillingDate)}</p>
        </section>

        <section style={{ border: '1px solid #d0d7de', borderRadius: '12px', padding: '1.25rem', background: '#fff' }}>
          <p style={{ margin: 0, color: '#57606a', fontSize: '0.8rem', textTransform: 'uppercase' }}>Provider</p>
          <p style={{ margin: '0.75rem 0 0', fontWeight: 600 }}>Payment provider: {config.livePaymentProvider === 'NOT_CONFIGURED' ? 'Not configured' : config.livePaymentProvider}</p>
          <p style={{ margin: '0.5rem 0 0', color: '#57606a' }}>No live provider credentials are configured.</p>
        </section>
      </div>

      <section style={{ marginTop: '2rem', border: '1px solid #d0d7de', borderRadius: '12px', padding: '1.5rem', background: '#fff' }}>
        <h3 style={{ marginTop: 0 }}>Subscription state</h3>
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: '0.8rem' }}>
          <li><strong>Cancellation:</strong> {subscription.cancelledAt ? `Cancelled on ${formatDate(subscription.cancelledAt)}` : 'Not cancelled'}</li>
          <li><strong>Grace period:</strong> {subscription.gracePeriodStart && subscription.gracePeriodEnd ? `${formatDate(subscription.gracePeriodStart)} → ${formatDate(subscription.gracePeriodEnd)}` : 'Not in grace period'}</li>
          <li><strong>Suspension:</strong> {subscription.suspendedAt ? `Suspended on ${formatDate(subscription.suspendedAt)}` : 'Not suspended'}</li>
          <li><strong>Payment activity:</strong> {paymentHistory.length > 0 ? `${paymentHistory.length} record(s)` : 'No payment history yet'}</li>
        </ul>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginTop: '1rem' }}>
          {actions.map((action) => (
            <button
              key={action.label}
              type="button"
              disabled={action.disabled}
              onClick={action.onClick}
              style={{
                border: '1px solid #0969da',
                borderRadius: '8px',
                background: action.disabled ? '#f6f8fa' : '#0969da',
                color: action.disabled ? '#57606a' : '#fff',
                padding: '0.65rem 1rem',
                cursor: action.disabled ? 'not-allowed' : 'pointer',
              }}
            >
              {action.label}
            </button>
          ))}
        </div>
      </section>

      <section style={{ marginTop: '2rem', border: '1px solid #d0d7de', borderRadius: '12px', padding: '1.5rem', background: '#fff' }}>
        <h3 style={{ marginTop: 0 }}>Payment history</h3>
        {paymentHistory.length === 0 ? (
          <p>No payment history yet.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', padding: '0.5rem', borderBottom: '1px solid #d0d7de' }}>Reference</th>
                  <th style={{ textAlign: 'left', padding: '0.5rem', borderBottom: '1px solid #d0d7de' }}>Period</th>
                  <th style={{ textAlign: 'left', padding: '0.5rem', borderBottom: '1px solid #d0d7de' }}>Amount</th>
                  <th style={{ textAlign: 'left', padding: '0.5rem', borderBottom: '1px solid #d0d7de' }}>Status</th>
                  <th style={{ textAlign: 'left', padding: '0.5rem', borderBottom: '1px solid #d0d7de' }}>Payment date</th>
                  <th style={{ textAlign: 'left', padding: '0.5rem', borderBottom: '1px solid #d0d7de' }}>Failure reason</th>
                </tr>
              </thead>
              <tbody>
                {paymentHistory.map((payment) => (
                  <tr key={payment.id}>
                    <td style={{ padding: '0.5rem', borderBottom: '1px solid #f0f2f4' }}>{payment.invoiceReference}</td>
                    <td style={{ padding: '0.5rem', borderBottom: '1px solid #f0f2f4' }}>{payment.billingPeriod}</td>
                    <td style={{ padding: '0.5rem', borderBottom: '1px solid #f0f2f4' }}>{payment.amount} {payment.currency}</td>
                    <td style={{ padding: '0.5rem', borderBottom: '1px solid #f0f2f4' }}>{payment.status}</td>
                    <td style={{ padding: '0.5rem', borderBottom: '1px solid #f0f2f4' }}>{payment.paymentDate ? formatDate(payment.paymentDate) : '—'}</td>
                    <td style={{ padding: '0.5rem', borderBottom: '1px solid #f0f2f4' }}>{payment.failureReason ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
