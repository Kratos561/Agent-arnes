'use client';

import React, { useState } from 'react';
import { User, Mail, Lock, LogIn, UserPlus, ArrowRight } from 'lucide-react';

interface AuthScreenProps {
  onAuthenticated: (email: string) => void;
}

export function AuthScreen({ onAuthenticated }: AuthScreenProps) {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      // Dynamic import to avoid blocking initial render
      const { signUp, signIn } = await import('@/lib/supabase');

      if (isLogin) {
        const result = await signIn(email, password);
        if (result.error) {
          setError(result.error);
        } else if (result.user) {
          onAuthenticated(result.user.email);
        }
      } else {
        const result = await signUp(email, password);
        if (result.error) {
          setError(result.error);
        } else if (result.user) {
          setSuccess('Cuenta creada. Revisa tu email para confirmar, luego inicia sesion.');
          setIsLogin(true);
        } else {
          setSuccess('Cuenta creada. Revisa tu email para confirmar, luego inicia sesion.');
          setIsLogin(true);
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error de conexion');
    } finally {
      setLoading(false);
    }
  };

  const handleSkipAuth = () => {
    // Allow skipping auth — use localStorage mode
    onAuthenticated('local');
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-neutral-50 to-neutral-100 dark:from-[#0a0a0a] dark:to-[#111] p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-purple-600 text-white mb-4 shadow-lg shadow-blue-500/25">
            <User className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-bold text-neutral-900 dark:text-white">Agent Arnes</h1>
          <p className="text-sm text-neutral-500 mt-1">
            {isLogin ? 'Inicia sesion para continuar' : 'Crea tu cuenta'}
          </p>
        </div>

        {/* Form */}
        <form
          onSubmit={handleSubmit}
          className="bg-white dark:bg-[#1a1a1a] rounded-2xl border border-neutral-200 dark:border-neutral-800 shadow-xl p-6 space-y-4"
        >
          {/* Email */}
          <div>
            <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1.5">Email</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tu@email.com"
                required
                className="w-full pl-10 pr-3 py-2.5 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800/50 text-sm text-neutral-900 dark:text-white placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 transition-colors"
              />
            </div>
          </div>

          {/* Password */}
          <div>
            <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1.5">Contrasena</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Minimo 6 caracteres"
                required
                minLength={6}
                className="w-full pl-10 pr-3 py-2.5 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800/50 text-sm text-neutral-900 dark:text-white placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 transition-colors"
              />
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          {/* Success */}
          {success && (
            <div className="text-xs text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-950/30 rounded-lg px-3 py-2">
              {success}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-purple-600 text-white text-sm font-semibold hover:from-blue-700 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-blue-500/20"
          >
            {loading ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : isLogin ? (
              <>
                <LogIn className="w-4 h-4" />
                Iniciar Sesion
              </>
            ) : (
              <>
                <UserPlus className="w-4 h-4" />
                Crear Cuenta
              </>
            )}
          </button>

          {/* Toggle */}
          <button
            type="button"
            onClick={() => { setIsLogin(!isLogin); setError(''); setSuccess(''); }}
            className="w-full text-center text-xs text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 transition-colors"
          >
            {isLogin ? 'No tienes cuenta? Crear una' : 'Ya tienes cuenta? Iniciar sesion'}
          </button>

          {/* Skip */}
          <div className="relative my-2">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-neutral-200 dark:border-neutral-700" />
            </div>
            <div className="relative flex justify-center text-[11px]">
              <span className="bg-white dark:bg-[#1a1a1a] px-2 text-neutral-400">o</span>
            </div>
          </div>

          <button
            type="button"
            onClick={handleSkipAuth}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800/50 text-sm text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
          >
            <ArrowRight className="w-4 h-4" />
            Continuar sin cuenta (solo local)
          </button>
        </form>

        <p className="text-center text-[10px] text-neutral-400 mt-4">
          Tus datos se guardan en Supabase si inicias sesion, o solo en tu navegador si saltas.
        </p>
      </div>
    </div>
  );
}
