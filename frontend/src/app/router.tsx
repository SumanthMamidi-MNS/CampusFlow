import { createBrowserRouter } from 'react-router-dom';
import { RootLayout } from './routes/_layout';
import { ProtectedRoute, RoleGuard } from '@/core/auth/guard';
import { LoginPage } from './routes/auth/login';
import { UsersAdminPage } from './routes/admin/users';
import { CoursesListPage } from './routes/courses/index';
import { CourseDetailPage } from './routes/courses/detail';
import { AcademicAdminPage } from './routes/admin/academic';

function DashboardPage() {
  return (
    <div className="space-y-4 max-w-7xl mx-auto">
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
        <h1 className="text-2xl font-bold text-slate-900">Welcome to CampusFlow</h1>
        <p className="mt-1 text-sm text-slate-500">
          Your institution-grade learning management and secure online examination portal.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
          <h3 className="text-sm font-semibold text-slate-700">Course Offerings</h3>
          <p className="text-2xl font-bold text-blue-600 mt-2">Active</p>
          <p className="text-xs text-slate-400 mt-1">Syllabus, lectures, and digital resources</p>
        </div>
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
          <h3 className="text-sm font-semibold text-slate-700">Examinations</h3>
          <p className="text-2xl font-bold text-emerald-600 mt-2">Scheduled</p>
          <p className="text-xs text-slate-400 mt-1">Secure tests with observable proctoring</p>
        </div>
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
          <h3 className="text-sm font-semibold text-slate-700">Assignments</h3>
          <p className="text-2xl font-bold text-indigo-600 mt-2">Tasks & Labs</p>
          <p className="text-xs text-slate-400 mt-1">Rubrics, submissions, and gradebook</p>
        </div>
      </div>
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
        ],
      },
    ],
  },
]);
