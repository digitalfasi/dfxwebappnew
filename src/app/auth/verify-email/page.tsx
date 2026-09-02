"use client";

import React, { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { CheckCircle2, AlertCircle, MailCheck } from 'lucide-react';
import { Logo } from '@/components/shared/Logo';
import { authService } from '@/services/authService';
import { ApiError } from '@/lib/apiClient';

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={null}>
      <VerifyEmailContent />
    </Suspense>
  );
}

function VerifyEmailContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams?.get('token') || '';

  const [status, setStatus] = useState<'verifying' | 'success' | 'error'>('verifying');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setError('This verification link is missing its token.');
      return;
    }
    authService
      .confirmEmailVerification(token)
      .then(() => setStatus('success'))
      .catch((err) => {
        setStatus('error');
        setError(err instanceof ApiError ? err.message : 'Could not verify this email address.');
      });
  }, [token]);

  return (
    <div className="min-h-screen bg-[#F7F8FC] flex flex-col justify-center items-center overflow-y-auto p-4 sm:p-6 font-body text-[#0B0E23]">
      <div className="w-full max-w-[420px] bg-white border border-gold/30 p-8 sm:p-9 rounded-[2rem] shadow-[0_15px_35px_-5px_rgba(11,14,35,0.06)] relative z-10 animate-in fade-in duration-300 my-auto">
        <div className="flex flex-col items-center text-center">
          <Logo className="h-16 mb-4" />

          {status === 'verifying' && (
            <>
              <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-500 flex items-center justify-center mb-3 animate-pulse">
                <MailCheck className="h-6 w-6" />
              </div>
              <p className="text-sm font-semibold text-[#0B0E23]">Verifying your email...</p>
            </>
          )}

          {status === 'success' && (
            <div className="animate-in fade-in duration-300 flex flex-col items-center">
              <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mb-3">
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <p className="text-sm font-semibold text-[#0B0E23] mb-1">Email verified successfully.</p>
              <p className="text-xs text-slate-500 mb-6">Your account&apos;s email address is now confirmed.</p>
              <button
                onClick={() => router.push('/auth/login')}
                className="w-full py-3 px-4 bg-gradient-to-r from-gold via-gold-light to-gold-dark text-white rounded-xl font-bold text-sm transition-all duration-300 shadow-sm hover:shadow-md"
              >
                Continue to Sign In
              </button>
            </div>
          )}

          {status === 'error' && (
            <div className="animate-in fade-in duration-300 flex flex-col items-center">
              <div className="w-12 h-12 rounded-2xl bg-red-50 text-red-600 flex items-center justify-center mb-3">
                <AlertCircle className="h-6 w-6" />
              </div>
              <p className="text-sm font-semibold text-[#0B0E23] mb-1">Verification failed</p>
              <p className="text-xs text-slate-500 mb-6">{error}</p>
              <button
                onClick={() => router.push('/auth/login')}
                className="w-full py-3 px-4 bg-white border border-slate-200 hover:bg-slate-50 text-[#0B0E23] rounded-xl font-bold text-sm transition-all duration-200"
              >
                Back to Sign In
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
