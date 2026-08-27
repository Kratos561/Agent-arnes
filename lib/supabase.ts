/**
 * Supabase client — Auth + Database for user accounts, conversations, projects.
 * Uses the Supabase JS CDN (loaded dynamically) to avoid npm dependency.
 */

const SUPABASE_URL = 'https://bsygicyjjpxhyobhsync.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJzeWdpY3lqanB4aHlvYmhzeW5jIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc4NTQwNDYsImV4cCI6MjEwMzQzMDA0Nn0.rGbeW6v3S1_15rt8334YPDHYdEL2GC-GhYDfm7uDTNk';

let supabaseClient: any = null;

async function getSupabase() {
  if (supabaseClient) return supabaseClient;

  // Load Supabase from CDN
  if (!(window as any).supabase) {
    await new Promise<void>((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js';
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('Failed to load Supabase'));
      document.head.appendChild(s);
    });
  }

  const { createClient } = (window as any).supabase;
  supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  return supabaseClient;
}

// ===== Auth =====

export interface AuthUser {
  id: string;
  email: string;
  created_at: string;
}

export async function signUp(email: string, password: string): Promise<{ user: AuthUser | null; error: string | null }> {
  try {
    const sb = await getSupabase();
    const { data, error } = await sb.auth.signUp({ email, password });
    if (error) return { user: null, error: error.message };
    if (data.user) {
      return { user: { id: data.user.id, email: data.user.email || email, created_at: data.user.created_at }, error: null };
    }
    return { user: null, error: 'No se pudo crear la cuenta. Revisa tu email para confirmar.' };
  } catch (e) {
    return { user: null, error: e instanceof Error ? e.message : 'Error de conexion' };
  }
}

export async function signIn(email: string, password: string): Promise<{ user: AuthUser | null; error: string | null }> {
  try {
    const sb = await getSupabase();
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error) return { user: null, error: error.message };
    if (data.user) {
      return { user: { id: data.user.id, email: data.user.email || email, created_at: data.user.created_at }, error: null };
    }
    return { user: null, error: 'No se pudo iniciar sesion' };
  } catch (e) {
    return { user: null, error: e instanceof Error ? e.message : 'Error de conexion' };
  }
}

export async function signOut(): Promise<void> {
  try {
    const sb = await getSupabase();
    await sb.auth.signOut();
  } catch {
    // Ignore
  }
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  try {
    const sb = await getSupabase();
    const { data: { user } } = await sb.auth.getUser();
    if (user) {
      return { id: user.id, email: user.email || '', created_at: user.created_at };
    }
    return null;
  } catch {
    return null;
  }
}

// ===== Database: Conversations =====

export interface SavedConversation {
  id: string;
  user_id: string;
  title: string;
  messages: unknown;
  created_at: string;
  updated_at: string;
}

export async function saveConversation(title: string, messages: unknown): Promise<{ id: string | null; error: string | null }> {
  try {
    const sb = await getSupabase();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return { id: null, error: 'No autenticado' };

    const { data, error } = await sb.from('conversations').insert({
      user_id: user.id,
      title,
      messages,
    }).select('id').single();

    if (error) return { id: null, error: error.message };
    return { id: data.id, error: null };
  } catch (e) {
    return { id: null, error: e instanceof Error ? e.message : 'Error de conexion' };
  }
}

export async function updateConversation(id: string, title: string, messages: unknown): Promise<{ error: string | null }> {
  try {
    const sb = await getSupabase();
    const { error } = await sb.from('conversations').update({
      title,
      messages,
      updated_at: new Date().toISOString(),
    }).eq('id', id);
    return { error: error?.message || null };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Error de conexion' };
  }
}

export async function loadConversations(): Promise<{ conversations: SavedConversation[]; error: string | null }> {
  try {
    const sb = await getSupabase();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return { conversations: [], error: 'No autenticado' };

    const { data, error } = await sb.from('conversations')
      .select('*')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false });

    if (error) return { conversations: [], error: error.message };
    return { conversations: data || [], error: null };
  } catch (e) {
    return { conversations: [], error: e instanceof Error ? e.message : 'Error de conexion' };
  }
}

export async function deleteConversation(id: string): Promise<{ error: string | null }> {
  try {
    const sb = await getSupabase();
    const { error } = await sb.from('conversations').delete().eq('id', id);
    return { error: error?.message || null };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Error de conexion' };
  }
}
