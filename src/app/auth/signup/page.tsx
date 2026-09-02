"use client";

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Logo } from '@/components/shared/Logo';
import { authService, PublicTenant } from '@/services/authService';
import { 
  User as UserIcon, 
  Building2, 
  Mail, 
  Smartphone, 
  Lock, 
  AlertCircle, 
  CheckCircle2,
  ArrowRight
} from 'lucide-react';

export default function SignupPage() {
  const router = useRouter();

  // Stores List
  const [tenants, setTenants] = useState<PublicTenant[]>([]);
  const [selectedTenantId, setSelectedTenantId] = useState('');

  // Form Fields
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [mobileNumber, setMobileNumber] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Status & Validation Feedback
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function loadTenants() {
      try {
        const list = await authService.getPublicTenants();
        setTenants(list);
        if (list.length > 0) {
          setSelectedTenantId(list[0].id);
        }
      } catch (err: any) {
        setError(err?.message || 'Unable to load the jewellery store list. Please try again.');
      }
    }
    loadTenants();
  }, []);

  const validateForm = (): boolean => {
    if (!selectedTenantId) {
      setError('Please select a Jewellery Store.');
      return false;
    }
    if (!fullName.trim()) {
      setError('Full Name is required.');
      return false;
    }
    if (!email.trim() && !mobileNumber.trim()) {
      setError('Either Email Address or Mobile Number is required.');
      return false;
    }
    if (email.trim()) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email.trim())) {
        setError('Please enter a valid email address.');
        return false;
      }
    }
    if (mobileNumber.trim()) {
      if (mobileNumber.trim().length < 10) {
        setError('Please enter a valid 10-digit mobile number.');
        return false;
      }
    }
    if (!password) {
      setError('Password is required.');
      return false;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters long.');
      return false;
    }
    if (password !== confirmPassword) {
      setError('Password and Confirm Password do not match.');
      return false;
    }
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    setLoading(true);
    setError('');

    try {
      await authService.signupCustomer({
        name: fullName.trim(),
        email: email.trim() || undefined,
        phone: mobileNumber.trim() || undefined,
        password: password,
        tenant_id: selectedTenantId,
      });

      setLoading(false);
      setSubmitted(true);
    } catch (err: any) {
      setLoading(false);
      setError(err?.message || 'Registration failed. Please try again.');
    }
  };

  return (
    <div className="min-h-screen bg-[#F7F8FC] flex flex-col justify-center items-center overflow-y-auto p-4 sm:p-6 font-body text-[#0B0E23]">

      {/* CENTERED REGISTER CARD */}
      <div className="w-full max-w-[420px] bg-white border border-gold/30 p-7 sm:p-9 rounded-[2rem] shadow-[0_15px_35px_-5px_rgba(11,14,35,0.06)] relative z-10 animate-in fade-in duration-300 my-auto">
        
        {/* BRAND HEADER */}
        <div className="flex flex-col items-center text-center mb-6">
          <Logo className="h-14 mb-2.5" />
          <h1 className="font-display font-extrabold text-xl text-[#0B0E23] tracking-tight">
            Customer Registration
          </h1>
          <p className="text-xs text-slate-500 font-medium mt-0.5">
            Jewellery Relationship Operating System
          </p>
        </div>

        {/* SUCCESS CONFIRMATION STATE */}
        {submitted ? (
          <div className="space-y-5 text-center py-4 animate-in zoom-in-95 duration-300">
            <div className="w-16 h-16 bg-emerald-50 border border-emerald-200 rounded-full flex items-center justify-center text-emerald-600 mx-auto shadow-inner">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            
            <div className="space-y-2">
              <h2 className="font-display font-bold text-lg text-slate-900">
                Registration Complete!
              </h2>
              <p className="text-xs text-slate-600 leading-relaxed bg-[#F7F8FC] p-4 rounded-2xl border border-slate-200 font-medium text-left">
                Your account has been registered successfully. You can now log in using your credentials.
              </p>
            </div>

            <button
              onClick={() => router.push('/auth/login')}
              className="w-full py-3 px-4 bg-gradient-to-r from-gold via-gold-light to-gold-dark text-white rounded-xl font-bold text-xs shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 mt-2"
            >
              <span>Proceed to Sign In</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        ) : (
          /* REGISTRATION FORM */
          <>
            {error && (
              <div 
                role="alert" 
                aria-live="polite" 
                className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2.5 text-xs text-red-700 font-medium animate-in fade-in duration-200"
              >
                <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-3.5" noValidate>
              
              {/* Store Selector */}
              <div className="space-y-1">
                <label htmlFor="store-select" className="text-[11px] font-bold text-[#0B0E23] uppercase tracking-wider block">
                  Select Jewellery Store *
                </label>
                <div className="relative group">
                  <Building2 className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 group-focus-within:text-gold transition-colors duration-200" />
                  <select
                    id="store-select"
                    required
                    value={selectedTenantId}
                    onChange={(e) => { setSelectedTenantId(e.target.value); setError(''); }}
                    className="w-full pl-10 pr-3.5 py-2.5 bg-[#F7F8FC] border border-slate-200 focus:border-gold focus:ring-4 focus:ring-gold/10 rounded-xl text-xs font-medium text-[#0B0E23] transition-all outline-none"
                  >
                    {tenants.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Full Name */}
              <div className="space-y-1">
                <label htmlFor="fullname-input" className="text-[11px] font-bold text-[#0B0E23] uppercase tracking-wider block">
                  Full Name *
                </label>
                <div className="relative group">
                  <UserIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 group-focus-within:text-gold transition-colors duration-200" />
                  <input
                    id="fullname-input"
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => { setFullName(e.target.value); setError(''); }}
                    placeholder="Priya Sharma"
                    className="w-full pl-10 pr-3.5 py-2.5 bg-[#F7F8FC] border border-slate-200 focus:border-gold focus:ring-4 focus:ring-gold/10 rounded-xl text-xs font-medium text-[#0B0E23] transition-all outline-none placeholder:text-slate-400"
                  />
                </div>
              </div>

              {/* Email Address */}
              <div className="space-y-1">
                <label htmlFor="email-input" className="text-[11px] font-bold text-[#0B0E23] uppercase tracking-wider block">
                  Email Address
                </label>
                <div className="relative group">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 group-focus-within:text-gold transition-colors duration-200" />
                  <input
                    id="email-input"
                    type="email"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); setError(''); }}
                    placeholder="name@example.com"
                    className="w-full pl-10 pr-3.5 py-2.5 bg-[#F7F8FC] border border-slate-200 focus:border-gold focus:ring-4 focus:ring-gold/10 rounded-xl text-xs font-medium text-[#0B0E23] transition-all outline-none placeholder:text-slate-400"
                  />
                </div>
              </div>

              {/* Mobile Number */}
              <div className="space-y-1">
                <label htmlFor="mobile-input" className="text-[11px] font-bold text-[#0B0E23] uppercase tracking-wider block">
                  Mobile Number
                </label>
                <div className="relative group">
                  <Smartphone className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 group-focus-within:text-gold transition-colors duration-200" />
                  <input
                    id="mobile-input"
                    type="tel"
                    value={mobileNumber}
                    onChange={(e) => { setMobileNumber(e.target.value); setError(''); }}
                    placeholder="9876543210"
                    maxLength={10}
                    className="w-full pl-10 pr-3.5 py-2.5 bg-[#F7F8FC] border border-slate-200 focus:border-gold focus:ring-4 focus:ring-gold/10 rounded-xl text-xs font-medium text-[#0B0E23] transition-all outline-none placeholder:text-slate-400 font-mono"
                  />
                </div>
              </div>

              {/* Password */}
              <div className="space-y-1">
                <label htmlFor="password-input" className="text-[11px] font-bold text-[#0B0E23] uppercase tracking-wider block">
                  Password *
                </label>
                <div className="relative group">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 group-focus-within:text-gold transition-colors duration-200" />
                  <input
                    id="password-input"
                    type="password"
                    required
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); setError(''); }}
                    placeholder="••••••••"
                    className="w-full pl-10 pr-3.5 py-2.5 bg-[#F7F8FC] border border-slate-200 focus:border-gold focus:ring-4 focus:ring-gold/10 rounded-xl text-xs font-mono text-[#0B0E23] transition-all outline-none placeholder:text-slate-400"
                  />
                </div>
              </div>

              {/* Confirm Password */}
              <div className="space-y-1">
                <label htmlFor="confirm-password-input" className="text-[11px] font-bold text-[#0B0E23] uppercase tracking-wider block">
                  Confirm Password *
                </label>
                <div className="relative group">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 group-focus-within:text-gold transition-colors duration-200" />
                  <input
                    id="confirm-password-input"
                    type="password"
                    required
                    value={confirmPassword}
                    onChange={(e) => { setConfirmPassword(e.target.value); setError(''); }}
                    placeholder="••••••••"
                    className="w-full pl-10 pr-3.5 py-2.5 bg-[#F7F8FC] border border-slate-200 focus:border-gold focus:ring-4 focus:ring-gold/10 rounded-xl text-xs font-mono text-[#0B0E23] transition-all outline-none placeholder:text-slate-400"
                  />
                </div>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 px-4 bg-gradient-to-r from-gold via-gold-light to-gold-dark hover:from-gold-dark hover:to-gold disabled:opacity-70 text-white rounded-xl font-bold text-xs shadow-sm hover:shadow-md flex items-center justify-center gap-2 mt-3 transition-all"
              >
                {loading ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                    <span>Submitting Registration...</span>
                  </>
                ) : (
                  <>
                    <span>Create Customer Account</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>

            {/* RETURN TO LOGIN LINK */}
            <div className="pt-5 mt-5 border-t border-slate-100 text-center text-xs text-slate-500 font-medium">
              <span>Already have an account? </span>
              <button
                type="button"
                onClick={() => router.push('/auth/login')}
                className="text-gold font-bold hover:underline ml-1"
              >
                Sign In
              </button>
            </div>
          </>
        )}

      </div>
    </div>
  );
}
