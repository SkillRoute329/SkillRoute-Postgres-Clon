import { auth } from '../config/firebase';
import { onAuthStateChanged, setPersistence, browserLocalPersistence, signInAnonymously } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { type User } from '../services/api';
import React, { createContext, useContext, useState, useEffect } from 'react';

interface AuthContextType {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (token: string, user: User) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    // 🔗 PERSISTENCE BRIDGE: Restore manual tokens (Backend 2.0)
    const storedToken = localStorage.getItem('tf_token');
    const storedUser = localStorage.getItem('tf_user');
    if (storedToken && storedUser) {
      try {
        setToken(storedToken);
        setUser(JSON.parse(storedUser));
      } catch (_e) {
        localStorage.removeItem('tf_token');
        localStorage.removeItem('tf_user');
      }
    }

    console.log('🔒 [AuthContext] Initializing Strict Auth Listener (Firebase + Backend).');

    // Ensure persistence is set before listening
    setPersistence(auth, browserLocalPersistence).catch((err) =>
      console.error('Persistence Error:', err),
    );

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      let waitingForAnonAuth = false;
      try {
        if (firebaseUser) {
          const isAnon = firebaseUser.isAnonymous;
          console.log(isAnon
            ? '👤 [AuthContext] Sesión anónima activa — acceso Firestore habilitado'
            : '✅ [AuthContext] Firebase Session Restored:' + firebaseUser.email,
          );
          const freshToken = await firebaseUser.getIdToken();

          // Intentar recuperar rol previo de localStorage para no degradarlo
          const storedPrev = localStorage.getItem('tf_user');
          const prevRole = storedPrev ? (JSON.parse(storedPrev) as User)?.role : null;

          let finalUser: User = {
            id: firebaseUser.uid,
            uid: firebaseUser.uid,
            internalNumber: '----',
            firstName: firebaseUser.displayName?.split(' ')[0] || 'Usuario',
            lastName: '',
            fullName: firebaseUser.displayName || 'Usuario Sistema',
            role: prevRole || 'USER',
            email: firebaseUser.email || undefined,
          };

          if (!isAnon) {
            /**
             * Workaround conocido de Firebase: onAuthStateChanged se dispara
             * apenas hay token, pero el SDK Firestore puede tardar unos
             * milisegundos en propagar la auth a sus listeners. Si llamamos
             * getDoc inmediatamente, devuelve permission-denied aunque las
             * rules permiten read. Solución: retry con backoff exponencial
             * si vemos permission-denied. Max 3 intentos = ~700ms total.
             */
            try {
              const userDocRef = doc(db, 'users', firebaseUser.uid);
              let userSnap: Awaited<ReturnType<typeof getDoc>> | null = null;
              let lastErr: unknown = null;
              for (let attempt = 0; attempt < 3; attempt++) {
                try {
                  userSnap = await getDoc(userDocRef);
                  break;
                } catch (err) {
                  lastErr = err;
                  const code = (err as { code?: string })?.code ?? '';
                  if (code === 'permission-denied' && attempt < 2) {
                    // Backoff: 100ms, 250ms (suma <400ms en peor caso)
                    await new Promise((r) => setTimeout(r, 100 + attempt * 150));
                    continue;
                  }
                  throw err;
                }
              }

              if (userSnap?.exists()) {
                const userData = userSnap.data() as Record<string, any>;
                finalUser = {
                  ...finalUser,
                  internalNumber: userData?.datos_empresa?.legajo || '----',
                  firstName: userData?.datos_personales?.nombre || finalUser.firstName,
                  lastName: userData?.datos_personales?.apellido || '',
                  role: userData?.rol || prevRole || 'USER',
                };
              } else if (lastErr) {
                throw lastErr;
              }
            } catch (dbError) {
              // Mantener warn para no romper login si Firestore tarda mucho.
              // El localStorage cache (tf_user) cubre el rol mientras tanto.
              console.warn('[AuthContext] DB Profile no disponible tras retries; usando cache local:', dbError);
            }
          }

          setToken(freshToken);
          setUser(finalUser);
          if (!isAnon) {
            localStorage.setItem('tf_token', freshToken);
            localStorage.setItem('tf_user', JSON.stringify(finalUser));
          }
        } else if (!localStorage.getItem('tf_token')) {
          // Sin sesión → auth anónima para que Firestore rules isAuthenticated() pasen
          // (DEMO_MODE: acceso sin login; el spinner sigue hasta que el anónimo se establezca)
          waitingForAnonAuth = true;
          console.log('💤 [AuthContext] No active session — initiating anonymous sign-in.');
          signInAnonymously(auth).catch((err) =>
            console.warn('[AuthContext] Anonymous sign-in failed:', err.code),
          );
        }
      } catch (error) {
        console.error('❌ [AuthContext] Critical Auth Error:', error);
      } finally {
        // No desmontar el spinner si estamos esperando el anónimo — lo desactiva la próxima llamada
        if (!waitingForAnonAuth) setInitializing(false);
      }
    });

    return () => unsubscribe();
  }, []);

  const login = (newToken: string, newUser: User) => {
    setToken(newToken);
    setUser(newUser);
    localStorage.setItem('tf_token', newToken);
    localStorage.setItem('tf_user', JSON.stringify(newUser));
  };

  const logout = () => {
    auth.signOut();
    localStorage.removeItem('tf_token');
    localStorage.removeItem('tf_user');
    setToken(null);
    setUser(null);
    window.location.assign('/login');
  };

  if (initializing) {
    return (
      <div className="min-h-screen w-full flex flex-col items-center justify-center bg-slate-950 text-white">
        <div className="w-16 h-16 border-4 border-primary-500 border-t-transparent rounded-full animate-spin mb-4"></div>
        <h2 className="text-xl font-bold tracking-tight">Iniciando SkillRoute...</h2>
        <p className="text-slate-500 text-sm mt-2">Verificando credenciales seguras</p>
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

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
