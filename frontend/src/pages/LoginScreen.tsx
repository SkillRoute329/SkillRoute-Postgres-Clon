import React, { useState } from 'react';
import { LogIn, KeyRound, UserCircle, AlertCircle, CheckCircle, Bus } from 'lucide-react';
import clsx from 'clsx';
import { UserService } from '../services/api';
import ResetApp from '../components/ResetApp';
import BuildTag from '../components/BuildTag';
import { setAuthData } from '../utils/auth';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../config/firebase';

const LoginScreen = () => {
    const [internalNumber, setInternalNumber] = useState('');
    const [password, setPassword] = useState('');

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

        try {
            const data = await UserService.login(internalNumber, password, companySlug || undefined);

            // Store auth data using context
            // 1. Firebase Auth Login (Direct to Google Cloud)
            const userCredential = await signInWithEmailAndPassword(auth, internalNumber, password);
            const firebaseUser = userCredential.user;
            const token = await firebaseUser.getIdToken();

            // 2. Fetch User Profile from Firestore (for Role & Name)
            // (Our create_admin_user script created this doc)
            const userDocRef = doc(db, 'users', firebaseUser.uid);
            const userDoc = await getDoc(userDocRef);

            let userData = userDoc.exists() ? userDoc.data() : {};

            // Fallback for Admin if Firestore doc missing (Emergency Mode)
            if (!userDoc.exists() && internalNumber.includes('admin')) {
                userData = { role: 'ADMIN', fullName: 'Super Admin Recovered' };
            }

            const appUser = {
                id: firebaseUser.uid, // Use string UID
                email: firebaseUser.email,
                fullName: userData.fullName || 'Usuario',
                role: userData.role || 'User',
                internalNumber: userData.internalNumber || '',
                tenant: { id: 1, name: 'UCOT', slug: 'ucot' } // Hardcoded for emergency
            };

            // 3. Persist Session
            setAuthData(token, appUser);

            // 4. Success UI & Redirect
            setIsSuccess(true);
            setTimeout(() => {
                if (['Admin', 'SuperAdmin', 'Inspector', 'ADMIN'].includes(appUser.role)) {
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
            <div key="login-success" className="flex items-center justify-center min-h-screen bg-slate-950 bg-[url('https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?q=80&w=2069&auto=format&fit=crop')] bg-cover bg-center bg-no-repeat relative">
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
        <div key="login-form" className="flex items-center justify-center min-h-screen bg-slate-950 bg-[url('https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?q=80&w=2069&auto=format&fit=crop')] bg-cover bg-center bg-no-repeat relative overflow-hidden">
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
                        TransForma-
                    </h1>
                    <div className="flex items-center justify-center gap-2">
                        <div className="h-[1px] w-8 bg-gradient-to-r from-transparent to-primary-500/50"></div>
                        <p className="text-primary-400 font-medium tracking-widest uppercase text-[10px]">Gestión en movimiento</p>
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
                                <label className="text-sm font-medium text-purple-400">Código de Empresa (Slug)</label>
                                <input
                                    type="text"
                                    placeholder="Ej. transportes-sur"
                                    className="input-field bg-slate-800/50 border-purple-500/50 text-white placeholder:text-slate-600 focus:border-purple-500"
                                    value={companySlug}
                                    onChange={(e) => setCompanySlug(e.target.value)}
                                />
                                <p className="text-xs text-slate-500">Déjalo vacío si eres de UCOT (Empresa Principal)</p>
                            </div>
                        )}
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
                                Ingresar (Cloud) <LogIn className="w-4 h-4" />
                            </>
                        )}
                    </button>
                </form>
                <div className="mt-6 text-center text-sm text-slate-500">
                    <p className="mb-2">¿No tienes cuenta? <a href="#" className="text-primary-400 hover:text-primary-300 transition-colors">Solicitar acceso</a></p>
                    <button
                        onClick={() => setShowReset(true)}
                        className="text-xs text-red-500/50 hover:text-red-400 underline decoration-dotted transition-colors"
                    >
                        ¿Problemas de conexión / Pantalla blanca?
                    </button>
                </div>
            </div>

            {/* Reset App Modal */}
            {showReset && (
                <div className="fixed inset-0 z-50">
                    <div className="absolute inset-0 bg-slate-900/90 backdrop-blur-sm" onClick={() => setShowReset(false)}></div>
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
