import { useState, useEffect } from 'react';
import { getAuth } from 'firebase/auth';
import { getFirestore, collection, getDocs } from 'firebase/firestore';

const SystemDoctor = () => {
    const [checks, setChecks] = useState<any>({
        auth: { status: 'PENDING', msg: 'Verificando...' },
        api: { status: 'PENDING', msg: 'Verificando...' },
        db: { status: 'PENDING', msg: 'Verificando...' },
        assets: { status: 'PENDING', msg: 'Verificando...' }
    });
    const [logs, setLogs] = useState<string[]>([]);
    const [error, setError] = useState<string | null>(null);

    const addLog = (msg: string) => setLogs(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev]);

    const runDiagnostics = async () => {
        try {
            // 1. Auth Check
            try {
                const auth = getAuth();
                const user = auth.currentUser;
                if (user) {
                    setChecks((prev: any) => ({ ...prev, auth: { status: 'OK', msg: `Logged as ${user.email} (UID: ${user.uid.substring(0, 5)}...)` } }));
                    addLog(`✅ Auth Valid: ${user.email}`);
                } else {
                    setChecks((prev: any) => ({ ...prev, auth: { status: 'FAIL', msg: 'No active session' } }));
                    addLog(`❌ Auth Failed: No Session`);
                }
            } catch (e: any) {
                setChecks((prev: any) => ({ ...prev, auth: { status: 'ERROR', msg: e.message } }));
                addLog(`❌ Auth Error: ${e.message}`);
            }

            // 2. API Check
            try {
                const start = performance.now();
                const res = await fetch('/api/health');
                if (res.ok) {
                    const data = await res.json();
                    const duration = Math.round(performance.now() - start);
                    setChecks((prev: any) => ({ ...prev, api: { status: 'OK', msg: `Online (${duration}ms) - Mode: ${data.mode || 'Unknown'}` } }));
                    addLog(`✅ API Response 200 OK (${duration}ms)`);
                } else {
                    throw new Error(`Status ${res.status}`);
                }
            } catch (e: any) {
                setChecks((prev: any) => ({ ...prev, api: { status: 'FAIL', msg: e.message } }));
                addLog(`❌ API Error: ${e.message}`);
            }

            // 3. DB Check (Firestore Lines & Users)
            try {
                const db = getFirestore();

                // Check Lines (Infrastructure)
                const linesSnap = await getDocs(collection(db, 'lines'));
                const linesCount = linesSnap.size;

                // Check Users (Access)
                const usersSnap = await getDocs(collection(db, 'users'));
                const usersCount = usersSnap.size;

                setChecks((prev: any) => ({
                    ...prev,
                    db: {
                        status: linesCount > 0 || usersCount > 0 ? 'OK' : 'WARN',
                        msg: `Lines: ${linesCount} | Users: ${usersCount}`
                    }
                }));
                addLog(`✅ Firestore: ${linesCount} lines, ${usersCount} users`);
            } catch (e: any) {
                setChecks((prev: any) => ({ ...prev, db: { status: 'FAIL', msg: e.message } }));
                addLog(`❌ Firestore Error: ${e.message}`);
            }

            // 4. Asset Version Check (Frontend Hash)
            try {
                const scripts = document.getElementsByTagName('script');
                let mainScript = '';
                for (let i = 0; i < scripts.length; i++) {
                    if (scripts[i].src && scripts[i].src.includes('index-')) {
                        mainScript = scripts[i].src.split('/').pop() || '';
                        break;
                    }
                }
                if (mainScript) {
                    setChecks((prev: any) => ({ ...prev, assets: { status: 'OK', msg: `Running: ${mainScript}` } }));
                    addLog(`✅ Asset Hash: ${mainScript}`);
                } else {
                    setChecks((prev: any) => ({ ...prev, assets: { status: 'WARN', msg: 'Could not detect version hash (Dev Mode?)' } }));
                }
            } catch (e: any) {
                setChecks((prev: any) => ({ ...prev, assets: { status: 'ERROR', msg: e.message } }));
            }
        } catch (globalError: any) {
            setError(globalError.message);
        }
    };

    useEffect(() => {
        runDiagnostics();
    }, []);

    if (error) {
        return <div className="p-8 text-red-500 bg-black min-h-screen">CRITICAL ERROR: {error}</div>;
    }

    return (
        <div className="p-8 bg-slate-950 text-white min-h-screen font-mono absolute top-0 left-0 w-full z-[99999]" style={{ backgroundColor: '#020617', color: 'white' }}>
            <h1 className="text-3xl font-bold mb-6 text-emerald-400">🩺 System Doctor (v1.2)</h1>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                {Object.entries(checks).map(([key, val]: any) => (
                    <div key={key} className={`p-4 rounded-xl border ${val.status === 'OK' ? 'border-emerald-500/50 bg-emerald-900/20' : val.status === 'WARN' ? 'border-yellow-500/50 bg-yellow-900/20' : val.status === 'PENDING' ? 'border-blue-500/50' : 'border-red-500/50 bg-red-900/20'}`}>
                        <h3 className="uppercase text-xs font-bold opacity-70 mb-1">{key}</h3>
                        <div className="flex items-center gap-2">
                            <span className={`text-xl font-bold ${val.status === 'OK' ? 'text-emerald-400' : 'text-white'}`}>{val.status}</span>
                            <span className="text-sm opacity-80 truncate">{val.msg}</span>
                        </div>
                    </div>
                ))}
            </div>

            <div className="bg-slate-900 rounded-xl p-4 border border-slate-800 h-64 overflow-y-auto font-mono text-xs">
                <div className="flex justify-between items-center mb-2 sticky top-0 bg-slate-900 pb-2 border-b border-slate-800">
                    <span className="font-bold text-slate-400">LIVE LOGS</span>
                    <button onClick={runDiagnostics} className="px-3 py-1 bg-blue-600 hover:bg-blue-500 rounded text-white transition-colors">Re-Run Diagnostics</button>
                </div>
                {logs.map((L, i) => (
                    <div key={i} className="mb-1 text-slate-300 border-b border-slate-800/50 pb-1">{L}</div>
                ))}
            </div>
        </div>
    );
};

export default SystemDoctor;
