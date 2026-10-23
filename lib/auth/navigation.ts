export function clearSupabaseSessionStorage(): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    const cookieNames = document.cookie
      .split(';')
      .map((cookie) => cookie.trim())
      .filter((cookie) => cookie.length > 0)
      .map((cookie) => cookie.split('=')[0])
      .filter((name) => name.startsWith('sb-'));

    cookieNames.forEach((name) => {
      document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; SameSite=Lax`;
    });
  } catch {
    // Ignore cookie cleanup failures so user navigation still proceeds.
  }

  try {
    Object.keys(localStorage)
      .filter((key) => key.startsWith('sb-') || key.includes('supabase'))
      .forEach((key) => localStorage.removeItem(key));
  } catch {
    // Ignore storage cleanup failures so user navigation still proceeds.
  }

  try {
    sessionStorage.clear();
  } catch {
    // Ignore storage cleanup failures so user navigation still proceeds.
  }
}

export function navigateToDashboard(assign: (url: string) => void = (url) => window.location.replace(url)): void {
  assign('/dashboard');
}

export function navigateToMyOpsHome(assign: (url: string) => void = (url) => window.location.replace(url)): void {
  assign('/');
}

export function navigateToLogin(assign: (url: string) => void = (url) => window.location.replace(url)): void {
  assign('/?logout=1');
}
