// Authentication utilities — JWT + user data.
//
// FASE 5.16 (2026-05-16): este módulo tenía su propio esquema de
// localStorage (`auth` JSON, `token`, `user`) PARALELO al resto del
// frontend. Nadie lo importa hoy, pero para que no reintroduzca la
// fragmentación que causó el incidente del 401, delega el token en el
// tokenStore único. El `user` se mantiene aparte porque tokenStore no
// gestiona el perfil de usuario.

import { getToken, setToken, clearToken } from './tokenStore';

export const getAuthToken = (): string | null => getToken();

export const setAuthData = (token: string, user: unknown): void => {
  setToken(token);
  try {
    localStorage.setItem('user', JSON.stringify(user));
  } catch {
    /* localStorage lleno o modo incógnito: ignorar */
  }
};

export const getCurrentUser = (): unknown | null => {
  try {
    const userData = localStorage.getItem('user');
    return userData ? JSON.parse(userData) : null;
  } catch {
    return null;
  }
};

export const clearAuthData = (): void => {
  clearToken();
  try {
    localStorage.removeItem('user');
    localStorage.removeItem('auth'); // legacy
  } catch {
    /* ignorar */
  }
};
