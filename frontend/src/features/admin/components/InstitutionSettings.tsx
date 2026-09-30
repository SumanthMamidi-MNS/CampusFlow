import React, { useState, useEffect } from 'react';
import {
  Building2,
  Palette,
  Mail,
  Phone,
  Clock,
  ShieldCheck,
  CheckCircle2,
  Loader2,
  Save,
  Globe,
  Sparkles,
} from 'lucide-react';
import { useInstitution, useUpdateInstitution } from '../api';

const PRESET_COLORS = [
  { name: 'Royal Blue', value: '#2563eb' },
  { name: 'Navy Slate', value: '#0f172a' },
  { name: 'Emerald', value: '#059669' },
  { name: 'Crimson', value: '#dc2626' },
  { name: 'Deep Purple', value: '#7c3aed' },
  { name: 'Amber Gold', value: '#d97706' },
];

export function InstitutionSettings() {
  const { data: institution, isLoading, error } = useInstitution();
  const updateMutation = useUpdateInstitution();

  const [name, setName] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [primaryColor, setPrimaryColor] = useState('#2563eb');
  const [timezone, setTimezone] = useState('UTC');
  const [contactEmail, setContactEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [allowLateSubmissions, setAllowLateSubmissions] = useState(true);
  const [examStrictProctoring, setExamStrictProctoring] = useState(true);
  const [maxLoginAttempts, setMaxLoginAttempts] = useState(5);
  const [savedSuccess, setSavedSuccess] = useState(false);

  useEffect(() => {
    if (institution) {
      setName(institution.name || '');
      setLogoUrl(institution.logo_url || '');
      setPrimaryColor(institution.primary_color || '#2563eb');
      setTimezone(institution.timezone || 'UTC');
      setContactEmail(institution.contact_email || '');
      setPhone(institution.phone || '');
      setAllowLateSubmissions(institution.policies?.allow_late_submissions ?? true);
      setExamStrictProctoring(institution.policies?.exam_strict_proctoring ?? true);
      setMaxLoginAttempts(institution.policies?.max_login_attempts ?? 5);
    }
  }, [institution]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavedSuccess(false);
    try {
      await updateMutation.mutateAsync({
        name,
        logo_url: logoUrl || null,
        primary_color: primaryColor,
        timezone,
        contact_email: contactEmail || null,
        phone: phone || null,
        policies: {
          allow_late_submissions: allowLateSubmissions,
          exam_strict_proctoring: examStrictProctoring,
          max_login_attempts: Number(maxLoginAttempts),
        },
      });
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 4000);
    } catch {
      // Error is captured in mutation state
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center text-sm text-red-700">
        Failed to load institution settings. Please check your network or try again.
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2.5">
            <Building2 className="h-6 w-6 text-blue-600" />
            Institution Branding & System Settings
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Configure institutional identity, custom branding palettes, contact information, and default academic policies.
          </p>
        </div>
        {savedSuccess && (
          <div className="flex items-center gap-2 rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-2 text-xs font-semibold text-emerald-800 animate-in fade-in">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            Branding settings saved successfully!
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Card 1: Branding & Identity */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
          <div className="flex items-center gap-2.5 border-b border-slate-100 pb-4">
            <Palette className="h-5 w-5 text-blue-600" />
            <h2 className="text-base font-semibold text-slate-900">Institutional Identity & Visual Theme</h2>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Institution Full Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Apex Institute of Technology"
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Institutional Code (Read-Only)
              </label>
              <input
                type="text"
                disabled
                value={institution?.code || 'CAMPUSFLOW'}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm font-mono text-slate-500 cursor-not-allowed"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Emblem / Logo URL (Optional)
              </label>
              <input
                type="url"
                value={logoUrl}
                onChange={(e) => setLogoUrl(e.target.value)}
                placeholder="https://example.edu/assets/logo.png"
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <p className="mt-1 text-xs text-slate-400">
                Provide a hosted direct image URL (PNG, SVG, or JPEG with transparent background).
              </p>
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-700 mb-2">
                Primary Brand Accent Color
              </label>
              <div className="flex flex-wrap items-center gap-3">
                {PRESET_COLORS.map((preset) => (
                  <button
                    type="button"
                    key={preset.value}
                    onClick={() => setPrimaryColor(preset.value)}
                    className={`flex items-center gap-2 rounded-xl border px-3 py-1.5 text-xs font-medium transition-all ${
                      primaryColor.toLowerCase() === preset.value.toLowerCase()
                        ? 'border-blue-600 bg-blue-50/50 text-slate-900 ring-2 ring-blue-600/20'
                        : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                    }`}
                  >
                    <span
                      className="h-3.5 w-3.5 rounded-full border border-black/10"
                      style={{ backgroundColor: preset.value }}
                    />
                    {preset.name}
                  </button>
                ))}
                <div className="flex items-center gap-2 pl-2">
                  <input
                    type="color"
                    value={primaryColor}
                    onChange={(e) => setPrimaryColor(e.target.value)}
                    className="h-8 w-8 cursor-pointer rounded-lg border border-slate-300 bg-transparent p-0.5"
                    title="Custom Color"
                  />
                  <span className="font-mono text-xs text-slate-600 uppercase">{primaryColor}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Live Preview Box */}
          <div className="mt-8 rounded-xl border border-slate-200 bg-slate-50/70 p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold text-slate-600 flex items-center gap-1.5 uppercase tracking-wider">
                <Sparkles className="h-3.5 w-3.5 text-blue-600" />
                Live Institutional Branding Preview
              </span>
              <span className="text-[11px] text-slate-400">Rendered with your chosen settings</span>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs flex items-center justify-between">
              <div className="flex items-center gap-3">
                {logoUrl ? (
                  <img
                    src={logoUrl}
                    alt="Logo"
                    className="h-9 w-9 rounded-lg object-contain border border-slate-100"
                    onError={(e) => {
                      (e.target as HTMLElement).style.display = 'none';
                    }}
                  />
                ) : (
                  <div
                    className="flex h-9 w-9 items-center justify-center rounded-lg text-white font-bold text-sm shadow-xs"
                    style={{ backgroundColor: primaryColor }}
                  >
                    {(name || 'CF').slice(0, 2).toUpperCase()}
                  </div>
                )}
                <div>
                  <div className="text-sm font-bold text-slate-900">{name || 'CampusFlow University'}</div>
                  <div className="text-xs text-slate-500 flex items-center gap-1.5">
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    Official Academic Portal ({institution?.code || 'CAMPUSFLOW'})
                  </div>
                </div>
              </div>

              <button
                type="button"
                className="px-3.5 py-1.5 rounded-lg text-xs font-semibold text-white shadow-xs"
                style={{ backgroundColor: primaryColor }}
              >
                Access Portal
              </button>
            </div>
          </div>
        </div>

        {/* Card 2: Contact & Regional */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
          <div className="flex items-center gap-2.5 border-b border-slate-100 pb-4">
            <Globe className="h-5 w-5 text-blue-600" />
            <h2 className="text-base font-semibold text-slate-900">Campus Contact & Regional Settings</h2>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1 flex items-center gap-1.5">
                <Mail className="h-3.5 w-3.5 text-slate-400" />
                Contact / Support Email
              </label>
              <input
                type="email"
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
                placeholder="registrar@college.edu"
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1 flex items-center gap-1.5">
                <Phone className="h-3.5 w-3.5 text-slate-400" />
                Campus Helpline
              </label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+1 (555) 123-4567"
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1 flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 text-slate-400" />
                Timezone
              </label>
              <select
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="UTC">UTC (Universal Coordinated)</option>
                <option value="America/New_York">America/New_York (EST/EDT)</option>
                <option value="America/Chicago">America/Chicago (CST/CDT)</option>
                <option value="America/Los_Angeles">America/Los_Angeles (PST/PDT)</option>
                <option value="Europe/London">Europe/London (GMT/BST)</option>
                <option value="Asia/Kolkata">Asia/Kolkata (IST)</option>
                <option value="Asia/Singapore">Asia/Singapore (SGT)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Card 3: Academic & Exam Policies */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
          <div className="flex items-center gap-2.5 border-b border-slate-100 pb-4">
            <ShieldCheck className="h-5 w-5 text-blue-600" />
            <h2 className="text-base font-semibold text-slate-900">Institution-Wide Academic & Exam Policies</h2>
          </div>

          <div className="mt-6 space-y-4">
            <label className="flex items-start gap-3 p-3.5 rounded-xl border border-slate-100 hover:bg-slate-50/50 cursor-pointer transition-colors">
              <input
                type="checkbox"
                checked={examStrictProctoring}
                onChange={(e) => setExamStrictProctoring(e.target.checked)}
                className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              <div>
                <div className="text-sm font-semibold text-slate-900">
                  Strict Exam Proctoring by Default
                </div>
                <div className="text-xs text-slate-500">
                  Enforces tab switch tracking, fullscreen lockdown, and right-click disabling on newly scheduled examinations.
                </div>
              </div>
            </label>

            <label className="flex items-start gap-3 p-3.5 rounded-xl border border-slate-100 hover:bg-slate-50/50 cursor-pointer transition-colors">
              <input
                type="checkbox"
                checked={allowLateSubmissions}
                onChange={(e) => setAllowLateSubmissions(e.target.checked)}
                className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              <div>
                <div className="text-sm font-semibold text-slate-900">
                  Permit Late Assignment Submissions
                </div>
                <div className="text-xs text-slate-500">
                  Allow students to upload assignment solutions past the specified deadline, automatically applying the course instructor's late penalty rubric.
                </div>
              </div>
            </label>

            <div className="pt-2 flex items-center justify-between border-t border-slate-100">
              <div>
                <div className="text-sm font-semibold text-slate-900">
                  Maximum Failed Authentication Attempts
                </div>
                <div className="text-xs text-slate-500">
                  Temporarily lock accounts after excessive invalid password entries.
                </div>
              </div>
              <input
                type="number"
                min={3}
                max={15}
                value={maxLoginAttempts}
                onChange={(e) => setMaxLoginAttempts(Number(e.target.value))}
                className="w-24 rounded-xl border border-slate-300 px-3 py-1.5 text-sm text-center text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>

        {/* Submit Actions */}
        <div className="flex items-center justify-end gap-3 pt-4">
          <button
            type="submit"
            disabled={updateMutation.isPending}
            className="flex items-center gap-2 rounded-xl bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white shadow-xs hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {updateMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Saving Changes...
              </>
            ) : (
              <>
                <Save className="h-4 w-4" />
                Save Institutional Settings
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
