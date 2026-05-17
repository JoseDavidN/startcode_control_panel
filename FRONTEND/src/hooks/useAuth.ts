// src/hooks/useAuth.ts
import { useContext } from 'react';
import { AuthContext } from '@contexts/AuthContext';
import type { AuthContextType } from '@typings/auth.types';

export const useAuth = (): AuthContextType => {
	const context = useContext(AuthContext);

	if (context === undefined) {
		throw new Error('useAuth debe ser usado dentro de un AuthProvider');
	}

	return context;
};
