import React, { useState } from 'react';
import { LogIn, KeyRound, UserCircle, AlertCircle, CheckCircle } from 'lucide-react';
import clsx from 'clsx';
import { UserService } from '../services/api';
import { setAuthData } from '../utils/auth';

const LoginScreen = () => {
    const [internalNumber, setInternalNumber] = useState('');
    const [password, setPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isSuccess, setIsSuccess] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setIsLoading(true);

        try {
            const data = await UserService.login(internalNumber, password);

            // Store auth data using context
            // Store auth data directly to localStorage to avoid React State updates during page unload
            setAuthData(data.token, data.user);

            // Show success animation
            setIsSuccess(true);

            // Small delay to let the animation show (and let state propagate) before hard reload
            setTimeout(() => {
                if (data.user.role === 'Admin' || data.user.role === 'SuperAdmin') {
                    window.location.href = '/dashboard/admin/shifts';
                } else {
                    window.location.href = '/dashboard/my-shifts';
                }
            }, 800);
        } catch (err) {
            setError('Credenciales inválidas');
            console.error('Login error:', err);
            setIsLoading(false);
        }
    };

    if (isSuccess) {
        return (
            <div key="login-success" className="flex items-center justify-center min-h-screen bg-slate-900 bg-[url('https://images.unsplash.com/photo-1494515855673-102c2498b22c?q=80&w=2070&auto=format&fit=crop')] bg-cover bg-center bg-no-repeat relative">
                <div className="absolute inset-0 bg-slate-900/90 backdrop-blur-md"></div>
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
        <div key="login-form" className="flex items-center justify-center min-h-screen bg-slate-900 bg-[url('https://images.unsplash.com/photo-1494515855673-102c2498b22c?q=80&w=2070&auto=format&fit=crop')] bg-cover bg-center bg-no-repeat relative">
            {/* Overlay */}
            <div className="absolute inset-0 bg-slate-900/80 backdrop-blur-sm"></div>

            <div className="relative w-full max-w-md p-8 glass-panel rounded-2xl animate-fade-in-up">
                <div className="text-center mb-8">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary-600/20 mb-4 animate-bounce-slow">
                        <UserCircle className="w-8 h-8 text-primary-400" />
                    </div>
                    <h1 className="text-3xl font-bold text-white tracking-tight">TransformaFácil</h1>
                    <p className="text-slate-400 mt-2">Gestión inteligente de turnos</p>
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

                    <button
                        type="submit"
                        disabled={isLoading}
                        className={clsx(
                            "w-full py-3 px-4 rounded-xl text-white font-semibold transition-all duration-300 flex items-center justify-center gap-2",
                            isLoading
                                ? "bg-slate-700 cursor-not-allowed"
                                : "bg-primary-600 hover:bg-primary-500 hover:shadow-lg hover:shadow-primary-500/25 active:transform active:scale-95"
                        )}
                    >
                        {isLoading ? (
                            <span className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin"></span>
                        ) : (
                            <>
                                Ingresar <LogIn className="w-4 h-4" />
                            </>
                        )}
                    </button>
                </form>

                <div className="mt-6 text-center text-sm text-slate-500">
                    ¿No tienes cuenta? <a href="#" className="text-primary-400 hover:text-primary-300 transition-colors">Solicitar acceso</a>
                </div>
            </div>
        </div>
    );
};

export default LoginScreen;
