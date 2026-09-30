import { createBrowserRouter } from 'react-router-dom';
import { RootLayout } from './routes/_layout';
import { ProtectedRoute, RoleGuard } from '@/core/auth/guard';
import { LoginPage } from './routes/auth/login';
import { UsersAdminPage } from './routes/admin/users';
import { CoursesListPage } from './routes/courses/index';
import { CourseDetailPage } from './routes/courses/detail';
import { AcademicAdminPage } from './routes/admin/academic';
import { QuestionBanksIndexPage } from './routes/question-banks/index';
import { QuestionBankDetailPage } from './routes/question-banks/detail';
import { ExamsIndexPage } from './routes/exams/index';
import { ExamDetailPage } from './routes/exams/detail';
import { ExamTakePage } from './routes/exams/take';
import { ExamResultPage } from './routes/exams/results';

import { useAuth } from '@/core/auth/hooks';
import { InstitutionalAnalytics } from '@/features/analytics/components/InstitutionalAnalytics';
import { StudentDashboard } from '@/features/analytics/components/StudentDashboard';

function DashboardPage() {
  const { user } = useAuth();
  const isStudent =
    user?.roles.includes('student') &&
    !user?.roles.some((r) => ['admin', 'super_admin', 'faculty', 'department_head'].includes(r));

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">
            Welcome back, {user ? `${user.first_name} ${user.last_name}` : 'Scholar'}
          </h1>
          <p className="mt-1 text-xs text-slate-500">
            {isStudent
              ? 'Your active learning hub, deadlines, grades, and upcoming examinations.'
              : 'Institutional performance overview, academic operations, and analytics.'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-xl bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 capitalize border border-blue-200">
            Role: {user?.roles[0] || 'User'}
          </span>
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
