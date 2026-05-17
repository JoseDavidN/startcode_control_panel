// src/routes/routes.config.ts
import { ROUTES } from '@utils/constants';
import { Permission, UserRole } from '@typings/auth.types';

export interface RouteConfig {
	path: string;
	component: string;
	protected: boolean;
	requiredRoles?: UserRole[];
	requiredPermissions?: Permission[];
	requireAll?: boolean;
}

export const routesConfig: RouteConfig[] = [
	// Public routes
	{
		path: ROUTES.LOGIN,
		component: 'Login',
		protected: false,
	},

	// Protected routes - Dashboard
	{
		path: ROUTES.DASHBOARD,
		component: 'Dashboard',
		protected: true,
	},

	// Protected routes - Servers
	{
		path: ROUTES.SERVERS,
		component: 'ServerList',
		protected: true,
		requiredPermissions: [Permission.VIEW_SERVERS],
	},
	{
		path: ROUTES.SERVER_DETAIL,
		component: 'ServerDetail',
		protected: true,
		requiredPermissions: [Permission.VIEW_SERVERS],
	},
	{
		path: ROUTES.SERVER_CREATE,
		component: 'ServerCreate',
		protected: true,
		requiredPermissions: [Permission.CREATE_SERVERS],
	},
	{
		path: ROUTES.SERVER_EDIT,
		component: 'ServerEdit',
		protected: true,
		requiredPermissions: [Permission.EDIT_SERVERS],
	},

	// Protected routes - Services
	{
		path: ROUTES.SERVICES,
		component: 'ServiceList',
		protected: true,
		requiredPermissions: [Permission.VIEW_SERVICES],
	},
	{
		path: ROUTES.SERVICE_DETAIL,
		component: 'ServiceDetail',
		protected: true,
		requiredPermissions: [Permission.VIEW_SERVICES],
	},
	{
		path: ROUTES.SERVICE_CREATE,
		component: 'ServiceCreate',
		protected: true,
		requiredPermissions: [Permission.CREATE_SERVICES],
	},

	// Settings
	{
		path: ROUTES.SETTINGS,
		component: 'Settings',
		protected: true,
	},
	{
		path: ROUTES.PROFILE,
		component: 'Profile',
		protected: true,
	},
];
