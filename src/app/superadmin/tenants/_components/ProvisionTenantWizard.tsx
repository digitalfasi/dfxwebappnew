"use client";

import React, { useMemo, useState } from 'react';
import {
  Building2, User as UserIcon, CreditCard, Palette, ClipboardCheck, ArrowLeft, ArrowRight,
  Check, Copy, CheckCircle2, Mail, KeyRound, Link as LinkIcon, Loader2,
} from 'lucide-react';
import { Dialog, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, Textarea } from '@/components/ui/form-controls';
import { cn } from '@/lib/utils';
import {
  superAdminService,
  SubscriptionPlan,
  TenantProvisionRequest,
  TenantProvisionResult,
} from '@/services/superAdminService';
import { ApiError } from '@/lib/apiClient';

interface ProvisionTenantWizardProps {
  isOpen: boolean;
  onClose: () => void;
  /** Called once a tenant is genuinely created, so the parent page can refresh its list. */
  onProvisioned: () => void;
}

const WIZARD_STEPS = ['Business Information', 'Admin Information', 'Subscription', 'Branding', 'Review'] as const;
const STEP_ICONS = [Building2, UserIcon, CreditCard, Palette, ClipboardCheck];

const PLAN_OPTIONS: { key: SubscriptionPlan; label: string; hint: string }[] = [
  { key: 'Starter', label: 'Starter', hint: 'Small single-branch stores' },
  { key: 'Professional', label: 'Professional', hint: 'Most jewellers' },
  { key: 'Business', label: 'Business', hint: 'Multi-branch chains' },
  { key: 'Enterprise', label: 'Enterprise', hint: 'Large operations' },
];

const DEFAULT_FORM: TenantProvisionRequest = {
  businessName: '',
  subdomain: '',
  businessAddress: '',
  businessPhone: '',
  contactEmail: '',
  gstNumber: '',
  adminName: '',
  adminEmail: '',
  adminPhone: '',
  plan: 'Professional',
  trialDays: 14,
  brandColor: '#2C6FBD',
};

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const CopyField: React.FC<{ label: string; value: string; icon: React.ElementType; monospace?: boolean }> = ({
  label,
  value,
  icon: Icon,
  monospace,
}) => {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard API can be unavailable (e.g. insecure context) — the value is still visible to select/copy manually.
    }
  };
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
      <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1.5">
        <Icon className="w-3 h-3" />
        <span>{label}</span>
      </div>
      <div className="flex items-center gap-2">
        <code
          className={cn(
            'flex-1 min-w-0 truncate text-xs text-[#0B0E23] font-semibold',
            monospace && 'font-mono'
          )}
        >
          {value}
        </code>
        <button
          type="button"
          onClick={handleCopy}
          className={cn(
            'shrink-0 p-1.5 rounded-lg transition-colors',
            copied ? 'bg-emerald-100 text-emerald-700' : 'text-slate-400 hover:bg-slate-200 hover:text-slate-700'
          )}
          title="Copy to clipboard"
        >
          {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
        </button>
      </div>
    </div>
  );
};

export const ProvisionTenantWizard: React.FC<ProvisionTenantWizardProps> = ({ isOpen, onClose, onProvisioned }) => {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<TenantProvisionRequest>(DEFAULT_FORM);
  const [subdomainTouched, setSubdomainTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<TenantProvisionResult | null>(null);

  const set = <K extends keyof TenantProvisionRequest>(key: K, value: TenantProvisionRequest[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const handleBusinessNameChange = (value: string) => {
    set('businessName', value);
    if (!subdomainTouched) set('subdomain', slugify(value));
  };

  const reset = () => {
    setStep(0);
    setForm(DEFAULT_FORM);
    setSubdomainTouched(false);
    setError('');
    setResult(null);
  };

  const handleClose = () => {
    if (submitting) return;
    onClose();
    // Give the close animation a beat before wiping state, so the dialog
    // doesn't visibly reset itself before it's fully off-screen.
    setTimeout(reset, 200);
  };

  const stepValid = useMemo(() => {
    switch (step) {
      case 0:
        return form.businessName.trim().length >= 2 && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(form.subdomain) &&
          form.businessAddress.trim().length >= 5 && form.businessPhone.trim().length >= 10;
      case 1:
        return form.adminName.trim().length >= 2 && /\S+@\S+\.\S+/.test(form.adminEmail);
      case 2:
        return form.trialDays >= 0;
      default:
        return true;
    }
  }, [step, form]);

  const goNext = () => setStep((s) => Math.min(s + 1, WIZARD_STEPS.length - 1));
  const goBack = () => setStep((s) => Math.max(s - 1, 0));

  const handleProvision = async () => {
    setSubmitting(true);
    setError('');
    try {
      const provisioned = await superAdminService.provisionTenant(form);
      setResult(provisioned);
      onProvisioned();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not provision this tenant. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog isOpen={isOpen} onClose={handleClose} title={result ? 'Tenant Provisioned' : 'Provision New Business'} maxWidth="max-w-2xl">
      {result ? (
        <div className="space-y-4">
          <div className="flex items-center gap-3 p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200">
            <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm font-bold text-emerald-800">{result.tenant.name} is live</p>
              <p className="text-[11px] text-emerald-700">
                Subdomain <span className="font-mono">{result.tenant.slug}</span> · {result.subscription.plan} plan
                {result.subscription.trialEndsAt && ` · Trial ends ${new Date(result.subscription.trialEndsAt).toLocaleDateString('en-IN', { dateStyle: 'medium' })}`}
              </p>
            </div>
          </div>

          {!result.onboardingEmailSent && (
            <p className="text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
              The onboarding email could not be sent — share the credentials below with the business owner manually.
            </p>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <CopyField label="Admin Login Email" value={result.admin.email ?? '—'} icon={Mail} />
            <CopyField label="Temporary Password" value={result.temporaryPassword} icon={KeyRound} monospace />
          </div>
          <CopyField label="Activation Link (set a real password, expires once used)" value={result.activationLink} icon={LinkIcon} />

          <p className="text-[10px] text-slate-400 leading-relaxed">
            The temporary password is shown here once and was never emailed or logged — copy it now if you need to
            share it directly. The activation link lets {result.admin.name} set their own password immediately;
            it also works with the &quot;Forgot Password&quot; flow on the login page once it expires.
          </p>

          <DialogFooter>
            <Button size="sm" onClick={handleClose} className="w-full">
              Done
            </Button>
          </DialogFooter>
        </div>
      ) : (
        <div className="space-y-4">
          {/* STEP INDICATOR */}
          <div className="flex items-center gap-1">
            {WIZARD_STEPS.map((label, index) => {
              const Icon = STEP_ICONS[index];
              const isActive = index === step;
              const isDone = index < step;
              return (
                <React.Fragment key={label}>
                  <div
                    className={cn(
                      'flex items-center justify-center w-7 h-7 rounded-full text-[11px] font-bold shrink-0 transition-colors',
                      isActive
                        ? 'bg-gold text-white'
                        : isDone
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-slate-100 text-slate-400'
                    )}
                    title={label}
                  >
                    {isDone ? <Check className="w-3.5 h-3.5" /> : <Icon className="w-3.5 h-3.5" />}
                  </div>
                  {index < WIZARD_STEPS.length - 1 && (
                    <div className={cn('h-0.5 flex-1', isDone ? 'bg-emerald-200' : 'bg-slate-150')} />
                  )}
                </React.Fragment>
              );
            })}
          </div>
          <p className="text-xs font-bold text-[#0B0E23]">{WIZARD_STEPS[step]}</p>

          {/* STEP CONTENT */}
          <div className="space-y-3 text-xs min-h-[280px]">
            {step === 0 && (
              <>
                <Field label="Business Name *">
                  <Input value={form.businessName} onChange={(e) => handleBusinessNameChange(e.target.value)} placeholder="Royal Gold & Diamonds" />
                </Field>
                <Field label="Subdomain *" hint="Lowercase, hyphens only — must be unique.">
                  <Input
                    value={form.subdomain}
                    onChange={(e) => { setSubdomainTouched(true); set('subdomain', slugify(e.target.value)); }}
                    placeholder="royal-gold-diamonds"
                  />
                </Field>
                <Field label="Business Address *">
                  <Textarea value={form.businessAddress} onChange={(e) => set('businessAddress', e.target.value)} placeholder="Seeds the tenant's first Branch" rows={2} />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Business Phone *">
                    <Input value={form.businessPhone} onChange={(e) => set('businessPhone', e.target.value)} placeholder="9876543210" />
                  </Field>
                  <Field label="GST Number">
                    <Input value={form.gstNumber} onChange={(e) => set('gstNumber', e.target.value)} placeholder="Optional" />
                  </Field>
                </div>
                <Field label="Business Contact Email">
                  <Input type="email" value={form.contactEmail} onChange={(e) => set('contactEmail', e.target.value)} placeholder="Optional — distinct from the Admin's login email" />
                </Field>
              </>
            )}

            {step === 1 && (
              <>
                <Field label="Admin Full Name *">
                  <Input value={form.adminName} onChange={(e) => set('adminName', e.target.value)} placeholder="Priya Sharma" />
                </Field>
                <Field label="Admin Login Email *" hint="A temporary password and activation link are sent here.">
                  <Input type="email" value={form.adminEmail} onChange={(e) => set('adminEmail', e.target.value)} placeholder="priya@royalgold.com" />
                </Field>
                <Field label="Admin Phone">
                  <Input value={form.adminPhone} onChange={(e) => set('adminPhone', e.target.value)} placeholder="Optional" />
                </Field>
              </>
            )}

            {step === 2 && (
              <>
                <Field label="Plan">
                  <div className="grid grid-cols-2 gap-2.5">
                    {PLAN_OPTIONS.map((p) => (
                      <button
                        key={p.key}
                        type="button"
                        onClick={() => set('plan', p.key)}
                        className={cn(
                          'flex flex-col items-start gap-0.5 p-3 rounded-xl border text-left transition-all',
                          form.plan === p.key ? 'bg-gold text-white border-gold shadow-sm' : 'bg-white border-slate-200 hover:border-gold/50'
                        )}
                      >
                        <span className="text-xs font-bold">{p.label}</span>
                        <span className={cn('text-[10px]', form.plan === p.key ? 'text-white/80' : 'text-slate-400')}>{p.hint}</span>
                      </button>
                    ))}
                  </div>
                </Field>
                <Field label="Trial Length (days)">
                  <Input
                    type="number"
                    min={0}
                    max={365}
                    value={form.trialDays}
                    onChange={(e) => set('trialDays', e.target.value ? parseInt(e.target.value, 10) : 0)}
                  />
                </Field>
              </>
            )}

            {step === 3 && (
              <>
                <Field label="Brand Color" hint="Shown on the tenant's dashboard once branding UI is wired up.">
                  <div className="flex items-center gap-2.5">
                    <input
                      type="color"
                      value={form.brandColor || '#2C6FBD'}
                      onChange={(e) => set('brandColor', e.target.value)}
                      className="w-11 h-10 rounded-xl border border-slate-200 cursor-pointer bg-white"
                    />
                    <Input value={form.brandColor} onChange={(e) => set('brandColor', e.target.value)} placeholder="#2C6FBD" className="font-mono" />
                  </div>
                </Field>
                <p className="text-[10px] text-slate-400">
                  A logo upload isn&apos;t part of this wizard yet — the tenant starts with this color and no logo,
                  same as every other tenant provisioned today.
                </p>
              </>
            )}

            {step === 4 && (
              <div className="space-y-2.5">
                <ReviewRow label="Business" value={`${form.businessName} (${form.subdomain})`} />
                <ReviewRow label="Address" value={form.businessAddress} />
                <ReviewRow label="Phone" value={form.businessPhone} />
                {form.contactEmail && <ReviewRow label="Contact Email" value={form.contactEmail} />}
                {form.gstNumber && <ReviewRow label="GST" value={form.gstNumber} />}
                <ReviewRow label="Admin" value={`${form.adminName} — ${form.adminEmail}`} />
                <ReviewRow label="Plan" value={`${form.plan} (${form.trialDays}-day trial)`} />
                <ReviewRow label="Brand Color" value={form.brandColor || '#2C6FBD'} swatch />
                {error && (
                  <p className="text-[11px] font-semibold text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
                    {error}
                  </p>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            {step > 0 && (
              <Button variant="outline" size="sm" onClick={goBack} disabled={submitting} className="gap-1.5">
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back</span>
              </Button>
            )}
            {step < WIZARD_STEPS.length - 1 ? (
              <Button size="sm" onClick={goNext} disabled={!stepValid} className="gap-1.5">
                <span>Continue</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Button>
            ) : (
              <Button size="sm" onClick={handleProvision} isLoading={submitting} className="gap-1.5">
                {!submitting && <Check className="w-3.5 h-3.5" />}
                <span>{submitting ? 'Provisioning…' : 'Provision Workspace'}</span>
              </Button>
            )}
          </DialogFooter>
        </div>
      )}
    </Dialog>
  );
};

const Field: React.FC<{ label: string; hint?: string; children: React.ReactNode }> = ({ label, hint, children }) => (
  <div className="space-y-1">
    <label className="font-bold text-slate-500 uppercase text-[10px] block">{label}</label>
    {children}
    {hint && <p className="text-[10px] text-slate-400">{hint}</p>}
  </div>
);

const ReviewRow: React.FC<{ label: string; value: string; swatch?: boolean }> = ({ label, value, swatch }) => (
  <div className="flex items-center justify-between gap-3 py-1.5 border-b border-slate-100 last:border-0">
    <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wide shrink-0">{label}</span>
    <span className="text-xs font-semibold text-[#0B0E23] text-right flex items-center gap-1.5">
      {swatch && <span className="w-3.5 h-3.5 rounded-full border border-slate-200 shrink-0" style={{ backgroundColor: value }} />}
      {value}
    </span>
  </div>
);
