import { useEffect, useState } from 'react';
import { useNotificationPreferences, useUpdateNotificationPreferences } from '../api';
import { Bell, Check, Mail, Settings, X } from 'lucide-react';

export function NotificationPreferencesModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const { data: preferences, isLoading } = useNotificationPreferences();
  const updateMutation = useUpdateNotificationPreferences();

  const [form, setForm] = useState({
    email_assignments: true,
    email_grades: true,
    email_exams: true,
    email_announcements: true,
    in_app_assignments: true,
    in_app_grades: true,
    in_app_exams: true,
    in_app_announcements: true,
  });

  const [savedSuccess, setSavedSuccess] = useState(false);

  useEffect(() => {
    if (preferences) {
      setForm({
        email_assignments: preferences.email_assignments,
        email_grades: preferences.email_grades,
        email_exams: preferences.email_exams,
        email_announcements: preferences.email_announcements,
        in_app_assignments: preferences.in_app_assignments,
        in_app_grades: preferences.in_app_grades,
        in_app_exams: preferences.in_app_exams,
        in_app_announcements: preferences.in_app_announcements,
      });
    }
  }, [preferences]);

  if (!isOpen) return null;

  const handleToggle = (key: keyof typeof form) => {
    setForm((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSave = async () => {
    try {
      await updateMutation.mutateAsync(form);
      setSavedSuccess(true);
      setTimeout(() => {
        setSavedSuccess(false);
        onClose();
      }, 1200);
    } catch {
      alert('Failed to update notification preferences.');
    }
  };

  const categories = [
    {
      title: 'Assignments',
      desc: 'New assignments posted, deadline reminders, and submissions',
      inAppKey: 'in_app_assignments' as const,
      emailKey: 'email_assignments' as const,
    },
    {
      title: 'Grades & Feedback',
      desc: 'Evaluation results, feedback comments, and rubric scores',
      inAppKey: 'in_app_grades' as const,
      emailKey: 'email_grades' as const,
    },
    {
      title: 'Examinations',
      desc: 'Schedule announcements, exam window starts, and published scorecards',
      inAppKey: 'in_app_exams' as const,
      emailKey: 'email_exams' as const,
    },
    {
      title: 'Course Announcements',
      desc: 'Pinned announcements and faculty course updates',
      inAppKey: 'in_app_announcements' as const,
      emailKey: 'email_announcements' as const,
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
      <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-lg overflow-hidden animate-in fade-in duration-150">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-blue-50 text-blue-600">
              <Settings className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-900">Notification Preferences</h2>
              <p className="text-xs text-slate-500">Configure multi-channel alerts and email dispatches</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 space-y-5 max-h-[70vh] overflow-y-auto">
          {isLoading ? (
            <div className="py-8 text-center text-xs text-slate-400">Loading preferences...</div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-12 text-[11px] font-semibold text-slate-400 uppercase tracking-wider px-3">
                <span className="col-span-8">Category</span>
                <span className="col-span-2 text-center flex items-center justify-center gap-1">
                  <Bell className="h-3 w-3" /> In-App
                </span>
                <span className="col-span-2 text-center flex items-center justify-center gap-1">
                  <Mail className="h-3 w-3" /> Email
                </span>
              </div>

              {categories.map((cat) => (
                <div
                  key={cat.title}
                  className="grid grid-cols-12 items-center rounded-xl border border-slate-200 bg-slate-50/60 p-3.5 hover:bg-slate-50 transition-colors gap-2"
                >
                  <div className="col-span-8">
                    <p className="text-xs font-semibold text-slate-800">{cat.title}</p>
                    <p className="text-[11px] text-slate-500 mt-0.5">{cat.desc}</p>
                  </div>

                  <div className="col-span-2 flex justify-center">
                    <input
                      type="checkbox"
                      checked={form[cat.inAppKey]}
                      onChange={() => handleToggle(cat.inAppKey)}
                      className="h-4 w-4 rounded-sm border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                    />
                  </div>

                  <div className="col-span-2 flex justify-center">
                    <input
                      type="checkbox"
                      checked={form[cat.emailKey]}
                      onChange={() => handleToggle(cat.emailKey)}
                      className="h-4 w-4 rounded-sm border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="border-t border-slate-200 px-6 py-3.5 bg-slate-50 rounded-b-2xl flex items-center justify-between">
          <span className="text-[11px] text-slate-400">Critical security & account alerts are always sent.</span>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="rounded-xl px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-200 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={updateMutation.isPending}
              className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors shadow-xs"
            >
              {savedSuccess ? (
                <>
                  <Check className="h-3.5 w-3.5 text-emerald-300" /> Saved!
                </>
              ) : updateMutation.isPending ? (
                'Saving...'
              ) : (
                'Save Preferences'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
