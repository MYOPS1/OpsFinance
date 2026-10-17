import { describe, expect, it } from 'vitest';

import { isDemoModeEnabled } from '../lib/runtime/demo-mode';

describe('demo-mode guard', () => {
  it('disables demo mode in production even if the flags are set', () => {
    expect(isDemoModeEnabled({ NODE_ENV: 'production', NEXT_PUBLIC_DEMO_MODE: 'true' })).toBe(false);
    expect(isDemoModeEnabled({ NODE_ENV: 'development', VERCEL_ENV: 'production', OPSFINANCE_DEMO_MODE: 'true' })).toBe(false);
  });

  it('allows demo mode only in non-production environments', () => {
    expect(isDemoModeEnabled({ NODE_ENV: 'development', NEXT_PUBLIC_DEMO_MODE: 'true' })).toBe(true);
    expect(isDemoModeEnabled({ NODE_ENV: 'test', OPSFINANCE_DEMO_MODE: 'false' })).toBe(false);
  });
});
