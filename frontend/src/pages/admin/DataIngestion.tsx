
import { useState, useCallback, useMemo } from 'react';
import { Upload, FileUp, CheckCircle, FileSpreadsheet, Loader2, Download, Trash2, Play } from 'lucide-react';
import { useDropzone } from 'react-dropzone';
import { DataImportService, API_URL } from '../../services/api';
import { ExcelParser } from '../../utils/ExcelParserV2';
import type { ParsedData, ServiceData } from '../../utils/ExcelParserV2';
import DigitalCarton, { type ServiceDefinitionData } from '../../components/DigitalCarton';

// --- ADAPTER WRAPPER: Transforms Parser Data -> UI Component Data ---
const DigitalCartonEditorWrapper = ({ serviceData, onUpdate }: { serviceData: ServiceData; onUpdate: (d: any) => void }) => {
    // Transform once on load
    const initialData: ServiceDefinitionData = useMemo(() => {
        // Convert parser 'routeData' (Arrays of StopTime) into headers/rows format
        // This is complex because parser gives [trip1, trip2] but digital carton needs [row1...rowN] with headers.

        // 1. Extract Unique Stops (Headers)
        // Assume first trip defines the pattern? Or merge all?
        // Parser creates ONE big routeData for "Sample Pattern".
        // Actually, parser output structure for 'routeData' in 'CARTON' mode is:
        // routeData: StopTime[] which is just ONE trip pattern usually.
        // Wait, parser CARTON logic: returns "routeData: allStopTimes.slice(0, stops.length)".
        // It captures one trip to define the STOPS.

        let stops: any[] = [];
        if (Array.isArray(serviceData.routeData)) {
            stops = serviceData.routeData;
        }

        const headers = stops.map((s, i) => ({
            id: `stop-${i}`,
            location: s.stopName,
            isStop: true
        }));

        // 2. Generate Simulated Rows if only 1 trip is present
        // Or if we have full matrix, map it.
        // The parser for CARTON returns "Pattern". The "MATRIZ_COMPLEJA" returns actual trips.
        // If we want to edit the PLAN/TEMPLATE, we just need 1 row? 
        // Or maybe we want to generate the full day?
        // Let's create a single sample row for editing the "Pattern".

        const row = {
            id: 'row-1',
            times: {},
            serviceNumber: serviceData.serviceNumber
        } as any;

        stops.forEach((s, i) => {
            row.times[`stop-${i}`] = s.time;
        });

        return {
            serviceNumber: serviceData.serviceNumber,
            line: serviceData.lineCode,
            title: `PLANILLA ${serviceData.lineCode}`,
            startTime: serviceData.startTime,
            endTime: serviceData.endTime || '00:00',
            startLocationDescription: stops[0]?.stopName || 'SALIDA',
            headers,
            rows: [row], // Just showing the pattern row
            reliefs: [],
            totalHours: '00:00', // Calc later
            waitingTime: '00:00',
            liquidHours: '00:00',
            kilometers: '0'
        };
    }, [serviceData]);

    return (
        <DigitalCarton
            data={initialData}
            isEditable={true}
            onSave={(finalData) => onUpdate(finalData)}
        />
    );
};

interface AnalysisResult {
    type: 'CARTON' | 'BOLETIN' | 'DAILY' | 'UNKNOWN' | 'JSON_READY';
    count: number;
    preview: any[];
    message: string;
}

const DataIngestion = () => {
    const [file, setFile] = useState<File | null>(null);
    const [uploading, setUploading] = useState(false);
    const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
    const [parsedData, setParsedData] = useState<ParsedData | null>(null);
    const [successMsg, setSuccessMsg] = useState<string | null>(null);

    const onDrop = useCallback((acceptedFiles: File[]) => {
        if (acceptedFiles.length > 0) {
            setFile(acceptedFiles[0]);
            setAnalysis(null);
            setSuccessMsg(null);
            setParsedData(null);
            analyzeFile(acceptedFiles[0]);
        }
    }, []);

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        accept: {
            '*/*': []
        },
        maxFiles: 1
    });

    // 🚀 CLIENT-SIDE PROCESSING
    const analyzeFile = async (uploadedFile: File) => {
        setUploading(true);
        try {
            // 1. Parse Excel in Browser
            const result = await ExcelParser.parse(uploadedFile);
            setParsedData(result);

            // 2. Local Analysis for Preview
            setAnalysis({
                type: 'JSON_READY',
                count: result.services.length,
                preview: result.services.slice(0, 10), // Show first 10
                message: `Archivo procesado localmente: ${result.lines.length} Líneas, ${result.services.length} Servicios detectados.`
            });

        } catch (error) {
            console.error(error);
            setAnalysis({
                type: 'UNKNOWN',
                count: 0,
                preview: [],
                message: 'Error al procesar archivo en navegador: ' + (error as any).message
            });
        } finally {
            setUploading(false);
        }
    };

    const confirmUpload = async () => {
        if (!parsedData) return;
        setUploading(true);

        try {
            // 3. Send JSON to Backend
            const res = await DataImportService.ingestJson(parsedData);

            if (res.message) {
                setSuccessMsg(`Importación Completa: ${res.details.lines} Líneas, ${res.details.services} Servicios.`);
                setAnalysis(null);
                setFile(null);
                setParsedData(null);
            }
        } catch (error) {
            console.error(error);
            alert('Error crítico de subida: ' + (error as any).message);
        } finally {
            setUploading(false);
        }
    };

    const downloadReport = () => {
        const token = localStorage.getItem('token');
        fetch(`${API_URL}/simulation/report`, {
            headers: { 'Authorization': `Bearer ${token}` }
        })
            .then(res => res.blob())
            .then(blob => {
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'Simulacion_Operativa.pdf';
                document.body.appendChild(a);
                a.click();
                a.remove();
            })
            .catch(e => alert('Error descargando reporte'));
    };

    const resetSimulation = async () => {
        if (!confirm('¿Estás seguro? Esto borrará todas las alertas de simulación activas.')) return;
        try {
            const token = localStorage.getItem('token');
            await fetch(`${API_URL}/simulation/reset`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            alert('Simulación reiniciada correctamente.');
        } catch (e) {
            console.error(e);
            alert('Error al reiniciar.');
        }
    };

    return (
        <div className="p-8 max-w-4xl mx-auto space-y-8 animate-in fade-in">
            <div className="text-center space-y-2">
                <h1 className="text-4xl font-black text-white tracking-tight flex items-center justify-center gap-3">
                    <FileSpreadsheet className="w-10 h-10 text-emerald-400" />
                    Ingesta Universal V2.7 (Cache-Bust)
                </h1>
                <p className="text-slate-400 text-lg">
                    Soporta: Matriz (300a), Rotación (Coches), y Sábana (Horarios).
                    <span className="block text-xs text-yellow-500 mt-2 font-bold animate-pulse">
                        ⚠️ SI NO VES "V2.6", RECARGA LA PÁGINA (CTRL + F5)
                    </span>
                </p>
                <div className="pt-4">
                    <button
                        onClick={async () => {
                            const token = localStorage.getItem('token');
                            const res = await fetch(`${API_URL}/data-import/template`, {
                                headers: { 'Authorization': `Bearer ${token}` }
                            });
                            if (!res.ok) return alert("Error al descargar plantilla");
                            const blob = await res.blob();
                            const url = window.URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = 'Plantilla_Servicios_V2026.xlsx';
                            a.click();
                        }}
                        className="text-sm font-bold text-emerald-400 underline hover:text-emerald-300 flex items-center justify-center gap-2"
                    >
                        <Download className="w-4 h-4" />
                        DESCARGAR PLANTILLA OFICIAL (.XLSX)
                    </button>
                    <p className="text-xs text-slate-500 mt-1">Usa esta plantilla para evitar errores de columnas faltantes.</p>
                </div>
            </div>

            {successMsg && (
                <div className="bg-emerald-900/50 border border-emerald-500 text-emerald-200 p-6 rounded-2xl flex items-center gap-4 animate-in slide-in-from-top-4">
                    <CheckCircle className="w-8 h-8 shrink-0" />
                    <span className="text-xl font-bold">{successMsg}</span>
                </div>
            )}

            <div
                {...getRootProps()}
                className={`
                    border-4 border-dashed rounded-3xl p-16 text-center cursor-pointer transition-all duration-300
                    flex flex-col items-center justify-center gap-6 min-h-[300px]
                    ${isDragActive ? 'border-emerald-400 bg-emerald-900/20 scale-105' : 'border-slate-700 hover:border-slate-500 bg-slate-800/50'}
                `}
            >
                <input {...getInputProps()} />

                {uploading ? (
                    <div className="flex flex-col items-center gap-4 text-emerald-400">
                        <Loader2 className="w-16 h-16 animate-spin" />
                        <span className="text-2xl font-bold">Procesando...</span>
                    </div>
                ) : analysis ? (
                    <div className="space-y-6 w-full">
                        <div className="flex flex-col items-center text-emerald-300">
                            <FileUp className="w-16 h-16 mb-2" />
                            <h3 className="text-2xl font-bold">{analysis.message}</h3>
                        </div>

                        {/* DIGITAL TWIN EDITOR (PRE-FLIGHT CHECK) */}
                        {analysis.type === 'JSON_READY' && parsedData?.services.length && parsedData.services.length > 0 && parsedData.type === 'CARTON' ? (
                            <div className="bg-slate-900 rounded-xl p-4 border border-slate-700">
                                <h4 className="text-sm font-bold text-center text-blue-400 uppercase mb-4 animate-pulse">
                                    🛠️ Editor de Cartón Digital (Gemelo Digital) - {parsedData.services[0].lineCode}
                                </h4>
                                {/* Show ONLY the first one for demo/MVP editing, or map them? 
                                    Usually you edit the MASTER Template. 
                                    ParsedData.services contains ACTUAL scheduled trips if it's a Carton.
                                    Let's attempt to map the Parsed ServiceData to DigitalCarton format.
                                */}
                                <DigitalCartonEditorWrapper
                                    serviceData={parsedData.services[0]}
                                    onUpdate={(updatedV) => {
                                        // Update the parsedData state with the edited version
                                        const newServices = [...parsedData.services];
                                        // Deep merge or replace logic. 
                                        // Since DigitalCarton outputs ServiceDefinitionData, we need to map back if we want to save changes.
                                        // For now, this is a visual confirmation mainly.
                                        console.log("Carton Edited:", updatedV);
                                        // We would update 'parsedData' here to reflect changes before Upload.
                                    }}
                                />
                                <p className="text-center text-[10px] text-slate-500 mt-2">
                                    * La edición afecta solo a la vista previa, la importación usará la lógica del servidor.
                                </p>
                            </div>
                        ) : (
                            /* Standard Preview Table */
                            <div className="bg-slate-900 rounded-xl p-4 overflow-x-auto text-left shadow-inner">
                                <h4 className="text-xs font-bold text-slate-500 uppercase mb-2">Vista Previa ({analysis.count} filas)</h4>
                                <table className="w-full text-xs text-slate-300">
                                    <thead>
                                        <tr className="border-b border-slate-700">
                                            {analysis.preview[0] && Object.keys(analysis.preview[0]).slice(0, 8).map(key => (
                                                <th key={key} className="p-2 text-slate-400">{key}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {analysis.preview.map((row, i) => (
                                            <tr key={i} className="border-b border-slate-800 hover:bg-slate-800/50">
                                                {Object.entries(row).slice(0, 8).map(([key, val], j) => {
                                                    let displayVal = String(val);
                                                    let isArray = Array.isArray(val);

                                                    if (isArray) {
                                                        displayVal = `[Array ${(val as any[]).length}]`;
                                                    } else if (typeof val === 'object' && val !== null) {
                                                        displayVal = JSON.stringify(val);
                                                    }

                                                    return (
                                                        <td key={j} className="p-2 truncate max-w-[200px]" title={String(val)}>
                                                            {key === 'routeData' || isArray
                                                                ? <span className="text-slate-500 font-mono text-[10px]">{displayVal}</span>
                                                                : displayVal
                                                            }
                                                        </td>
                                                    );
                                                })}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        <div className="flex gap-4 justify-center">
                            <button
                                onClick={(e) => { e.stopPropagation(); setFile(null); setAnalysis(null); setParsedData(null); }}
                                className="px-6 py-3 rounded-xl bg-slate-700 hover:bg-slate-600 font-bold transition-colors"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={(e) => { e.stopPropagation(); confirmUpload(); }}
                                className="px-8 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold shadow-lg hover:shadow-emerald-500/25 transition-all active:scale-95 flex items-center gap-2"
                            >
                                <Upload className="w-5 h-5" />
                                Confirmar Importación
                            </button>
                        </div>
                    </div>
                ) : (
                    <>
                        <div className="w-24 h-24 bg-slate-700 rounded-full flex items-center justify-center mb-4 shadow-xl">
                            <Upload className="w-10 h-10 text-white" />
                        </div>
                        <div className="space-y-2">
                            <p className="text-2xl font-bold text-white">Arrastra tus archivos Excel aquí</p>
                            <p className="text-slate-400">Procesamiento Local (No sube el archivo, solo datos)</p>
                        </div>
                    </>
                )}
            </div>

            {/* Simulation Controls */}
            <div className="bg-slate-900 border border-slate-700 rounded-3xl p-8 space-y-6 opacity-75 hover:opacity-100 transition-opacity">
                <div className="flex items-center gap-4">
                    <div className="p-3 bg-purple-500/20 rounded-xl">
                        <Play className="w-8 h-8 text-purple-400" />
                    </div>
                    <div>
                        <h2 className="text-2xl font-bold text-white">Simulación Operativa</h2>
                        <p className="text-slate-400">Control de escenario de tráfico sintético.</p>
                    </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <button
                        onClick={downloadReport}
                        className="flex items-center justify-center gap-3 p-4 bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded-xl transition-all group"
                    >
                        <Download className="w-6 h-6 text-blue-400 group-hover:scale-110 transition-transform" />
                        <span className="font-bold text-slate-200">Descargar Reporte PDF</span>
                    </button>

                    <button
                        onClick={resetSimulation}
                        className="flex items-center justify-center gap-3 p-4 bg-slate-800 hover:bg-red-900/20 border border-slate-600 hover:border-red-500/50 rounded-xl transition-all group"
                    >
                        <Trash2 className="w-6 h-6 text-red-400 group-hover:scale-110 transition-transform" />
                        <span className="font-bold text-slate-200">Limpiar Simulación ABL</span>
                    </button>
                </div>
            </div>

            {/* Danger Zone */}
            <div className="bg-red-900/10 border border-red-900/50 rounded-3xl p-8 space-y-6">
                <div className="flex items-center gap-4">
                    <div className="p-3 bg-red-900/20 rounded-xl">
                        <Trash2 className="w-8 h-8 text-red-500" />
                    </div>
                    <div>
                        <h2 className="text-2xl font-bold text-red-100">Zona de Peligro</h2>
                        <p className="text-red-400">Acciones destructivas irreversibles.</p>
                    </div>
                </div>

                <div className="grid grid-cols-1 gap-4">
                    <button
                        onClick={async () => {
                            if (confirm('PELIGRO: ¿Estás seguro de BORRAR TODOS LOS DATOS OPERATIVOS? (Turnos, Servicios, Líneas). Esto no se puede deshacer.')) {
                                if (confirm('¿REALMENTE seguro? Se borrará todo lo importado.')) {
                                    try {
                                        setUploading(true);
                                        const res = await DataImportService.clearData();
                                        alert(res.message);
                                        window.location.reload();
                                    } catch (e: any) {
                                        alert('Error: ' + e.message);
                                    } finally {
                                        setUploading(false);
                                    }
                                }
                            }
                        }}
                        className="flex items-center justify-center gap-3 p-4 bg-red-950 hover:bg-red-900 border border-red-800 hover:border-red-600 rounded-xl transition-all group"
                    >
                        <Trash2 className="w-6 h-6 text-red-500 group-hover:scale-110 transition-transform" />
                        <span className="font-bold text-red-200">BORRAR TODOS LOS DATOS (Factory Reset)</span>
                    </button>
                </div>
            </div>
        </div>
    );
};

export default DataIngestion;
