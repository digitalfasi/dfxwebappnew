"use client";

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import {
  Eye,
  EyeOff,
  Lock,
  Mail,
  AlertCircle,
  ArrowRight,
  ShieldCheck
} from 'lucide-react';
import { Toast } from '@/components/ui/toast';
import { Dialog } from '@/components/ui/dialog';
import { Logo } from '@/components/shared/Logo';
import { authService } from '@/services/authService';
import { ApiError } from '@/lib/apiClient';

export default function EnterpriseLoginPage() {
  const router = useRouter();
  const { loginWithEmail } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // Forgot Password Modal
  const [isForgotOpen, setIsForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotSubmitting, setForgotSubmitting] = useState(false);

  const validateForm = (): boolean => {
    const identifier = email.trim();
    if (!identifier) {
      setError('Email address or mobile number is required.');
      return false;
    }
    // The backend authenticates against either the email or the phone column.
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const phoneRegex = /^[0-9]{10,15}$/;
    if (!emailRegex.test(identifier) && !phoneRegex.test(identifier)) {
      setError('Please enter a valid email address or mobile number.');
      return false;
    }
    if (!password) {
      setError('Password is required.');
      return false;
    }
    return true;
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    setLoading(true);
    setError('');

    try {
      const { redirectPath } = await loginWithEmail(email, password);
      setLoading(false);
      setToastMsg('Authentication successful. Accessing workspace...');

      setTimeout(() => {
        router.push(redirectPath);
      }, 500);
    } catch (err: any) {
      setLoading(false);
      setError(err?.message || 'Invalid email or password.');
    }
  };

  const handleResetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotEmail || forgotSubmitting) return;
    setForgotSubmitting(true);
    try {
      await authService.forgotPassword(forgotEmail.trim());
      // Deliberately generic — the backend never signals whether the email
      // matched a real account, to prevent account enumeration. The
      // frontend must not either.
      setIsForgotOpen(false);
      setToastMsg('If an account exists for that email, a password reset link has been sent.');
      setForgotEmail('');
    } catch (err) {
      setToastMsg(err instanceof ApiError ? err.message : 'Could not submit request. Please try again.');
    } finally {
      setForgotSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F7F8FC] flex flex-col justify-center items-center overflow-y-auto p-4 sm:p-6 font-body text-[#0B0E23]">

      {/* CENTERED LOGIN CARD */}
      <div className="w-full max-w-[420px] bg-white border border-gold/30 p-8 sm:p-9 rounded-[2rem] shadow-[0_15px_35px_-5px_rgba(11,14,35,0.06)] relative z-10 animate-in fade-in duration-300 my-auto">

        {/* LOGO & BRAND HEADER */}
        <div className="flex flex-col items-center text-center mb-6">
          <Logo className="h-20 mb-3" />
          <p className="text-xs text-slate-500 font-medium mt-1">
            Jewellery Relationship Operating System
          </p>
        </div>

        {/* ERROR BANNER */}
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

        {/* LOGIN FORM */}
        <form onSubmit={handleLogin} className="space-y-4" noValidate>
          
          {/* Email Field */}
          <div className="space-y-1.5">
            <label htmlFor="email-input" className="text-xs font-bold text-[#0B0E23] uppercase tracking-wider block">
              Email or Mobile Number
            </label>
            <div className="relative group">
              <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 group-focus-within:text-gold transition-colors duration-200" />
              <input
                id="email-input"
                type="text"
                required
                value={email}
                onChange={(e) => { setEmail(e.target.value); setError(''); }}
                placeholder="name@company.com or 9876543210"
                className="w-full pl-10 pr-4 py-3 bg-[#F7F8FC] border border-slate-200 focus:border-gold focus:ring-4 focus:ring-gold/10 rounded-xl text-sm font-medium text-[#0B0E23] transition-all duration-200 outline-none placeholder:text-slate-400"
              />
            </div>
          </div>

          {/* Password Field */}
          <div className="space-y-1.5">
            <div className="flex justify-between items-center">
              <label htmlFor="password-input" className="text-xs font-bold text-[#0B0E23] uppercase tracking-wider block">
                Password
              </label>
              <button
                type="button"
                onClick={() => setIsForgotOpen(true)}
                className="text-xs text-gold hover:text-gold-dark font-semibold transition-colors focus:outline-none focus:underline"
              >
                Forgot Password?
              </button>
            </div>
            <div className="relative group">
              <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 group-focus-within:text-gold transition-colors duration-200" />
              <input
                id="password-input"
                type={showPassword ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError(''); }}
                placeholder="••••••••"
                className="w-full pl-10 pr-10 py-3 bg-[#F7F8FC] border border-slate-200 focus:border-gold focus:ring-4 focus:ring-gold/10 rounded-xl text-sm font-mono text-[#0B0E23] transition-all duration-200 outline-none placeholder:text-slate-400"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-[#0B0E23] transition-colors p-1"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {/* Remember Me */}
          <div className="flex items-center pt-1">
            <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer group">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 text-gold focus:ring-gold/30 cursor-pointer"
              />
              <span className="group-hover:text-[#0B0E23] transition-colors font-medium">Remember me</span>
            </label>
          </div>

          {/* Sign In Button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 px-4 bg-gradient-to-r from-gold via-gold-light to-gold-dark hover:from-gold-dark hover:to-gold disabled:opacity-70 text-white rounded-xl font-bold text-sm transition-all duration-300 shadow-sm hover:shadow-md flex items-center justify-center gap-2 mt-2"
          >
            {loading ? (
              <>
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                <span>Signing In...</span>
              </>
            ) : (
              <>
                <span>Sign In</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        {/* CREATE ACCOUNT LINK */}
        <div className="pt-6 mt-6 border-t border-slate-100 text-center text-xs text-slate-500 font-medium">
          <span>Don&apos;t have an account? </span>
          <button
            type="button"
            onClick={() => router.push('/auth/signup')}
            className="text-gold font-bold hover:underline ml-1"
          >
            Create Account
          </button>
        </div>

      </div>

      {/* FORGOT PASSWORD DIALOG */}
      <Dialog
        isOpen={isForgotOpen}
        onClose={() => setIsForgotOpen(false)}
        title="Reset Password"
      >
        <div className="bg-white p-6 rounded-2xl">
          <form onSubmit={handleResetSubmit} className="space-y-4">
            <p className="text-sm text-slate-600">
              Enter your registered work email address below to receive password reset instructions.
            </p>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-[#0B0E23] uppercase tracking-wider block">
                Work Email Address
              </label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  type="email"
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  placeholder="name@company.com"
                  required
                  className="w-full pl-10 pr-4 py-3 bg-[#F7F8FC] border border-slate-200 focus:border-gold rounded-xl text-sm font-medium text-[#0B0E23] outline-none"
                />
              </div>
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <button
                type="button"
                onClick={() => setIsForgotOpen(false)}
                className="px-4 py-2.5 text-xs font-bold text-slate-600 hover:text-slate-900 rounded-xl"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={forgotSubmitting}
                className="px-5 py-2.5 bg-gradient-to-r from-gold via-gold-light to-gold-dark text-white rounded-xl font-bold text-xs shadow-md disabled:opacity-60 transition-opacity duration-150"
              >
                {forgotSubmitting ? 'Sending...' : 'Send Reset Link'}
              </button>
            </div>
          </form>
        </div>
      </Dialog>

      {toastMsg && (
        <Toast message={toastMsg} onClose={() => setToastMsg(null)} />
      )}
    </div>
  );
}
