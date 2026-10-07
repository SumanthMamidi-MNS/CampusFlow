import { createBrowserRouter, Link } from 'react-router-dom';
import { RootLayout } from './routes/_layout';
import { ProtectedRoute, RoleGuard } from '@/core/auth/guard';
import { LoginPage } from './routes/auth/login';
import { UsersAdminPage } from './routes/admin/users';
import { CoursesListPage } from './routes/courses/index';
import { CourseDetailPage } from './routes/courses/detail';
import { AssignmentsIndexPage } from './routes/assignments/index';
import { AcademicAdminPage } from './routes/admin/academic';
import { SettingsAdminPage } from './routes/admin/settings';
import { QuestionBanksIndexPage } from './routes/question-banks/index';
import { QuestionBankDetailPage } from './routes/question-banks/detail';
import { ProgrammingIndexPage } from './routes/programming/index';
import { ProgrammingDetailPage } from './routes/programming/detail';
import { ExamsIndexPage } from './routes/exams/index';
import { ExamDetailPage } from './routes/exams/detail';
import { ExamTakePage } from './routes/exams/take';
import { ExamResultPage } from './routes/exams/results';

import { useAuth } from '@/core/auth/hooks';
import { InstitutionalAnalytics } from '@/features/analytics/components/InstitutionalAnalytics';
import { StudentDashboard } from '@/features/analytics/components/StudentDashboard';

/** "super_admin" -> "Super Admin" — roles are stored snake_case in the API. */
function formatRole(role?: string | null): string {
  if (!role) return 'User';
  return role
    .replace(/_/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function DashboardPage() {
  const { user } = useAuth();
  const isStudent =
    user?.roles.includes('student') &&
    !user?.roles.some((r) => ['admin', 'super_admin', 'faculty', 'department_head'].includes(r));

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-start justify-between gap-4">
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
              Welcome back, {user ? `${user.first_name} ${user.last_name}` : 'Scholar'}
            </h1>
            <span className="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600 border border-slate-200">
              {formatRole(user?.roles[0])}
            </span>
          </div>
          
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <span className="flex h-2 w-2 rounded-full bg-emerald-500"></span>
            <span className="font-medium">Academic Year 2026-2027 • Fall Term • Official Session</span>
          </div>
          
          <p className="text-sm text-slate-500 max-w-2xl">
            {isStudent
              ? 'Your active learning hub, deadlines, grades, and upcoming examinations.'
              : 'Institutional performance overview, academic operations, and analytics.'}
          </p>
        </div>
        <div className="flex items-center gap-3 sm:shrink-0">
          <Link
            to="/courses"
            className="inline-flex items-center justify-center rounded-lg bg-white px-4 py-2 text-sm font-medium text-slate-700 border border-slate-200 shadow-xs hover:bg-slate-50 hover:text-slate-900 transition-colors"
          >
            My Courses
          </Link>
          {!isStudent && (
            <Link
              to="/exams"
              className="inline-flex items-center justify-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-xs hover:bg-slate-800 transition-colors"
            >
              Manage Exams
            </Link>
          )}
        </div>
      </div>

      {isStudent ? <StudentDashboard /> : <InstitutionalAnalytics />}
    </div>
  );
}


export const router = createBrowserRouter([
  {
    path: '/auth/login',
    element: <LoginPage />,
  },
  {
    path: '/login',
    element: <LoginPage />,
  },
  {
    element: <ProtectedRoute />,
    children: [
      {
        element: <RootLayout />,
        children: [
          {
            path: '/',
            element: <DashboardPage />,
          },
          {
            path: '/courses',
            element: <CoursesListPage />,
          },
          {
            path: '/courses/:id',
            element: <CourseDetailPage />,
          },
          {
            path: '/assignments',
            element: <AssignmentsIndexPage />,
          },
          {
            path: '/admin/users',
            element: (
              <RoleGuard allowedRoles={['admin', 'super_admin']}>
                <UsersAdminPage />
              </RoleGuard>
            ),
          },
          {
            path: '/admin/academic',
            element: (
              <RoleGuard allowedRoles={['admin', 'super_admin', 'department_head']}>
                <AcademicAdminPage />
              </RoleGuard>
            ),
          },
          {
            path: '/admin/settings',
            element: (
              <RoleGuard allowedRoles={['admin', 'super_admin']}>
                <SettingsAdminPage />
              </RoleGuard>
            ),
          },
          {
            path: '/programming',
            element: <ProgrammingIndexPage />,
          },
          {
            path: '/programming/:id',
            element: <ProgrammingDetailPage />,
          },
          {
            path: '/question-banks',
            element: (
              <RoleGuard allowedRoles={['admin', 'super_admin', 'faculty', 'exam_controller', 'department_head']}>
                <QuestionBanksIndexPage />
              </RoleGuard>
            ),
          },
          {
            path: '/question-banks/:id',
            element: (
              <RoleGuard allowedRoles={['admin', 'super_admin', 'faculty', 'exam_controller', 'department_head']}>
                <QuestionBankDetailPage />
              </RoleGuard>
            ),
          },
          {
            path: '/exams',
            element: <ExamsIndexPage />,
          },
          {
            path: '/exams/:id',
            element: (
              <RoleGuard allowedRoles={['admin', 'super_admin', 'faculty', 'exam_controller', 'department_head']}>
                <ExamDetailPage />
              </RoleGuard>
            ),
          },
          {
            path: '/exams/:id/results',
            element: <ExamResultPage />,
          },
        ],
      },
      {
        path: '/exams/:id/take',
        element: <ExamTakePage />,
      },
    ],
  },
]);
