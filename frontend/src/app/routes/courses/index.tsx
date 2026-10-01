import { useState } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, Search, UserCheck, ExternalLink } from 'lucide-react';
import { PageHeader } from '@/core/components/layout/page-header';
import { useCourseOfferings } from '@/features/courses/api';
import { useAuth } from '@/core/auth/hooks';

export function CoursesListPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const { user } = useAuth();
  const { data: offerings, isLoading, isError } = useCourseOfferings();

  const isPrivileged = user?.roles.some((r) =>
    ['admin', 'super_admin', 'department_head'].includes(r)
  );

  const filteredOfferings = (offerings || []).filter((off) => {
    const titleMatch = (off.course_title || '').toLowerCase().includes(searchTerm.toLowerCase());
    const codeMatch = (off.course_code || '').toLowerCase().includes(searchTerm.toLowerCase());
    return titleMatch || codeMatch;
  });

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <PageHeader
        title="Courses & Offerings"
        description="Access learning materials, assignments, scheduled examinations, and class announcements."
        actions={
          isPrivileged && (
            <div className="flex items-center gap-2">
              <Link
                to="/admin/academic"
                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 shadow-2xs hover:bg-slate-50 transition"
              >
                <span>Academic Structure</span>
              </Link>
            </div>
          )
        }
      />

      {/* Search and Filters */}
      <div className="flex items-center justify-between gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
        <div className="relative w-full max-w-md">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search by course code or title..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm rounded-lg border border-slate-300 focus:outline-none focus:border-blue-600 transition"
          />
        </div>
        <div className="text-xs text-slate-500 font-medium">
          {filteredOfferings.length} {filteredOfferings.length === 1 ? 'course offering' : 'course offerings'}
        </div>
      </div>

      {/* Course Cards Grid */}
      {isLoading ? (
        <div className="py-20 text-center text-sm text-slate-500">Loading course offerings...</div>
      ) : isError ? (
        <div className="py-20 text-center text-sm text-rose-600">Failed to load courses.</div>
      ) : filteredOfferings.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-500">
          <BookOpen className="h-10 w-10 text-slate-300 mx-auto mb-3" />
          <h3 className="text-base font-semibold text-slate-700">No Course Offerings</h3>
          <p className="text-xs text-slate-500 mt-1">You are not enrolled in or assigned to any active courses.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredOfferings.map((off) => (
            <div
              key={off.id}
              className="bg-white rounded-xl border border-slate-200 shadow-xs hover:border-slate-300 hover:shadow-sm transition flex flex-col justify-between overflow-hidden group"
            >
              <div className="p-5">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-slate-100 text-slate-700">
                    {off.course_code}
                  </span>
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-600">
                    Sec {off.section}
                  </span>
                </div>

                <h3 className="text-base font-semibold text-slate-900 group-hover:text-blue-600 transition">
                  {off.course_title}
                </h3>

                {/* Faculty Assigned */}
                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center gap-2 text-xs text-slate-600">
                  <UserCheck className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                  <span>
                    {off.faculty.length > 0
                      ? off.faculty
                          .map((f) => `${f.first_name || ''} ${f.last_name || ''}`.trim() || f.email)
                          .join(', ')
                      : 'No instructor assigned'}
                  </span>
                </div>
              </div>

              <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
                <span className="text-xs font-medium text-emerald-700 capitalize">
                  ● {off.status}
                </span>
                <Link
                  to={`/courses/${off.id}`}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-700"
                >
                  <span>View Course Details</span>
                  <ExternalLink className="h-3.5 w-3.5" />
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
