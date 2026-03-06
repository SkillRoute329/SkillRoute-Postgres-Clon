// Authentication utilities for managing JWT tokens and user data

export const getAuthToken = (): string | null => {
  const authData = localStorage.getItem('auth');
  if (authData) {
    try {
      const parsed = JSON.parse(authData);
      return parsed.token || null;
    } catch {
      return localStorage.getItem('token');
    }
  }
  return localStorage.getItem('token');
};

export const setAuthData = (token: string, user: any): void => {
  localStorage.setItem('auth', JSON.stringify({ token, user }));
  // Also set separately for backward compatibility
  localStorage.setItem('token', token);
  localStorage.setItem('user', JSON.stringify(user));
};

export const getCurrentUser = (): any | null => {
  const authData = localStorage.getItem('auth');
  if (authData) {
    try {
      const parsed = JSON.parse(authData);
      return parsed.user || null;
    } catch {
      const userData = localStorage.getItem('user');
      return userData ? JSON.parse(userData) : null;
    }
  }
  const userData = localStorage.getItem('user');
  return userData ? JSON.parse(userData) : null;
};

export const clearAuthData = (): void => {
  localStorage.removeItem('auth');
  localStorage.removeItem('token');
  localStorage.removeItem('user');
};
