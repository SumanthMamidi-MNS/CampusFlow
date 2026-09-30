import { useStudentDashboardAnalytics } from '../api';
import {
  AlertCircle,
  Award,
  BookOpen,
  Calendar,
  CheckCircle2,
  FileText,
  GraduationCap,
  Sparkles,
} from 'lucide-react';

export function StudentDashboard() {
  const { data: analytics, isLoading } = useStudentDashboardAnalytics();

  if (isLoading) {
    return <div className="p-12 text-center text-xs text-slate-400">Loading your academic dashboard...</div>;
  }

  if (!analytics) {
    return <div className="p-12 text-center text-xs text-slate-400">No dashboard information available.</div>;
  }

  const kpis = [
    {
      title: 'Enrolled Courses',
      value: analytics.enrolled_courses_count,
      icon: BookOpen,
      color: 'text-blue-600',
      bg: 'bg-blue-50',
    },
    {
      title: 'Completed Tasks',
      value: analytics.completed_assignments_count,
      icon: CheckCircle2,
      color: 'text-emerald-600',
      bg: 'bg-emerald-50',
    },
    {
      title: 'Pending Deadlines',
      value: analytics.pending_assignments_count,
      icon: AlertCircle,
      color: analytics.pending_assignments_count > 0 ? 'text-amber-600' : 'text-slate-500',
      bg: analytics.pending_assignments_count > 0 ? 'bg-amber-50' : 'bg-slate-50',
    },
    {
      title: 'Upcoming Exams',
      value: analytics.upcoming_exams_count,
      icon: Calendar,
      color: 'text-indigo-600',
      bg: 'bg-indigo-50',
    },
    {
      title: 'Completed Exams',
      value: analytics.completed_exams_count,
      icon: Award,
      color: 'text-sky-600',
      bg: 'bg-sky-50',
    },
    {
      title: 'Cumulative Average',
      value: analytics.overall_average_percentage !== null ? `${analytics.overall_average_percentage}%` : 'N/A',
      icon: Sparkles,
      color: 'text-amber-500',
      bg: 'bg-amber-50',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Student KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {kpis.map((kpi) => {
          const Icon = kpi.icon;
          return (
            <div
              key={kpi.title}
              className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs hover:border-slate-300 transition-colors"
            >
              <div className={`p-2 rounded-xl w-fit ${kpi.bg}`}>
                <Icon className={`h-4 w-4 ${kpi.color}`} />
              </div>
              <p className="text-2xl font-bold text-slate-900 mt-3">{kpi.value}</p>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mt-0.5">
                {kpi.title}
              </p>
            </div>
          );
        })}
      </div>

      {/* Recent Evaluations & Scores */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Recent Graded Work</h3>
            <p className="text-xs text-slate-500">Your latest graded assignments and examination scorecards</p>
          </div>
          <GraduationCap className="h-5 w-5 text-slate-400" />
        </div>

        {analytics.recent_scores.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-400 italic">
            No graded submissions or examination results available yet.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {analytics.recent_scores.map((sc, idx) => (
              <div
                key={idx}
                className="py-3 flex items-center justify-between hover:bg-slate-50/80 px-2 rounded-xl transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`p-2 rounded-xl ${
                      sc.type === 'exam' ? 'bg-indigo-50 text-indigo-600' : 'bg-blue-50 text-blue-600'
                    }`}
                  >
                    {sc.type === 'exam' ? <Award className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-xs font-bold text-slate-800">{sc.title}</p>
                      <span className="capitalize text-[10px] font-semibold text-slate-400 px-1.5 py-0.5 rounded-md bg-slate-100">
                        {sc.type}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Graded on {new Date(sc.date).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <p className="text-xs font-bold text-slate-900">{sc.score} pts</p>
                    <p
                      className={`text-[11px] font-bold ${
                        sc.percentage >= 80
                          ? 'text-emerald-600'
                          : sc.percentage >= 60
                          ? 'text-amber-600'
                          : 'text-rose-600'
                      }`}
                    >
                      {sc.percentage}%
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
