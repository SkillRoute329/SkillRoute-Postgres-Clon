import { auth } from '../config/firebase';
import { onAuthStateChanged, setPersistence, browserLocalPersistence } from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../config/firebase';
import { type User } from '../services/api';
import React, { createContext, useContext, useState, useEffect } from 'react'; // Added missing React imports

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
  // 🧱 ARCHITECTURAL REFACTOR: LOADING WALL PATTERN
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [initializing, setInitializing] = useState(true); // 🔒 The Wall

  useEffect(() => {
    console.log(
      '🔒 [AuthContext] Initializing Strict Auth Listener (Firebase Auth only, no bypass).',
    );

    // Ensure persistence is set before listening
    setPersistence(auth, browserLocalPersistence).catch((err) =>
      console.error('Persistence Error:', err),
    );

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      try {
        if (firebaseUser) {
          console.log('✅ [AuthContext] Session Restored:', firebaseUser.email);
          const freshToken = await firebaseUser.getIdToken();

          // 1. Base Strategy: Always have at least the Auth User
          let finalUser: User = {
            id: firebaseUser.uid,
            internalNumber: '----',
            firstName: firebaseUser.displayName?.split(' ')[0] || 'Usuario',
            lastName: '',
            fullName: firebaseUser.displayName || 'Usuario Sistema',
            role: 'User',
            email: firebaseUser.email,
          };

          // 2. Progressive Enhancement: Try to fetch DB Profile
          try {
            const userDocRef = doc(db, 'users', firebaseUser.uid);
            let userSnap = await getDoc(userDocRef);

            // Auto-Onboarding for new users (if DB allows)
            if (!userSnap.exists()) {
              try {
                await setDoc(userDocRef, {
                  uid: firebaseUser.uid,
                  email: firebaseUser.email,
                  rol: 'USER',
                  empresa: 'UCOT',
                  createdAt: serverTimestamp(),
                });
                userSnap = await getDoc(userDocRef);
              } catch (writeErr) {
                console.warn('Could not create user profile (permissions):', writeErr);
              }
            }

            // Owner Privilege Restoration (Strict Check)
            if (firebaseUser.uid === 'hCXervt1IHauUG1zWnCT640GgEP2') {
              const currentData = userSnap.data();
              if (currentData?.rol !== 'SuperAdmin') {
                // Try to elevate if rules allow
                setDoc(userDocRef, { ...currentData, rol: 'SuperAdmin' }, { merge: true }).catch(
                  (e) => console.warn('Elevation blocked by rules:', e),
                );
              }
            }

            if (userSnap.exists()) {
              const userData = userSnap.data();
              finalUser = {
                ...finalUser,
                internalNumber: userData?.datos_empresa?.legajo || '----',
                firstName: userData?.datos_personales?.nombre || finalUser.firstName,
                lastName: userData?.datos_personales?.apellido || '',
                fullName:
                  `${(userData?.datos_personales?.nombre as string) || ''} ${(userData?.datos_personales?.apellido as string) || ''}`.trim() ||
                  finalUser.fullName,
                role: userData?.rol || 'USER',
              };
            }
          } catch (dbError) {
            console.error('⚠️ [AuthContext] DB Profile Unreachable (using Fallback):', dbError);
            // We continue with finalUser (Auth Data) so we don't block login
          }

          // 3. Commit State
          setToken(freshToken);
          setUser(finalUser);
        } else {
          console.log('💤 [AuthContext] No active session found.');
          setToken(null);
          setUser(null);
        }
      } catch (error) {
        console.error('❌ [AuthContext] Critical Auth Error:', error);
        setToken(null);
        setUser(null);
      } finally {
        // 🔓 LIFT THE WALL: Whether success or failure, we are done checking.
        setInitializing(false);
      }
    });

    return () => unsubscribe();
  }, []);

  const login = (newToken: string, newUser: User) => {
    setToken(newToken);
    setUser(newUser);
  };

  const logout = () => {
    auth.signOut();
    setToken(null);
    setUser(null);
    window.location.assign('/login');
  };

  // ⛔ BLOCKED STATE RENDER
  if (initializing) {
    return (
      <div className="min-h-screen w-full flex flex-col items-center justify-center bg-slate-950 text-white">
        <div className="w-16 h-16 border-4 border-primary-500 border-t-transparent rounded-full animate-spin mb-4"></div>
        <h2 className="text-xl font-bold tracking-tight">Iniciando Sistema UCOT...</h2>
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
