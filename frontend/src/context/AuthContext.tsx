/**
 * AuthContext.tsx — Context de autenticación 100% soberano (FASE 4.3)
 *
 * REGLA -6: opera EXCLUSIVAMENTE contra el clon. No queda código de
 * Firebase real en este archivo.
 *
 * REGLA -1 NO REGRESIÓN: mantiene EXACTAMENTE la misma API pública del
 * AuthContext anterior (`useAuth()` → `{user, token, isAuthenticated,
 * isLoading, login, logout}`) para que los 100+ componentes que la consumen
 * sigan funcionando sin cambios.
 *
 * Flujo:
 *   1. Al montar, recuperar JWT y user de localStorage si existen.
 *   2. Si no hay sesión local, intentar auto-relogin con credenciales
 *      recordadas (recallCredentials del rememberDevice service).
 *   3. Login externo se inyecta vía `login(token, user)`.
 *   4. Logout limpia JWT, user, empresa activa y credenciales recordadas.
 *   5. Renovación silenciosa: cada 50 min llama `/api/auth/refresh` si el
 *      backend lo expone; si no existe, el token actual sigue siendo válido
 *      hasta su expiración natural (8h por config).
 */

import React, { createContext, useContext, useState, useEffect } from 'react';
import { recallCredentials, forgetDevice } from '../services/rememberDevice';
import { type User } from '../services/api';
import { apiClient, setAuthToken } from '../clients/apiClient';
import { refreshSocketAuth } from '../clients/socketClient';

interface AuthContextType {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (token: string, user: User) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Constantes para los keys de localStorage. Mantengo `tf_token` / `tf_user`
// idénticos al sistema anterior para que sesiones activas sobrevivan al
// upgrade del frontend (no regresión).
const TOKEN_KEY = 'tf_token';
const USER_KEY = 'tf_user';
const EMPRESA_KEY = 'skillroute.empresaPropia';

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const [, payloadB64] = token.split('.');
    if (!payloadB64) return null;
    const json = atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function persistSession(token: string, user: User): void {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  setAuthToken(token);
  // Empresa activa por defecto desde el JWT/user (UCOT=70 si no aplica).
  const agencyId = (user as User & { agencyId?: string | number }).agencyId;
  if (agencyId && [10, 20, 50, 70].includes(Number(agencyId))) {
    localStorage.setItem(EMPRESA_KEY, String(agencyId));
    window.dispatchEvent(new CustomEvent('skillroute:empresaPropia-change', { detail: Number(agencyId) }));
  }
}

function clearSession(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem(EMPRESA_KEY);
  setAuthToken(null);
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const bootstrap = async (): Promise<void> => {
      // 1. Restaurar sesión local si existe.
      const storedToken = localStorage.getItem(TOKEN_KEY);
      const storedUser = localStorage.getItem(USER_KEY);
      if (storedToken && storedUser) {
        try {
          const parsed = JSON.parse(storedUser) as User;
          if (!cancelled) {
            setToken(storedToken);
            setUser(parsed);
            setAuthToken(storedToken);
          }
          // eslint-disable-next-line no-console
          console.info('[AuthContext] Sesión local restaurada para', parsed.email ?? parsed.id ?? '(?)');
        } catch {
          clearSession();
        }
      }

      // 2. Sin sesión: intentar auto-relogin con credenciales recordadas.
      if (!storedToken) {
        try {
          const creds = await recallCredentials();
          if (creds) {
            const resp = await apiClient.post<{ token: string; user: Record<string, unknown> }>(
              '/api/auth/login',
              { internalNumber: creds.internalNumber, password: creds.password },
              { anon: true },
            );
            const newToken = resp.data?.token;
            const newUser = (resp.data?.user ?? {}) as Record<string, unknown>;
            if (newToken && !cancelled) {
              const u: User = {
                id: String(newUser.id ?? ''),
                uid: String(newUser.id ?? ''),
                internalNumber: String(newUser.internalNumber ?? '----'),
                firstName: (newUser.fullName as string)?.split(' ')[0] ?? 'Usuario',
                lastName: '',
                fullName: (newUser.fullName as string) ?? 'Usuario Sistema',
                role: (newUser.role as string) ?? 'USER',
                email: (newUser.email as string) ?? undefined,
              } as User;
              setToken(newToken);
              setUser(u);
              persistSession(newToken, u);
              refreshSocketAuth();
              // eslint-disable-next-line no-console
              console.info('[AuthContext] Auto-relogin exitoso para', u.internalNumber);
            } else {
              forgetDevice();
            }
          }
        } catch (err) {
          // eslint-disable-next-line no-console
          console.warn('[AuthContext] Auto-relogin falló:', err);
          forgetDevice();
        }
      }

      if (!cancelled) setInitializing(false);
    };

    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, []);

  // Renovación silenciosa cada 50 min via /api/auth/refresh (si el backend
  // lo expone). Si no, el token de 8h sigue siendo válido y el usuario solo
  // necesita re-loguear cuando expire.
  useEffect(() => {
    if (!token) return;
    const FIFTY_MIN = 50 * 60 * 1000;
    const interval = setInterval(async () => {
      try {
        const res = await apiClient.post<{ token: string }>('/api/auth/refresh');
        const fresh = res.data?.token;
        if (fresh) {
          setToken(fresh);
          localStorage.setItem(TOKEN_KEY, fresh);
          setAuthToken(fresh);
          // eslint-disable-next-line no-console
          console.info('[AuthContext] Token renovado silenciosamente.');
        }
      } catch (err: unknown) {
        // Si el endpoint /api/auth/refresh no existe (404), no es regresión —
        // el token sigue siendo válido hasta su expiración natural.
        // eslint-disable-next-line no-console
        console.debug('[AuthContext] /api/auth/refresh no disponible:', err);
      }
    }, FIFTY_MIN);
    return () => clearInterval(interval);
  }, [token]);

  const login = (newToken: string, newUser: User): void => {
    setToken(newToken);
    setUser(newUser);
    persistSession(newToken, newUser);
    refreshSocketAuth();
  };

  const logout = (): void => {
    clearSession();
    forgetDevice();
    setToken(null);
    setUser(null);
    refreshSocketAuth();
    window.location.assign('/login');
  };

  // Decode token para uso futuro (claims) — no expone, solo se valida.
  useEffect(() => {
    if (!token) return;
    const payload = decodeJwtPayload(token);
    if (!payload) {
      // Token corrupto: limpiar.
      clearSession();
      setToken(null);
      setUser(null);
    }
  }, [token]);

  if (initializing) {
    return (
      <div className="min-h-screen w-full flex flex-col items-center justify-center bg-slate-950 text-white">
        <div className="w-16 h-16 border-4 border-primary-500 border-t-transparent rounded-full animate-spin mb-4"></div>
        <h2 className="text-xl font-bold tracking-tight">Iniciando SkillRoute...</h2>
        <p className="text-slate-500 text-sm mt-2">Verificando credenciales locales</p>
      </div>
    );
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated: !!user && !!token,
        isLoading: initializing,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
