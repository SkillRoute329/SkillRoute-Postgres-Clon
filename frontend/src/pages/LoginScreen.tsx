import React, { useState } from 'react';
import { LogIn, CheckCircle, AlertCircle } from 'lucide-react';
import clsx from 'clsx';
import ResetApp from '../components/ResetApp';
import BuildTag from '../components/BuildTag';
import { signInWithCustomToken } from 'firebase/auth';
import { auth } from '../config/firebase';
import { useAuth } from '../context/AuthContext';

const LoginScreen = () => {
  const { login } = useAuth();
  const [showReset, setShowReset] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [usuario, setUsuario] = useState('');
  const [password, setPassword] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!usuario.trim() || !password.trim()) {
      setError('Ingresá tu usuario y contraseña.');
      return;
    }
    setError(null);
    setIsLoading(true);
    try {
      const internalNumber = usuario.trim();
      // Login contra el backend de Cloud Functions: valida credenciales en
      // Firestore y devuelve un Firebase Custom Token (admin.auth().createCustomToken).
      const resp = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ internalNumber, password }),
      });
      const json: any = await resp.json().catch(() => ({}));
      if (!resp.ok || !json?.ok || !json?.firebaseCustomToken) {
        const status = resp.status;
        if (status === 401) setError('Usuario o contraseña incorrectos.');
        else setError(json?.error || 'Error al ingresar. Intentá de nuevo.');
        setIsLoading(false);
        return;
      }

      // signInWithCustomToken crea la sesión Firebase real → getAuth().currentUser
      // queda no-null y las reglas Firestore con isAuthenticated() pasan.
      const cred = await signInWithCustomToken(auth, json.firebaseCustomToken);
      const idToken = await cred.user.getIdToken();

      const u = json.user || {};
      login(idToken, {
        id: cred.user.uid,
        uid: cred.user.uid,
        internalNumber: u.internalNumber ?? internalNumber,
        firstName: u.firstName ?? 'Usuario',
        lastName: u.lastName ?? '',
        fullName: u.fullName ?? 'Usuario',
        role: u.role ?? 'USER',
      });
      setIsSuccess(true);
      setTimeout(() => { window.location.href = '/dashboard'; }, 800);
    } catch (err: any) {
      const code = err?.code ?? '';
      if (code === 'auth/invalid-custom-token' || code === 'auth/custom-token-mismatch') {
        setError('Sesión inválida. Contactá al administrador.');
      } else {
        setError('Error al ingresar. Intentá de nuevo.');
      }
      setIsLoading(false);
    }
  };

  if (isSuccess) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#0a1628] relative">
        <div className="absolute inset-0">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-600/10 rounded-full blur-[120px]" />
          <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-orange-500/8 rounded-full blur-[120px]" />
        </div>
        <div className="relative p-8 text-center animate-fade-in-up">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-emerald-500/15 mb-6 animate-pulse border border-emerald-500/20">
            <CheckCircle className="w-10 h-10 text-emerald-400" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">¡Bienvenido!</h2>
          <p className="text-slate-400">Ingresando al sistema...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-[#0a1628] relative overflow-hidden">
      {/* ── Ambient glows (tonos suavizados del logo) ── */}
      <div className="absolute top-0 left-0 w-[60%] h-[60%] bg-blue-700/8 rounded-full blur-[160px] pointer-events-none" />
      <div className="absolute bottom-0 right-0 w-[50%] h-[50%] bg-orange-600/6 rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[80%] h-[80%] bg-blue-900/10 rounded-full blur-[200px] pointer-events-none" />

      {/* ── Left panel: Logo ──────────────────────────── */}
      <div className="hidden lg:flex flex-1 items-center justify-center p-12 relative">
        <div className="max-w-lg text-center space-y-6">
          {/* Logo image */}
          <div className="relative inline-block">
            <img
              src="/skillroute-logo.png"
              alt="SkillRoute"
              className="w-full max-w-sm mx-auto drop-shadow-[0_0_60px_rgba(59,130,246,0.25)] opacity-90"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
          </div>
          <div className="space-y-2 pt-4">
            <p className="text-slate-400 text-sm leading-relaxed max-w-xs mx-auto">
              Plataforma de gestión integral para operadores de transporte público.
            </p>
            <div className="flex items-center justify-center gap-6 pt-4">
              {['Flota', 'Servicios', 'Estadísticas', 'Portal'].map(label => (
                <div key={label} className="text-center">
                  <div className="w-1.5 h-1.5 rounded-full bg-blue-400/50 mx-auto mb-1" />
                  <span className="text-[10px] text-slate-600 uppercase tracking-widest">{label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Divider ───────────────────────────────────── */}
      <div className="hidden lg:block w-px bg-gradient-to-b from-transparent via-white/5 to-transparent my-16" />

      {/* ── Right panel: Login form ───────────────────── */}
      <div className="flex flex-1 items-center justify-center p-6 lg:p-12">
        <div className="w-full max-w-sm space-y-8">

          {/* Mobile logo */}
          <div className="lg:hidden text-center">
            <img
              src="/skillroute-logo.png"
              alt="SkillRoute"
              className="h-24 mx-auto mb-4 drop-shadow-[0_0_30px_rgba(59,130,246,0.3)] opacity-90"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
          </div>

          {/* Heading */}
          <div className="space-y-2">
            <h1 className="text-3xl font-extrabold tracking-tight">
              <span className="text-white">Skill</span>
              <span className="bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-orange-400">Route</span>
            </h1>
            <p className="text-slate-500 text-sm">Gestión en Movimiento · v4.0</p>
          </div>

          {/* Error */}
          {error && (
            <div className="p-4 bg-red-500/8 border border-red-500/30 rounded-xl flex items-center gap-3 text-red-400">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <p className="text-sm">{error}</p>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs text-slate-500 uppercase tracking-widest font-semibold">Usuario</label>
              <input
                type="text"
                value={usuario}
                onChange={e => setUsuario(e.target.value)}
                placeholder="Ej: 329"
                autoComplete="username"
                className="w-full bg-slate-800/80 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-600 focus:outline-none focus:border-blue-500 transition-colors text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs text-slate-500 uppercase tracking-widest font-semibold">Contraseña</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                className="w-full bg-slate-800/80 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-600 focus:outline-none focus:border-blue-500 transition-colors text-sm"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className={clsx(
                'w-full py-3.5 px-4 rounded-xl text-white font-semibold transition-all duration-300 flex items-center justify-center gap-2 text-sm mt-2',
                isLoading
                  ? 'bg-slate-800 cursor-not-allowed text-slate-500'
                  : 'bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 shadow-lg shadow-blue-900/30 hover:shadow-blue-800/40 active:scale-[0.98]',
              )}
            >
              {isLoading ? (
                <span className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
              ) : (
                <>Ingresar al Sistema <LogIn className="w-4 h-4" /></>
              )}
            </button>
          </form>

          {/* Footer links */}
          <div className="space-y-4 text-center">
            <p className="text-sm text-slate-600">
              ¿Sin acceso?{' '}
              <a href="#" className="text-blue-400/70 hover:text-blue-400 transition-colors">
                Solicitar cuenta
              </a>
            </p>
            <div className="h-px bg-slate-800/60 w-2/3 mx-auto" />
            <button
              onClick={() => {
                if (confirm('⚠️ ¿ESTÁS SEGURO?\n\nEsto borrará todos los datos locales y restablecerá la aplicación.')) {
                  import('../utils/CacheBuster').then((m) => m.CacheBuster.nukeSystem());
                }
              }}
              className="text-xs text-red-500/30 hover:text-red-400/60 underline decoration-dotted transition-colors"
            >
              ¿Problemas de conexión? Restablecer Sistema
            </button>
          </div>
        </div>
      </div>

      {showReset && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-slate-900/90 backdrop-blur-sm" onClick={() => setShowReset(false)} />
          <ResetApp />
          <button onClick={() => setShowReset(false)} className="fixed top-4 right-4 text-white hover:text-red-400 z-[60]">
            <span className="text-2xl font-bold">×</span>
          </button>
        </div>
      )}

      <BuildTag />
    </div>
  );
};

export default LoginScreen;
