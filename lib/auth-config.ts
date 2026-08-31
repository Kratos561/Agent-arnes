/**
 * Auth Config — Single-account authentication for Agent Arnes.
 * Only ONE email + password combo is allowed. Any other credentials are rejected.
 * Password is stored as SHA-256 hash (never plaintext).
 */

const ALLOWED_EMAIL = 'saniel@agentarnes.com';
const PASSWORD_HASH = 'f65322644df9f2156766e8d8272b85695f3d4ebb47e0a0303ddba2994f09b89f';

const SESSION_KEY = 'agent_arnes_auth_session';

async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

export interface AuthSession {
  email: string;
  authenticatedAt: number;
}

export async function authenticateLocal(email: string, password: string): Promise<{ success: boolean; error?: string }> {
  const normalizedEmail = email.trim().toLowerCase();

  if (normalizedEmail !== ALLOWED_EMAIL.toLowerCase()) {
    return { success: false, error: 'Credenciales invalidas.' };
  }

  const hash = await hashPassword(password);
  if (hash !== PASSWORD_HASH) {
    return { success: false, error: 'Credenciales invalidas.' };
  }

  const session: AuthSession = { email: normalizedEmail, authenticatedAt: Date.now() };
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    // Storage full or unavailable
  }

  return { success: true };
}

export function getLocalSession(): AuthSession | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const session: AuthSession = JSON.parse(raw);
    if (!session.email || !session.authenticatedAt) return null;
    return session;
  } catch {
    return null;
  }
}

export function clearLocalSession(): void {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    // Ignore
  }
}

export function getAllowedEmail(): string {
  return ALLOWED_EMAIL;
}
