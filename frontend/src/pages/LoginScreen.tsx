import React, { useState } from 'react';
import { LogIn, CheckCircle, Bus, AlertCircle } from 'lucide-react';
import clsx from 'clsx';
import ResetApp from '../components/ResetApp';
import BuildTag from '../components/BuildTag';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../config/firebase';
import { useAuth } from '../context/AuthContext';

const LoginScreen = () => {
  const { login } = useAuth();

  // MultiTenant States
  const [showReset, setShowReset] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    // Login real con Firebase Auth (usuario admin creado por seed)
    try {
      await signInWithEmailAndPassword(auth, '1000@ucot.internal', 'Ucot2025!');
    } catch (fbErr) {
      console.warn('[Login] Firebase signIn failed:', fbErr);
    }

    // Establecer contexto de app
    login('dev-bypass-token', {
      id: '1000',
      uid: '1000',
      internalNumber: '1000',
      firstName: 'Admin',
      lastName: 'Temporal',
      fullName: 'Admin Temporal',
      role: 'admin',
    });

    setIsSuccess(true);
    setTimeout(() => {
      window.location.href = '/dashboard';
    }, 800);
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
          <div className="text-center pb-4 text-slate-300 text-sm">
            El acceso mediante credenciales ha sido deshabilitado temporalmente.<br/>Puedes ingresar directamente.
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
                Ingresar Sistema <LogIn className="w-4 h-4" />
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
