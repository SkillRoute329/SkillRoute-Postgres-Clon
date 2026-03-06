import React, { useState } from 'react';
import { LogIn, KeyRound, UserCircle, AlertCircle, CheckCircle, Bus } from 'lucide-react';
import clsx from 'clsx';
import ResetApp from '../components/ResetApp';
import BuildTag from '../components/BuildTag';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../config/firebase';
import { useAuth } from '../context/AuthContext';

const LoginScreen = () => {
  const [internalNumber, setInternalNumber] = useState('');
  const [password, setPassword] = useState('');
  const { login } = useAuth();

  // MultiTenant States
  const [companySlug, setCompanySlug] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showReset, setShowReset] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    const raw = internalNumber.trim();

    // ESTRATEGIA 1: Firebase Auth (para usuarios en producción)
    try {
      const email = raw.includes('@') ? raw : `${raw}@ucot.internal`;
      await signInWithEmailAndPassword(auth, email, password);
      // AuthContext (onAuthStateChanged) actualizará user/token
      setIsSuccess(true);
      setTimeout(() => {
        window.location.href = '/dashboard';
      }, 800);
      return;
    } catch (firebaseErr: any) {
      // Si el usuario no existe en Firebase Auth, intentar backend local
      const notFound = [
        'auth/user-not-found',
        'auth/invalid-credential',
        'auth/invalid-email',
        'auth/wrong-password',
      ];
      if (!notFound.some((code) => firebaseErr?.code === code)) {
        // Error distinto (red, config), reportar directo
        setError('Error de conexión con Firebase. Verifica tu internet.');
        console.error('Firebase error:', firebaseErr);
        setIsLoading(false);
        return;
      }
    }

    // ESTRATEGIA 2: Backend Express local (localhost:3001) — funciona siempre en desarrollo
    try {
      const res = await fetch('http://localhost:3001/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ internalNumber: raw, password }),
      });

      if (!res.ok) {
        setError('Credenciales inválidas');
        setIsLoading(false);
        return;
      }

      const data = await res.json();
      // Registrar sesión en el contexto de autenticación
      login(data.token, {
        id: data.user.id,
        internalNumber: String(data.user.internalNumber),
        firstName: data.user.firstName,
        lastName: data.user.lastName,
        fullName: data.user.fullName,
        role: data.user.role,
      });
      setIsSuccess(true);
      setTimeout(() => {
        window.location.href = '/dashboard';
      }, 800);
    } catch (backendErr) {
      console.error('Backend error:', backendErr);
      setError('No se pudo conectar. Asegúrate de que la aplicación esté corriendo (INICIAR.bat).');
      setIsLoading(false);
    }
  };

  if (isSuccess) {
    return (
      <div
        key="login-success"
        className="flex items-center justify-center min-h-screen bg-slate-950 bg-[url('https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?q=80&w=2069&auto=format&fit=crop')] bg-cover bg-center bg-no-repeat relative"
      >
        <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-xl"></div>
        <div className="relative p-8 text-center animate-fade-in-up">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-emerald-500/20 mb-6 animate-pulse">
            <CheckCircle className="w-10 h-10 text-emerald-400" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">¡Bienvenido!</h2>
          <p className="text-slate-400">Ingresando al sistema...</p>
        </div>
      </div>
    );
  }

  return (
    <div
      key="login-form"
      className="flex items-center justify-center min-h-screen bg-slate-950 bg-[url('https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?q=80&w=2069&auto=format&fit=crop')] bg-cover bg-center bg-no-repeat relative overflow-hidden"
    >
      {/* Animated background elements */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary-600/20 rounded-full blur-[120px] animate-pulse"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-purple-600/20 rounded-full blur-[120px] animate-pulse-slow"></div>

      {/* Overlay */}
      <div className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm"></div>

      <div className="relative w-full max-w-md p-10 glass-panel rounded-[2.5rem] animate-fade-in-up border border-white/10 shadow-2xl">
        <div className="text-center mb-10">
          <div className="relative inline-flex items-center justify-center w-24 h-24 rounded-3xl bg-gradient-to-br from-primary-500 to-primary-700 p-0.5 mb-6 shadow-xl shadow-primary-900/20 group">
            <div className="w-full h-full bg-slate-900 rounded-[1.4rem] flex items-center justify-center transition-transform group-hover:scale-95 duration-500">
              <Bus className="w-12 h-12 text-primary-400 animate-float" />
            </div>
            {/* Decorative steering-like ring */}
            <div className="absolute inset-[-8px] border-2 border-primary-500/20 rounded-[2rem] animate-spin-slow"></div>
          </div>
          <h1 className="text-4xl font-extrabold text-white tracking-tighter mb-2 bg-clip-text text-transparent bg-gradient-to-b from-white to-slate-400">
            TransForma- <span className="text-xs text-primary-500">v3.0</span>
          </h1>

          <div className="flex items-center justify-center gap-2">
            <div className="h-[1px] w-8 bg-gradient-to-r from-transparent to-primary-500/50"></div>
            <p className="text-primary-400 font-medium tracking-widest uppercase text-[10px]">
              Gestión en movimiento
            </p>
            <div className="h-[1px] w-8 bg-gradient-to-l from-transparent to-primary-500/50"></div>
          </div>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/50 rounded-xl flex items-center gap-3 text-red-500">
            <AlertCircle className="w-5 h-5" />
            <p className="text-sm font-medium">{error}</p>
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-6">
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-300">Número de Interno</label>
            <div className="relative">
              <UserCircle className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
              <input
                type="text"
                placeholder="Ej. 1234"
                className="input-field pl-10 bg-slate-800/50 border-slate-700 text-white placeholder:text-slate-600 focus:border-primary-500"
                value={internalNumber}
                onChange={(e) => setInternalNumber(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-300">Contraseña</label>
            <div className="relative">
              <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
              <input
                type="password"
                placeholder="••••••••"
                className="input-field pl-10 bg-slate-800/50 border-slate-700 text-white placeholder:text-slate-600 focus:border-primary-500"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
          </div>

          {/* Advanced / MultiTenant Toggle */}
          <div className="pt-2">
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="text-xs text-slate-500 hover:text-slate-400 underline decoration-dashed"
            >
              {showAdvanced ? 'Ocultar Opciones Avanzadas' : 'Soy de otra empresa / Código Empresa'}
            </button>

            {showAdvanced && (
              <div className="mt-3 animate-fade-in space-y-2">
                <label className="text-sm font-medium text-purple-400">
                  Código de Empresa (Slug)
                </label>
                <input
                  type="text"
                  placeholder="Ej. transportes-sur"
                  className="input-field bg-slate-800/50 border-purple-500/50 text-white placeholder:text-slate-600 focus:border-purple-500"
                  value={companySlug}
                  onChange={(e) => setCompanySlug(e.target.value)}
                />
                <p className="text-xs text-slate-500">
                  Déjalo vacío si eres de UCOT (Empresa Principal)
                </p>
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className={clsx(
              'w-full py-3 px-4 rounded-xl text-white font-semibold transition-all duration-300 flex items-center justify-center gap-2',
              isLoading
                ? 'bg-slate-700 cursor-not-allowed'
                : 'bg-primary-600 hover:bg-primary-500 hover:shadow-lg hover:shadow-primary-500/25 active:transform active:scale-95',
            )}
          >
            {isLoading ? (
              <span className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin"></span>
            ) : (
              <>
                Ingresar (Cloud) <LogIn className="w-4 h-4" />
              </>
            )}
          </button>
        </form>
        <div className="mt-6 text-center text-sm text-slate-500 space-y-4">
          <p className="">
            ¿No tienes cuenta?{' '}
            <a href="#" className="text-primary-400 hover:text-primary-300 transition-colors">
              Solicitar acceso
            </a>
          </p>

          <div className="h-px bg-slate-800 w-1/2 mx-auto"></div>

          <button
            onClick={() => {
              if (
                confirm(
                  '⚠️ ¿ESTÁS SEGURO?\n\nEsto borrará todos los datos locales y restablecerá la aplicación. Úsalo solo si tienes problemas graves.',
                )
              ) {
                import('../utils/CacheBuster').then((m) => m.CacheBuster.nukeSystem());
              }
            }}
            className="text-xs text-red-500/50 hover:text-red-400 underline decoration-dotted transition-colors"
          >
            ¿Problemas de conexión? Restablecer Sistema
          </button>
        </div>
      </div>

      {/* Reset App Modal */}
      {showReset && (
        <div className="fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-slate-900/90 backdrop-blur-sm"
            onClick={() => setShowReset(false)}
          ></div>
          <ResetApp />
          <button
            onClick={() => setShowReset(false)}
            className="fixed top-4 right-4 text-white hover:text-red-400 z-[60]"
          >
            <span className="text-2xl font-bold">×</span>
          </button>
        </div>
      )}

      <BuildTag />
    </div>
  );
};

export default LoginScreen;
