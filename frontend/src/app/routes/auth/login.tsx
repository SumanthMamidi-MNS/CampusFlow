import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Lock, Mail, AlertCircle, Loader2, ShieldCheck, Info } from 'lucide-react';
import { useAuth } from '@/core/auth/hooks';
import { BrandMark } from '@/core/components/brand/BrandMark';

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      await login(email, password);
      navigate('/', { replace: true });
    } catch (err: any) {
      const msg =
        err.response?.data?.error?.message ||
        'Unable to sign in. Please check your credentials and try again.';
      setError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8 font-sans">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <Link to="/" aria-label="Back to the CampusFlow home page" className="mx-auto block w-fit">
          <BrandMark className="h-14 w-14" />
        </Link>
        <h1 className="mt-4 text-2xl font-bold tracking-tight text-slate-900">Campus<span className="text-indigo-600">Flow</span></h1>
        <p className="mt-1 text-sm text-slate-500 font-medium">Unified Academic & Examination Portal</p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div
          role="status"
          className="mb-4 flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-[12.5px] leading-relaxed text-amber-900"
        >
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
          <span>
            <span className="font-semibold">Not deployed yet — coming soon.</span> This is the
            finished product, presented; the hosted instance is being prepared and will be deployed
            soon. Once it is live, your college provisions your account and this page opens for it.
            There is no public sign-up.
          </span>
        </div>

        <div className="bg-white py-8 px-6 shadow-xs border border-slate-200 rounded-xl sm:px-10">
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-slate-900">Institutional Sign-In</h2>
            <p className="text-xs text-slate-500 mt-1">
              Enter your institutional credentials to access courses, assessments, and grades.
            </p>
          </div>

          <form className="space-y-5" onSubmit={handleSubmit} noValidate>
          {error && (
            <div
              role="alert"
              className="flex items-start gap-2.5 rounded-lg bg-rose-50 border border-rose-200 p-3 text-xs text-rose-700"
            >
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-600 mt-0.5" aria-hidden="true" />
              <span>{error}</span>
            </div>
          )}

            <div>
              <label htmlFor="login-email" className="block text-xs font-medium text-slate-700 mb-1.5">
                Institutional Email
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" aria-hidden="true" />
                <input
                  id="login-email"
                  name="email"
                  type="email"
                  required
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@institution.edu"
                  className="w-full pl-9 pr-3 h-10 text-sm rounded-lg border border-slate-300 focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600 text-slate-900 placeholder:text-slate-400 transition"
                />
              </div>
            </div>

            <div>
              <label htmlFor="login-password" className="block text-xs font-medium text-slate-700 mb-1.5">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" aria-hidden="true" />
                <input
                  id="login-password"
                  name="password"
                  type="password"
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-9 pr-3 h-10 text-sm rounded-lg border border-slate-300 focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600 text-slate-900 placeholder:text-slate-400 transition"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full flex items-center justify-center gap-2 rounded-lg bg-blue-600 h-10 px-4 text-sm font-medium text-white shadow-xs hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 transition disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  <span>Signing in…</span>
                </>
              ) : (
                <span>Sign In to Academic Portal</span>
              )}
            </button>
          </form>

        </div>

        <div className="mt-8 text-center space-y-2">
          <div className="flex items-center justify-center gap-1.5 text-xs text-slate-500">
            <ShieldCheck className="h-4 w-4" aria-hidden="true" />
            <span className="font-medium">Official Institutional System</span>
          </div>
          <p className="text-[11px] text-slate-400 max-w-xs mx-auto">
            Authorized access only. Your activity and assessment attempts are recorded for audit
            purposes. Contact your institution administrator if you need account access.
          </p>
          <Link
            to="/"
            className="inline-block text-xs font-medium text-slate-500 transition-colors hover:text-slate-800"
          >
            ← Back to the CampusFlow home page
          </Link>
        </div>
      </div>
    </div>
  );
}
