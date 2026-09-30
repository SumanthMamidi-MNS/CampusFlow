import { useInstitutionalOverview } from '../api';
import {
  Activity,
  BookOpen,
  Building2,
  CheckCircle2,
  GraduationCap,
  TrendingUp,
  Users,
} from 'lucide-react';


export function InstitutionalAnalytics() {
  const { data: overview, isLoading } = useInstitutionalOverview();

  if (isLoading) {
    return <div className="p-12 text-center text-xs text-slate-400">Loading institutional overview...</div>;
  }

  if (!overview) {
    return <div className="p-12 text-center text-xs text-slate-400">No institutional data available.</div>;
  }

  const kpis = [
    {
      title: 'Enrolled Students',
      value: overview.total_students,
      icon: Users,
      color: 'text-blue-600',
      bg: 'bg-blue-50',
      borderColor: 'border-blue-100',
    },
    {
      title: 'Faculty & Instructors',
      value: overview.total_faculty,
      icon: GraduationCap,
      color: 'text-indigo-600',
      bg: 'bg-indigo-50',
      borderColor: 'border-indigo-100',
    },
    {
      title: 'Academic Departments',
      value: overview.total_departments,
      icon: Building2,
      color: 'text-violet-600',
      bg: 'bg-violet-50',
      borderColor: 'border-violet-100',
    },
    {
      title: 'Active Courses',
      value: overview.total_courses,
      icon: BookOpen,
      color: 'text-emerald-600',
      bg: 'bg-emerald-50',
      borderColor: 'border-emerald-100',
    },
    {
      title: 'Examinations Delivered',
      value: overview.total_exams,
      icon: CheckCircle2,
      color: 'text-sky-600',
      bg: 'bg-sky-50',
      borderColor: 'border-sky-100',
    },
    {
      title: 'Overall Pass Rate',
      value: `${overview.overall_pass_rate}%`,
      icon: TrendingUp,
      color: 'text-amber-600',
      bg: 'bg-amber-50',
      borderColor: 'border-amber-100',
    },
  ];

  return (
    <div className="space-y-6">
      {/* KPI Cards Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {kpis.map((kpi) => {
          const Icon = kpi.icon;
          return (
            <div
              key={kpi.title}
              className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs hover:border-slate-300 transition-colors"
            >
              <div className="flex items-center justify-between">
                <div className={`p-2 rounded-xl ${kpi.bg}`}>
                  <Icon className={`h-4 w-4 ${kpi.color}`} />
                </div>
              </div>
              <p className="text-2xl font-bold text-slate-900 mt-3">{kpi.value}</p>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mt-0.5">
                {kpi.title}
              </p>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Department Enrollment Breakdown */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Department Performance</h3>
              <p className="text-xs text-slate-500">Course offerings and enrollment counts by department</p>
            </div>
            <Building2 className="h-4 w-4 text-slate-400" />
          </div>

          <div className="space-y-4">
            {!overview.department_enrollment_breakdown || overview.department_enrollment_breakdown.length === 0 ? (
              <p className="text-xs text-slate-400 italic py-4">No department records found.</p>
            ) : (
              overview.department_enrollment_breakdown.map((dept) => {
                const maxEnrolled = Math.max(
                  ...overview.department_enrollment_breakdown.map((d) => d.students_enrolled),
                  1
                );
                const pct = Math.round((dept.students_enrolled / maxEnrolled) * 100);

                return (
                  <div key={dept.department_id} className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <div>
                        <span className="font-semibold text-slate-800">{dept.department_name}</span>
                        <span className="ml-2 font-mono text-[11px] text-slate-400">({dept.code})</span>
                      </div>
                      <div className="text-right">
                        <span className="font-bold text-slate-900">{dept.students_enrolled}</span>
                        <span className="text-slate-400 text-[11px]"> students • {dept.courses_count} courses</span>
                      </div>
                    </div>
                    <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                      <div
                        className="bg-blue-600 h-full rounded-full transition-all duration-500"
                        style={{ width: `${Math.max(pct, 5)}%` }}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Recent Institutional Activity Log */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Recent Institutional Activity</h3>
              <p className="text-xs text-slate-500">Audited administrative actions and examination events</p>
            </div>
            <Activity className="h-4 w-4 text-slate-400" />
          </div>

          <div className="space-y-3">
            {!overview.recent_activity || overview.recent_activity.length === 0 ? (
              <p className="text-xs text-slate-400 italic py-4">No recent activity logged.</p>
            ) : (
              overview.recent_activity.map((act) => (
                <div
                  key={act.id}
                  className="flex items-start justify-between rounded-xl border border-slate-100 bg-slate-50/70 p-3 hover:bg-slate-50 transition-colors"
                >
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-semibold text-slate-800">
                        {act.action}
                      </span>
                      <span className="rounded-md bg-blue-100 px-1.5 py-0.5 text-[10px] font-semibold text-blue-800 uppercase">
                        {act.resource_type}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500">{act.user_email || 'System'}</p>
                  </div>
                  <span className="text-[11px] text-slate-400 shrink-0">
                    {new Date(act.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
