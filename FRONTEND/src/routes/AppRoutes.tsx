// src/routes/AppRoutes.tsx
import { Routes, Route, Navigate } from 'react-router-dom';
import { ProtectedRoute } from '@components/guard/ProtectedRoute';
import { AppLayout } from '@components/layout/AppLayout';
import { ROUTES } from '@utils/constants';
// import { Permission } from '@typings/auth.types'; // Descomentar cuando se activen las rutas con permisos

// Auth Pages
import { Login } from '@pages/auth/Login';

// Errors
import { NotFound } from '@pages/errors/NotFound';

// Dashboard
import { Dashboard } from '@pages/dashboard/Dashboard';

// Settings
import { Settings } from '@pages/settings';

// Notifications
import { Notifications } from '@pages/notifications';

// Servers
import { Servers } from '@pages/servers';

// Servers (pendientes)
// import { ServerList } from '../pages/servers/ServerList';
// import { ServerDetail } from '../pages/servers/ServerDetail';
// import { ServerCreate } from '../pages/servers/ServerCreate';
// import { ServerEdit } from '../pages/servers/ServerEdit';

// Services
// import { ServiceList } from '../pages/services/ServiceList';
// import { ServiceDetail } from '../pages/services/ServiceDetail';
// import { ServiceCreate } from '../pages/services/ServiceCreate';

// Errors
// import { Unauthorized } from '../pages/errors/Unauthorized';

/**
 * Configuración principal de rutas de la aplicación
 */
export const AppRoutes = () => {
  return (
    <Routes>
      {/* ====== RUTAS DISPONIBLES ====== */}

      {/* Redirect root to dashboard */}
      <Route path="/" element={<Navigate to={ROUTES.DASHBOARD} replace />} />

      {/* Public Routes */}
      <Route path={ROUTES.LOGIN} element={<Login />} />

      {/* Protected Routes - Dashboard principal */}
      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route path={ROUTES.DASHBOARD} element={<Dashboard />} />
          <Route path={ROUTES.SERVERS} element={<Servers />} />
          <Route path={ROUTES.NOTIFICATIONS} element={<Notifications />} />
          <Route path={ROUTES.SETTINGS} element={<Settings />} />
        </Route>
      </Route>

      {/* Error Pages disponibles */}
      <Route path={ROUTES.NOT_FOUND} element={<NotFound />} />

      {/* Catch all - 404 */}
      <Route path="*" element={<NotFound />} />

      {/* ====== RUTAS PENDIENTES - DESCOMENTAR CUANDO LOS COMPONENTES ESTÉN LISTOS ====== */}

      {/* Protected Routes - Profile */}
      {/* <Route element={<ProtectedRoute />}>
        <Route path={ROUTES.PROFILE} element={<Profile />} />
      </Route> */}

      {/* Protected Routes - Servers (require VIEW_SERVERS permission) */}
      {/* <Route
        element={
          <ProtectedRoute
            requiredPermissions={[Permission.VIEW_SERVERS]}
          />
        }
      >
        <Route path={ROUTES.SERVERS} element={<ServerList />} />
        <Route path={ROUTES.SERVER_DETAIL} element={<ServerDetail />} />
      </Route> */}

      {/* Protected Routes - Create/Edit Servers */}
      {/* <Route
        element={
          <ProtectedRoute
            requiredPermissions={[Permission.CREATE_SERVERS]}
          />
        }
      >
        <Route path={ROUTES.SERVER_CREATE} element={<ServerCreate />} />
      </Route> */}

      {/* <Route
        element={
          <ProtectedRoute
            requiredPermissions={[Permission.EDIT_SERVERS]}
          />
        }
      >
        <Route path={ROUTES.SERVER_EDIT} element={<ServerEdit />} />
      </Route> */}

      {/* Protected Routes - Services (require VIEW_SERVICES permission) */}
      {/* <Route
        element={
          <ProtectedRoute
            requiredPermissions={[Permission.VIEW_SERVICES]}
          />
        }
      >
        <Route path={ROUTES.SERVICES} element={<ServiceList />} />
        <Route path={ROUTES.SERVICE_DETAIL} element={<ServiceDetail />} />
      </Route> */}

      {/* Protected Routes - Create Services */}
      {/* <Route
        element={
          <ProtectedRoute
            requiredPermissions={[Permission.CREATE_SERVICES]}
          />
        }
      >
        <Route path={ROUTES.SERVICE_CREATE} element={<ServiceCreate />} />
      </Route> */}

      {/* Error Pages pendientes */}
      {/* <Route path={ROUTES.UNAUTHORIZED} element={<Unauthorized />} /> */}
    </Routes>
  );
};