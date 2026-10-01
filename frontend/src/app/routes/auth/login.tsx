import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Landmark, Lock, Mail, AlertCircle, Loader2, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/core/auth/hooks';

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
      const msg = err.response?.data?.error?.message || 'Invalid email or password. Please try again.';
      setError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDemoAccess = (roleKey: string) => {
    localStorage.setItem('campusflow_demo_role', roleKey);
    localStorage.setItem('access_token', 'demo-preview-token');
    window.location.href = '/';
  };

  const demoAccounts = [
    { label: 'Admin (Super)', role: 'super_admin', email: 'admin@campusflow.edu' },
    { label: 'Faculty', role: 'faculty', email: 'faculty.cse@campusflow.edu' },
    { label: 'Student', role: 'student', email: 'student1@campusflow.edu' },
    { label: 'Controller', role: 'exam_controller', email: 'controller@campusflow.edu' },
  ];

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8 font-sans">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <div className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-slate-900 text-white shadow-sm mb-4">
          <Landmark className="h-7 w-7" />
        </div>
        <h2 className="text-2xl font-bold tracking-tight text-slate-900">CampusFlow</h2>
        <p className="mt-1 text-sm text-slate-500 font-medium">Unified Academic & Examination Portal</p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-6 shadow-xs border border-slate-200 rounded-xl sm:px-10">
          <div className="mb-6">
            <h3 className="text-lg font-semibold text-slate-900">Institutional Single Sign-On</h3>
            <p className="text-xs text-slate-500 mt-1">
              Enter your university credentials to access courses, exams, and grades.
            </p>
          </div>

          <form className="space-y-5" onSubmit={handleSubmit}>
            {error && (
              <div className="flex items-start gap-2.5 rounded-lg bg-rose-50 border border-rose-200 p-3 text-xs text-rose-700">
                <AlertCircle className="h-4 w-4 shrink-0 text-rose-600 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                Institutional Email
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@campusflow.edu"
                  className="w-full pl-9 pr-3 h-10 text-sm rounded-lg border border-slate-300 focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600 text-slate-900 placeholder:text-slate-400 transition"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-medium text-slate-700">Password</label>
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <input
                  type="password"
                  required
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
              className="w-full flex items-center justify-center gap-2 rounded-lg bg-blue-600 h-10 px-4 text-sm font-medium text-white shadow-xs hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2 transition disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Authenticating...</span>
                </>
              ) : (
                <span>Sign In to Academic Portal</span>
              )}
            </button>
          </form>

          {/* Quick Access / Demo Credentials section */}
          <div className="mt-8 pt-6 border-t border-slate-200">
            <p className="text-xs font-medium text-slate-500 mb-3 text-center uppercase tracking-wider">
              Quick Access / Demo
            </p>
            <div className="grid grid-cols-2 gap-2">
              {demoAccounts.map((acc) => (
                <button
                  key={acc.email}
                  type="button"
                  onClick={() => handleDemoAccess(acc.role)}
                  className="text-xs py-1.5 px-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded text-slate-600 font-medium transition text-center"
                >
                  {acc.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Security & Compliance Footer */}
        <div className="mt-8 text-center space-y-2">
          <div className="flex items-center justify-center gap-1.5 text-xs text-slate-500">
            <ShieldCheck className="h-4 w-4" />
            <span className="font-medium">Official Institutional System</span>
          </div>
          <p className="text-[11px] text-slate-400 max-w-xs mx-auto">
            Authorized access only. All actions and examination attempts are audited.
          </p>
          <p className="text-[10px] text-slate-400 pt-2">
            CampusFlow Academic OS • Fall 2026 • Build 2.4.0
          </p>
        </div>
      </div>
    </div>
  );
}
