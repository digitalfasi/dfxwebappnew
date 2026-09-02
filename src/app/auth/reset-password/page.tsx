"use client";

import React, { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Eye, EyeOff, Lock, AlertCircle, ArrowRight, CheckCircle2 } from 'lucide-react';
import { Logo } from '@/components/shared/Logo';
import { authService } from '@/services/authService';
import { ApiError } from '@/lib/apiClient';

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordForm />
    </Suspense>
  );
}

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams?.get('token') || '';

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!token) {
      setError('This reset link is missing its token. Please use the link from your email.');
      return;
    }
    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      await authService.resetPassword(token, newPassword);
      setSuccess(true);
      setTimeout(() => router.push('/auth/login'), 2000);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not reset password. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F7F8FC] flex flex-col justify-center items-center overflow-y-auto p-4 sm:p-6 font-body text-[#0B0E23]">
      <div className="w-full max-w-[420px] bg-white border border-gold/30 p-8 sm:p-9 rounded-[2rem] shadow-[0_15px_35px_-5px_rgba(11,14,35,0.06)] relative z-10 animate-in fade-in duration-300 my-auto">
        <div className="flex flex-col items-center text-center mb-8">
          <Logo className="h-16 mb-3" />
          <h1 className="font-display font-extrabold text-2xl text-[#0B0E23] tracking-tight">
            Reset Password
          </h1>
          <p className="text-xs text-slate-500 font-medium mt-1">
            Choose a new password for your account
          </p>
        </div>

        {error && (
          <div
            role="alert"
            aria-live="polite"
            className="mb-5 p-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2.5 text-xs text-red-700 font-medium animate-in fade-in duration-200"
          >
            <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
            <span>{error}</span>
          </div>
        )}

        {success ? (
          <div className="flex flex-col items-center text-center gap-3 py-4 animate-in fade-in duration-300">
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <CheckCircle2 className="h-6 w-6" />
            </div>
            <p className="text-sm font-semibold text-[#0B0E23]">Password reset successfully.</p>
            <p className="text-xs text-slate-500">Redirecting you to sign in...</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <div className="space-y-1.5">
              <label htmlFor="new-password-input" className="text-xs font-bold text-[#0B0E23] uppercase tracking-wider block">
                New Password
              </label>
              <div className="relative group">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 group-focus-within:text-gold transition-colors duration-200" />
                <input
                  id="new-password-input"
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={newPassword}
                  onChange={(e) => { setNewPassword(e.target.value); setError(''); }}
                  placeholder="••••••••"
                  className="w-full pl-10 pr-10 py-3 bg-[#F7F8FC] border border-slate-200 focus:border-gold focus:ring-4 focus:ring-gold/10 rounded-xl text-sm font-mono text-[#0B0E23] transition-all duration-200 outline-none placeholder:text-slate-400"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-[#0B0E23] transition-colors p-1"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="confirm-password-input" className="text-xs font-bold text-[#0B0E23] uppercase tracking-wider block">
                Confirm New Password
              </label>
              <div className="relative group">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 group-focus-within:text-gold transition-colors duration-200" />
                <input
                  id="confirm-password-input"
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={confirmPassword}
                  onChange={(e) => { setConfirmPassword(e.target.value); setError(''); }}
                  placeholder="••••••••"
                  className="w-full pl-10 pr-4 py-3 bg-[#F7F8FC] border border-slate-200 focus:border-gold focus:ring-4 focus:ring-gold/10 rounded-xl text-sm font-mono text-[#0B0E23] transition-all duration-200 outline-none placeholder:text-slate-400"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 px-4 bg-gradient-to-r from-gold via-gold-light to-gold-dark hover:from-gold-dark hover:to-gold disabled:opacity-70 text-white rounded-xl font-bold text-sm transition-all duration-300 shadow-sm hover:shadow-md flex items-center justify-center gap-2 mt-2"
            >
              {loading ? (
                <span>Resetting...</span>
              ) : (
                <>
                  <span>Reset Password</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        )}

        <div className="pt-6 mt-6 border-t border-slate-100 text-center text-xs text-slate-500 font-medium">
          <button
            type="button"
            onClick={() => router.push('/auth/login')}
            className="text-gold font-bold hover:underline"
          >
            Back to Sign In
          </button>
        </div>
      </div>
    </div>
  );
}
