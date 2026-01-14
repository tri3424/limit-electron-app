import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { HOME_ROUTE, LOGIN_ROUTE } from '@/constants/routes';

interface ProtectedRouteProps {
  children: ReactNode;
  requireAdmin?: boolean;
}

export function ProtectedRoute({ children, requireAdmin = false }: ProtectedRouteProps) {
  const { isAuthenticated, isAdmin } = useAuth();

  if (!isAuthenticated) {
    return <Navigate to={LOGIN_ROUTE} replace />;
  }

  if (requireAdmin && !isAdmin) {
    return <Navigate to={HOME_ROUTE} replace />;
  }

  return <>{children}</>;
}


