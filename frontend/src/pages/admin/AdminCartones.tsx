import { useState, useEffect } from 'react';
import MobileCartonCard from '../../components/MobileCartonCard';
import DigitalCarton, { type ServiceDefinitionData } from '../../components/DigitalCarton';
import { Plus, LayoutTemplate, Printer, Search, AlertTriangle } from 'lucide-react';
import { CartonService, BulletinService } from '../../services/api';
import { PdfService } from '../../services/PdfService';
import OptimizationPanel from '../../components/OptimizationPanel';
import DataImporter from '../../components/DataImporter';
import clsx from 'clsx';
import { useAuth } from '../../context/AuthContext';

const AdminCartones = () => {
    const { user } = useAuth();
    // ... code ...

    const loadFromSaved = (saved: any) => {
        // Map backend DTO back to UI
        const uiData: ServiceDefinitionData = {
            serviceNumber: saved.serviceNumber,
            line: saved.line,
            title: saved.variant || 'Servicio',
            startTime: saved.startTime,
            endTime: saved.endTime,
            totalHours: saved.totalHours || '00:00',
            liquidHours: saved.liquidHours || '00:00',
            waitingTime: '00:00', // Default, maybe calculate later
            kilometers: saved.kilometers || '0',
            startLocationDescription: saved.routeData?.startLocationDescription || '',
            headers: saved.routeData?.headers || [],
            rows: saved.routeData?.rows || [],
            reliefs: []
        };
        setCartonData(uiData);
        setShowSelector(false);
    };
    const templateData: ServiceDefinitionData = {
        serviceNumber: '2290',
        line: '370',
        title: 'SABADERO VERANO 2026 UCOT',
        startTime: '04:25',
        startLocationDescription: 'EXPRESO A VERACIERTO E IGUA.-',
        endTime: '20:24',
        headers: [
            { id: 'h1', location: 'Pya.Cerro/Tnal', isStop: true },
            { id: 'h2', location: 'Tnal Cerro', isStop: true },
            { id: 'h3', location: 'E. Romero', isStop: true },
            { id: 'h4', location: 'Agraciada', isStop: true },
            { id: 'h5', location: 'Uruguay/F.Crespo', isStop: true },
            { id: 'h6', location: 'L.A.Herrera y Av Italia', isStop: true },
            { id: 'h7', location: 'Veracierto', isStop: true },
            { id: 'h8', location: 'Portones', isStop: true },
            { id: 'h9', location: 'ESPERAS', isStop: false },
            { id: 'h10', location: 'Portones Tnal', isStop: true },
            { id: 'h11', location: 'Veracierto', isStop: true },
            { id: 'h12', location: 'L.A.Herrera y Av Italia', isStop: true },
            { id: 'h13', location: 'Uruguay/F.Crespo', isStop: true },
            { id: 'h14', location: 'Agraciada', isStop: true },
            { id: 'h15', location: 'E. Romero', isStop: true },
            { id: 'h16', location: 'Tnal Cerro', isStop: true },
            { id: 'h17', location: 'Pya.Cerro/Tnal', isStop: true },
            { id: 'h18', location: 'ESPERAS', isStop: false },
        ],
        rows: [
            {
                id: 'r1',
                times: {
                    h1: '06:15', h2: '06:28', h3: '06:42', h4: '06:53', h5: '07:05', h6: '07:18', h7: '07:33', h8: '07:46', h9: '12', h10: '07:58', h11: '08:10', h12: '08:25', h13: '08:38', h14: '08:49', h15: '09:01', h16: '09:16', h17: '09:29', h18: '11'
                }
            }
        ],
        reliefs: [],
        totalHours: '15:59',
        waitingTime: '01:43',
        liquidHours: '14:16',
        kilometers: '229,20'
    };

    const emptyData: ServiceDefinitionData = {
        serviceNumber: '',
        line: '',
        title: 'NUEVO SERVICIO',
        startTime: '00:00',
        startLocationDescription: '',
        endTime: '',
        headers: [
            { id: 'h1', location: 'PARADA 1', isStop: true },
            { id: 'h2', location: 'PARADA 2', isStop: true },
        ],
        rows: [
            { id: 'r1', times: {} }
        ],
        reliefs: [],
        totalHours: '00:00',
        waitingTime: '00:00',
        liquidHours: '00:00',
        kilometers: '0'
    };

    const [cartonData, setCartonData] = useState<ServiceDefinitionData>(templateData);
    const [savedCartons, setSavedCartons] = useState<any[]>([]);
    const [showSelector, setShowSelector] = useState(false);
    const [loading, setLoading] = useState(false);
    const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

    useEffect(() => {
        loadSavedCartons();
        const handleResize = () => setIsMobile(window.innerWidth < 768);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    const loadSavedCartons = async () => {
        try {
            const data = await CartonService.getAll(1); // Default Season 1 for now
            setSavedCartons(data);
        } catch (error) {
            console.error('Error loading cartons', error);
        }
    };

    const handleSave = async (newData: ServiceDefinitionData) => {
        setLoading(true);
        try {
            // Transform UI data to Backend DTO
            const payload = {
                seasonId: 1, // Fixed for demo
                serviceNumber: newData.serviceNumber,
                line: newData.line,
                variant: newData.title,
                startTime: newData.startTime,
                endTime: newData.endTime,
                totalHours: newData.totalHours,
                liquidHours: newData.liquidHours,
                kilometers: newData.kilometers,
                routeData: {
                    headers: newData.headers,
                    rows: newData.rows,
                    startLocationDescription: newData.startLocationDescription
                }
            };

            await CartonService.save(payload);
            setCartonData(newData);
            alert('Cartón guardado correctamente en la base de datos.');
            loadSavedCartons();
        } catch (error) {
            console.error(error);
            alert('Error al guardar cartón.');
        } finally {
            setLoading(false);
        }
    };

    const loadTemplate = () => {
        setCartonData(templateData);
        setShowSelector(false);
    }

    const loadEmpty = () => {
        setCartonData(emptyData);
        setShowSelector(false);
    }

    return (
        <div className="space-y-6 animate-fade-in-up relative">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold text-white">Gestión de Cartones Digitales</h1>
                    <p className="text-slate-400">Diseña y modifica los cartones de servicio.</p>
                    <p className="text-xs text-slate-500 mt-1">Temporada Activa: Verano 2026</p>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={() => setShowSelector(!showSelector)}
                        className="bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded-xl flex items-center gap-2 transition-colors border border-slate-600"
                    >
                        <LayoutTemplate className="w-5 h-5" /> Abrir...
                    </button>
                    <button
                        onClick={loadEmpty}
                        className="bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-xl flex items-center gap-2 transition-colors shadow-lg shadow-primary-900/20"
                    >
                        <Plus className="w-5 h-5" /> Nuevo
                    </button>
                    <button
                        onClick={() => {
                            const service = prompt("Ingrese Serviico de Boletín a Importar (ej. 2290)");
                            const date = prompt("Fecha del Boletín (YYYY-MM-DD)");
                            if (service && date) {
                                setLoading(true);
                                BulletinService.generateCarton({ serviceNumber: service, date })
                                    .then(data => {
                                        // Reuse the existing mapper logic
                                        loadFromSaved(data);
                                        alert("Datos importados del boletín. Revise y guarde.");
                                    })
                                    .catch(e => alert("Error importando: " + e.message))
                                    .finally(() => setLoading(false));
                            }
                        }}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl flex items-center gap-2 transition-colors"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" x2="12" y1="15" y2="3" /></svg>
                        Importar Boletín
                    </button>
                    <button
                        onClick={async () => {
                            setLoading(true);
                            try {
                                await PdfService.generateBoletinOficial(savedCartons);
                            } catch (e) {
                                console.error(e);
                                alert('Error generando PDF');
                            } finally {
                                setLoading(false);
                            }
                        }}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl flex items-center gap-2 transition-colors shadow-lg shadow-emerald-900/20"
                    >
                        <Printer className="w-5 h-5" /> Exportar Boletín
                    </button>
                </div>
            </div>

            {/* SPLIT LAYOUT: Sidebar (List) + Workspace (Editor) */}
            <div className="flex flex-col lg:flex-row gap-6 h-[calc(100vh-140px)]">

                {/* SIDEBAR NAVIGATION */}
                <div className="w-full lg:w-80 shrink-0 bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden flex flex-col">
                    <div className="p-4 border-b border-slate-800 bg-slate-900 sticky top-0 z-10">
                        <h3 className="font-bold text-slate-300 uppercase text-xs tracking-wider mb-2">Explorador de Flota</h3>
                        <div className="relative">
                            <input
                                placeholder="Buscar (ej. 1014, 300)"
                                className="w-full bg-slate-800 border-none rounded-lg py-2 pl-3 pr-8 text-sm text-white focus:ring-1 focus:ring-primary-500 placeholder-slate-500"
                            />
                            <Search className="absolute right-2 top-2.5 w-4 h-4 text-slate-500" />
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1">
                        {/* INFERENCIA Y DEDUPLICACIÓN EN VIVO */}
                        {(() => {
                            // 1. Grouping Logic
                            const groups: Record<string, any[]> = {
                                'CONVENCIONAL': [],
                                'PISO BAJO': [], // IDs 1011...
                                'HÍBRIDO': [],   // IDs 1100...
                                'ELÉCTRICOS': [],
                                'OTROS': []
                            };

                            // Map to handle deduplication by Service Number
                            const seenServices = new Set();

                            savedCartons.slice().sort((a, b) => parseInt(a.serviceNumber) - parseInt(b.serviceNumber)).forEach(s => {
                                if (seenServices.has(s.serviceNumber)) {
                                    // MERGE/DEDUPLICATE LOGIC WOULD GO HERE
                                    // For now, we skip duplicates to show clean list
                                    return;
                                }
                                seenServices.add(s.serviceNumber);

                                // Simple Category Detection based on ID ranges (Heuristic)
                                const id = parseInt(s.serviceNumber);
                                let cat = 'OTROS';
                                if (id >= 1000 && id < 1010) cat = 'CONVENCIONAL';
                                else if (id >= 1011 && id < 1100) cat = 'PISO BAJO';
                                else if (id >= 1100 && id < 1200) cat = 'HÍBRIDO';
                                else if (id >= 1200) cat = 'ELÉCTRICOS';

                                groups[cat].push(s);
                            });

                            return Object.entries(groups).map(([category, items]) => items.length > 0 && (
                                <div key={category} className="mb-2">
                                    <button className="w-full flex items-center justify-between px-3 py-2 text-xs font-bold text-slate-400 uppercase bg-slate-800/50 hover:bg-slate-800 rounded-lg mb-1 transition-colors">
                                        <span>📂 {category}</span>
                                        <span className="bg-slate-900 px-1.5 rounded text-[10px]">{items.length}</span>
                                    </button>
                                    <div className="space-y-0.5 ml-2 border-l border-slate-800 pl-2">
                                        {items.map(s => (
                                            <button
                                                key={s.id}
                                                onClick={() => loadFromSaved(s)}
                                                className={clsx(
                                                    "w-full text-left px-3 py-2 rounded-lg text-sm transition-all flex justify-between items-center group",
                                                    cartonData.serviceNumber === s.serviceNumber
                                                        ? "bg-primary-600 text-white shadow-lg shadow-primary-900/50"
                                                        : "text-slate-400 hover:text-white hover:bg-slate-800"
                                                )}
                                            >
                                                <div className="flex flex-col leading-tight">
                                                    <span className="font-bold font-mono">SERV: {s.serviceNumber}</span>
                                                    <span className="text-[10px] opacity-70 truncate max-w-[120px]">{s.title || s.line}</span>
                                                </div>
                                                {/* Inferred Status Indicator */}
                                                {!s.routeData?.headers?.length && (
                                                    <span title="Estructura Inferida (Datos Incompletos)">
                                                        <AlertTriangle className="w-3 h-3 text-yellow-500 animate-pulse" />
                                                    </span>
                                                )}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            ));
                        })()}
                    </div>
                </div>

                {/* WORKSPACE AREA */}
                <div className="flex-1 bg-slate-900/50 rounded-3xl border border-slate-800 overflow-hidden relative flex flex-col">
                    {/* Header Bar */}

                    <div className="h-12 border-b border-slate-700 bg-slate-900/80 backdrop-blur flex items-center px-4 justify-between">
                        <div className="flex items-center gap-4 text-sm">
                            <div className="flex flex-col">
                                <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Servicio Activo</span>
                                <span className="font-mono font-bold text-white text-lg leading-none">{cartonData.serviceNumber || '---'}</span>
                            </div>
                            <div className="h-8 w-px bg-slate-700"></div>
                            <div className="flex flex-col">
                                <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Categoría</span>
                                <span className="font-bold text-primary-400 text-sm leading-none">
                                    {parseInt(cartonData.serviceNumber) >= 1100 ? 'HÍBRIDO' : 'DIESEL / STD'}
                                </span>
                            </div>

                            {/* SIMULATION TOOLS */}
                            <div className="h-8 w-px bg-slate-700"></div>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => {
                                        // Simple Simulation Logic: Fill random times
                                        const newRows = cartonData.rows.map(r => {
                                            const newTimes: any = {};
                                            cartonData.headers.forEach(h => {
                                                if (h.isStop) {
                                                    const hour = Math.floor(Math.random() * 24).toString().padStart(2, '0');
                                                    const min = Math.floor(Math.random() * 60).toString().padStart(2, '0');
                                                    newTimes[h.id] = `${hour}:${min}`;
                                                }
                                            });
                                            return { ...r, times: newTimes };
                                        });
                                        setCartonData({ ...cartonData, rows: newRows });
                                        alert('Datos simulados generados. Recuerde NO guardar si es una prueba.');
                                    }}
                                    className="bg-purple-600/20 text-purple-400 text-xs px-2 py-1 rounded hover:bg-purple-600/40 transition-colors uppercase font-bold tracking-wider border border-purple-500/30"
                                >
                                    🧪 Simular
                                </button>

                                <button
                                    onClick={async () => {
                                        if (!confirm('ATENCIÓN: Esto forzará la reparación de la base de datos maestra. ¿Continuar?')) return;
                                        setLoading(true);
                                        try {
                                            // Call debug endpoint directly (Bypass service layer for internal tool)
                                            const res = await fetch('https://transformafacil-20-production.up.railway.app/api/debug/force-seed');
                                            if (res.ok) {
                                                alert('Reparación Exitosa: Datos maestros restaurados.');
                                                loadSavedCartons(); // Reload list
                                            } else {
                                                alert('Error del servidor al reparar.');
                                            }
                                        } catch (e) {
                                            alert('Error de conexión.');
                                        } finally {
                                            setLoading(false);
                                        }
                                    }}
                                    className="bg-red-600/20 text-red-400 text-xs px-2 py-1 rounded hover:bg-red-600/40 transition-colors uppercase font-bold tracking-wider border border-red-500/30 flex items-center gap-1"
                                    title="Forzar Reparación de Base de Datos"
                                >
                                    🛠️ Reparar DB
                                </button>
                            </div>

                            <div className="h-8 w-px bg-slate-700"></div>
                            <div className="flex items-center gap-2">
                                {(!cartonData.headers || cartonData.headers.length === 0) && (
                                    <span className="bg-yellow-500/10 border border-yellow-500/50 text-yellow-500 px-2 py-0.5 rounded text-[10px] font-bold flex items-center gap-1">
                                        <AlertTriangle className="w-3 h-3" /> ESTRUCTURA INFERIDA
                                    </span>
                                )}
                                <span className="bg-emerald-500/10 border border-emerald-500/50 text-emerald-500 px-2 py-0.5 rounded text-[10px] font-bold">
                                    ● ONLINE
                                </span>
                            </div>
                        </div>
                    </div>

                    <div className="flex-1 overflow-auto p-4 relative">
                        {loading ? (
                            <div className="absolute inset-0 flex items-center justify-center bg-slate-900/80 z-20">
                                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500"></div>
                            </div>
                        ) : (
                            <DigitalCarton
                                key={cartonData.serviceNumber + cartonData.line + Date.now()}
                                data={cartonData}
                                isEditable={user?.role === 'Admin' || user?.role === 'SuperAdmin' || user?.role === 'Encargado'}
                                onSave={handleSave}
                            />
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AdminCartones;
