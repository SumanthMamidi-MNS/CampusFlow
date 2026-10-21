import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from './hooks';
import { SplashScreen } from '@/core/components/brand/SplashScreen';

export function ProtectedRoute() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return <SplashScreen />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/auth/login" replace />;
  }

  return <Outlet />;
}

interface RoleGuardProps {
  allowedRoles: string[];
  children: React.ReactNode;
}

export function RoleGuard({ allowedRoles, children }: RoleGuardProps) {
  const { user } = useAuth();

  if (!user || !user.roles.some(role => allowedRoles.includes(role))) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
