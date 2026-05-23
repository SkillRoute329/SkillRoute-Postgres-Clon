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
import { apiClient } from '../clients/apiClient';
import { getToken as getStoredToken, setToken as setStoredToken, clearToken as clearStoredToken } from '../utils/tokenStore';
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

// FASE 5.16: el token vive en tokenStore (única fuente + migración legacy).
// Acá sólo gestionamos el perfil de usuario y la empresa activa.
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
  setStoredToken(token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  // Empresa activa por defecto desde el JWT/user (UCOT=70 si no aplica).
  const agencyId = (user as User & { agencyId?: string | number }).agencyId;
  if (agencyId && [10, 20, 50, 70].includes(Number(agencyId))) {
    localStorage.setItem(EMPRESA_KEY, String(agencyId));
    window.dispatchEvent(new CustomEvent('skillroute:empresaPropia-change', { detail: Number(agencyId) }));
  }
}

function clearSession(): void {
  clearStoredToken();
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem(EMPRESA_KEY);
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    let cancelled = false;

    // FASE 5.16 (2026-05-16): WATCHDOG anti-cuelgue. Si el bootstrap se
    // traba en cualquier await (recallCredentials → crypto.subtle /
    // IndexedDB bloqueada, login POST sin responder, etc.) la app quedaba
    // en el spinner "Iniciando SkillRoute..." para siempre. Este timeout
    // garantiza que después de 8s la SPA arranca SÍ o SÍ — peor caso el
    // usuario loguea a mano, pero nunca pantalla colgada.
    const watchdog = setTimeout(() => {
      if (!cancelled) {
        console.warn('[AuthContext] Watchdog: bootstrap tardó >8s, forzando arranque.');
        setInitializing(false);
      }
    }, 8000);

    // FASE 5.16: Extraemos el handler para poder removerlo en cleanup
    const handleUnauthorized = () => {
      console.warn('[AuthContext] Recibida señal 401, cerrando sesión...');
      logout();
    };

    const bootstrap = async (): Promise<void> => {
      try {
        // 1. Restaurar sesión local si existe.
        // getStoredToken() migra automáticamente sesiones legacy (tf_token).
        const storedToken = getStoredToken();
        const storedUser = localStorage.getItem(USER_KEY);
        if (storedToken && storedUser) {
          try {
            const parsed = JSON.parse(storedUser) as User;
            
            // FASE 5.16: Validar expiración del JWT antes de restaurar
            const payload = decodeJwtPayload(storedToken);
            const now = Math.floor(Date.now() / 1000);
            
            if (payload && payload.exp && (payload.exp as number) < now) {
              console.warn('[AuthContext] Sesión local caducada, limpiando...');
              clearSession();
            } else if (!cancelled) {
              setToken(storedToken);   // setState de React
              setUser(parsed);
              // El token ya está en tokenStore (getStoredToken lo migró si era legacy).
              console.info('[AuthContext] Sesión local restaurada para', parsed.email ?? parsed.id ?? '(?)');
            }
          } catch {
            clearSession();
          }
        }

        // FASE 5.16: Escuchar eventos 401 de la API para logout automático
        window.addEventListener('skillroute:auth-unauthorized', handleUnauthorized);

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
      } finally {
        clearTimeout(watchdog);
        if (!cancelled) setInitializing(false);
      }
    };

    void bootstrap();
    return () => {
      cancelled = true;
      clearTimeout(watchdog);
      window.removeEventListener('skillroute:auth-unauthorized', handleUnauthorized);
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
          setToken(fresh);          // setState React
          setStoredToken(fresh);    // tokenStore (única fuente)
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
