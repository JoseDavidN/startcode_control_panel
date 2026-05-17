import { createContext } from 'react';
import type { AuthContextType } from '@typings/auth.types';

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

AuthContext.displayName = 'AuthContext';
