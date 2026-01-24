
import { useState, useCallback } from 'react';
import { Upload, FileUp, CheckCircle, FileSpreadsheet, Loader2, Download, Trash2, Play } from 'lucide-react';
import { useDropzone } from 'react-dropzone';
import { DataImportService, API_URL } from '../../services/api';
import { ExcelParser } from '../../utils/ExcelParser';
import type { ParsedData } from '../../utils/ExcelParser';

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
                    Ingesta Universal V2.5 (Multi-Matriz)
                </h1>
                <p className="text-slate-400 text-lg">
                    El procesamiento se realiza en TU navegador para máxima velocidad y seguridad.
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

                        {/* Preview Table */}
                        <div className="bg-slate-900 rounded-xl p-4 overflow-x-auto text-left shadow- inner">
                            <h4 className="text-xs font-bold text-slate-500 uppercase mb-2">Vista Previa ({analysis.count} filas)</h4>
                            <table className="w-full text-xs text-slate-300">
                                <thead>
                                    <tr className="border-b border-slate-700">
                                        {analysis.preview[0] && Object.keys(analysis.preview[0]).slice(0, 6).map(key => (
                                            <th key={key} className="p-2 text-slate-400">{key}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {analysis.preview.map((row, i) => (
                                        <tr key={i} className="border-b border-slate-800">
                                            {Object.values(row).slice(0, 6).map((val: any, j) => (
                                                <td key={j} className="p-2 truncate max-w-[150px]">{String(val)}</td>
                                            ))}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

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
        </div>
    );
};

export default DataIngestion;
