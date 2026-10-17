export function isDemoModeEnabled(env: Partial<NodeJS.ProcessEnv> = process.env): boolean {
  const nodeEnv = (env.NODE_ENV ?? '').toLowerCase();
  const vercelEnv = (env.VERCEL_ENV ?? '').toLowerCase();
  const demoFlag = (env.NEXT_PUBLIC_DEMO_MODE ?? env.OPSFINANCE_DEMO_MODE ?? '').trim().toLowerCase();

  if (nodeEnv === 'production' || vercelEnv === 'production') {
    return false;
  }

  return demoFlag === 'true' || demoFlag === '1' || demoFlag === 'yes';
}
