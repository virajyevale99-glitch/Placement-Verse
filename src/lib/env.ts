import 'server-only';

/** Server-only configuration. Nothing here may ever be imported into a client component. */
export const serverEnv = {
  appsScriptUrl: process.env.GOOGLE_APPS_SCRIPT_URL?.trim() || '',
  appsScriptSecret: process.env.APPS_SCRIPT_SHARED_SECRET || '',
  sessionSecret: process.env.ADMIN_SESSION_SECRET || '',
  isProduction: process.env.NODE_ENV === 'production',
  /** Local preview without Google: fictional data, admin disabled. Never on in production. */
  get demoMode(): boolean {
    return !this.isProduction && !this.appsScriptUrl;
  },
};

export function assertBackendConfigured(): void {
  const missing: string[] = [];
  if (!serverEnv.appsScriptUrl) missing.push('GOOGLE_APPS_SCRIPT_URL');
  if (serverEnv.appsScriptSecret.length < 32) missing.push('APPS_SCRIPT_SHARED_SECRET (32+ chars)');
  if (missing.length) throw new Error(`Backend not configured: set ${missing.join(', ')}`);
}
