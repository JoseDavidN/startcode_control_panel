// src/routes/AppRoutes.tsx
import { Suspense, lazy } from 'react';
import type { ReactNode } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { ProtectedRoute } from '@components/guard/ProtectedRoute';
import { AppLayout } from '@components/layout/AppLayout';
import { ROUTES } from '@utils/constants';
// import { Permission } from '@typings/auth.types'; // Descomentar cuando se activen las rutas con permisos

// Auth Pages
import { Login } from '@pages/auth/Login';

import { Loading } from '@components/ui/Loading';

/* Cada página en su propio chunk: recharts (Dashboard), Settings y el detalle
   de servidores ya no se descargan ni se evalúan al abrir la app. El login
   queda en el bundle principal porque es la primera pantalla. */
const NotFound = lazy(() => import('@pages/errors/NotFound').then(m => ({ default: m.NotFound })));
const Dashboard = lazy(() => import('@pages/dashboard/Dashboard').then(m => ({ default: m.Dashboard })));
const Settings = lazy(() => import('@pages/settings/Settings').then(m => ({ default: m.Settings })));
const Notifications = lazy(() =>
  import('@pages/notifications/Notifications').then(m => ({ default: m.Notifications })));
const Servers = lazy(() => import('@pages/servers/Servers').then(m => ({ default: m.Servers })));
const Databases = lazy(() => import('@pages/databases/Databases').then(m => ({ default: m.Databases })));
const DatabaseDetail = lazy(() =>
  import('@pages/databases/DatabaseDetail').then(m => ({ default: m.DatabaseDetail })));

/* El Suspense va por página y no alrededor de <Routes>: así el layout (barra
   lateral, cabecera) se queda en pantalla mientras llega el chunk. */
const Page = ({ children }: { children: ReactNode }) => (
  <Suspense fallback={<Loading />}>{children}</Suspense>
);

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
          <Route path={ROUTES.DASHBOARD} element={<Page><Dashboard /></Page>} />
          <Route path={ROUTES.SERVERS} element={<Page><Servers /></Page>} />
          <Route path={ROUTES.DATABASES} element={<Page><Databases /></Page>} />
          <Route path={ROUTES.DATABASE_DETAIL} element={<Page><DatabaseDetail /></Page>} />
          <Route path={ROUTES.NOTIFICATIONS} element={<Page><Notifications /></Page>} />
          <Route path={ROUTES.SETTINGS} element={<Page><Settings /></Page>} />
        </Route>
      </Route>

      {/* Error Pages disponibles */}
      <Route path={ROUTES.NOT_FOUND} element={<Page><NotFound /></Page>} />

      {/* Catch all - 404 */}
      <Route path="*" element={<Page><NotFound /></Page>} />

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