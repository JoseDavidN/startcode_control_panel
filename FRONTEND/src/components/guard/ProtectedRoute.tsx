// src/components/guards/ProtectedRoute.tsx
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@hooks/useAuth';
import { UserRole, Permission } from '@typings/auth.types';
import { ROUTES } from '@utils/constants';
import { Loading } from '@components/ui/Loading';

interface ProtectedRouteProps {
  requiredRoles?: UserRole[];
  requiredPermissions?: Permission[];
  requireAll?: boolean; // Si es true, requiere todos los permisos/roles
}

export const ProtectedRoute = ({
  requiredRoles = [],
  requiredPermissions = [],
  requireAll = false,
}: ProtectedRouteProps) => {
  const { isAuthenticated, isLoading, hasRole, hasPermission } = useAuth();
  const location = useLocation();

  // Mostrar loading mientras verifica autenticación
  if (isLoading) {
    return <Loading />;
  }

  // Si no está autenticado, redirigir al login
  if (!isAuthenticated) {
    return <Navigate to={ROUTES.LOGIN} state={{ from: location }} replace />;
  }

  // Verificar roles si se especificaron
  if (requiredRoles.length > 0) {
    const hasRequiredRole = requireAll
      ? requiredRoles.every((role) => hasRole(role))
      : requiredRoles.some((role) => hasRole(role));

    if (!hasRequiredRole) {
      return <Navigate to={ROUTES.UNAUTHORIZED} replace />;
    }
  }

  // Verificar permisos si se especificaron
  if (requiredPermissions.length > 0) {
    const hasRequiredPermission = requireAll
      ? requiredPermissions.every((permission) => hasPermission(permission))
      : requiredPermissions.some((permission) => hasPermission(permission));

    if (!hasRequiredPermission) {
      return <Navigate to={ROUTES.UNAUTHORIZED} replace />;
    }
  }

  return <Outlet />;
};