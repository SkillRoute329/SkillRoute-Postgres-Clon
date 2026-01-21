import { useState, useEffect } from 'react';
import MobileCartonCard from '../../components/MobileCartonCard';
import DigitalCarton, { type ServiceDefinitionData } from '../../components/DigitalCarton';
import { Plus, LayoutTemplate } from 'lucide-react';
import { CartonService, BulletinService } from '../../services/api';
import OptimizationPanel from '../../components/OptimizationPanel';
import DataImporter from '../../components/DataImporter';

const AdminCartones = () => {
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

    // loadFromSaved moved up


    // loadFromSaved moved up

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
                </div>
            </div>

            {/* Selection Modal/Overlay */}
            {showSelector && (
                <div className="absolute top-20 right-0 z-20 bg-slate-800 border border-slate-700 p-4 rounded-2xl shadow-2xl w-96 animate-in fade-in slide-in-from-top-4 max-h-[80vh] overflow-y-auto custom-scrollbar">
                    <h3 className="text-white font-bold mb-3">Seleccionar Cartón</h3>

                    <div className="space-y-2 mb-4">
                        <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">Plantillas</p>
                        <button
                            onClick={loadTemplate}
                            className="w-full flex items-center gap-3 p-3 rounded-xl bg-slate-700/50 hover:bg-slate-700 text-white transition-colors text-left"
                        >
                            <LayoutTemplate className="w-4 h-4 text-slate-400" />
                            <span className="text-sm">Ejemplo Línea 370</span>
                        </button>
                    </div>

                    <div className="space-y-2">
                        <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">Guardados ({savedCartons.length})</p>
                        {savedCartons.length === 0 && <p className="text-slate-500 text-xs italic">No hay cartones guardados.</p>}

                        {savedCartons.map(s => (
                            <button
                                key={s.id}
                                onClick={() => loadFromSaved(s)}
                                className="w-full flex items-center justify-between p-3 rounded-xl bg-slate-700 hover:bg-slate-600 text-white transition-colors text-left group"
                            >
                                <div>
                                    <span className="block font-bold text-sm">Servicio {s.serviceNumber}</span>
                                    <span className="text-xs text-slate-400">{s.line} - {s.variant}</span>
                                </div>
                                <span className="text-xs bg-slate-900 px-2 py-1 rounded text-slate-300">{s.startTime}</span>
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* Optimization Panel Integration */}
            <div className="mb-6 grid grid-cols-1 xl:grid-cols-3 gap-6">
                <div className="xl:col-span-2">
                    <OptimizationPanel seasonId={1} />
                </div>
                <div className="xl:col-span-1">
                    <DataImporter />
                </div>
            </div>

            <div className="bg-slate-900/50 p-8 rounded-3xl border border-slate-800 overflow-x-auto min-h-[600px] relative">
                {/* Overlay backdrop */}
                {showSelector && <div className="fixed inset-0 z-10" onClick={() => setShowSelector(false)}></div>}

                {loading ? (
                    <div className="absolute inset-0 flex items-center justify-center bg-slate-900/80 z-20">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500"></div>
                    </div>
                ) : (
                    isMobile ? (
                        // VISTA MÓVIL (NUEVA)
                        <MobileCartonCard
                            key={cartonData.serviceNumber + cartonData.line + 'mobile'}
                            data={cartonData}
                            onManage={() => alert('Gestión simplificada: Pendiente de implementación')}
                        />
                    ) : (
                        // VISTA ESCRITORIO (ORIGINAL - NO TOCAR PROPS)
                        <DigitalCarton
                            key={cartonData.serviceNumber + cartonData.line + Date.now()}
                            data={cartonData}
                            isEditable={true}
                            onSave={handleSave}
                        />
                    )
                )}

            </div>
        </div>
    );
};

export default AdminCartones;
