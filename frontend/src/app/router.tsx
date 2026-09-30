import { createBrowserRouter } from 'react-router-dom';
import { RootLayout } from './routes/_layout';
import { ProtectedRoute } from '@/core/auth/guard';

function DashboardPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold">Welcome to CampusFlow</h1>
      <p className="mt-2 text-muted-foreground">
        Your college learning management and examination platform.
      </p>
    </div>
  );
}

function LoginPage() {
  return (
    <div className="flex h-screen items-center justify-center">
      <div className="w-full max-w-md space-y-6 rounded-lg border p-8">
        <div className="text-center">
          <h1 className="text-2xl font-bold">CampusFlow</h1>
          <p className="text-sm text-muted-foreground">Sign in to your account</p>
        </div>
        <p className="text-center text-sm text-muted-foreground">
          Login form coming in Phase 1
        </p>
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
        ],
      },
    ],
  },
]);
