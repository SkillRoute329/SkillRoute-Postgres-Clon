import { useState, useCallback, useMemo } from 'react';
import {
  Upload,
  FileUp,
  CheckCircle,
  FileSpreadsheet,
  Loader2,
  Download,
  Trash2,
  Play,
  Cloud,
  Shield,
  Database,
  Map,
} from 'lucide-react';
import { useDropzone } from 'react-dropzone';
import { DataImportService, API_URL } from '../../services/api';
import { ExcelParser } from '../../utils/ExcelParserV2';
import type { ParsedData, ServiceData } from '../../utils/ExcelParserV2';
import DigitalCarton, { type ServiceDefinitionData } from '../../components/DigitalCarton';

// Firebase
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db, storage } from '../../config/firebase';
import { toast } from 'react-hot-toast';
import shp from 'shpjs';
import {
  parseGeoJSONOrJSONToLineasUCOT,
  writeLineasUCOTInBatches,
} from '../../services/ucotLinesService';

// --- ADAPTER WRAPPER: Transforms Parser Data -> UI Component Data ---
const DigitalCartonEditorWrapper = ({
  serviceData,
  onUpdate,
}: {
  serviceData: ServiceData;
  onUpdate: (d: any) => void;
}) => {
  // Transform once on load
  const initialData: ServiceDefinitionData = useMemo(() => {
    // V3 LOGIC: Use exact 'stops' and 'fullSchedule' if available (Carton Mode)
    const headers = (serviceData.stops || []).map((s, i) => ({
      id: `stop-${i}`,
      location: s,
      isStop: true,
    }));

    let rows: any[] = [];
    if (serviceData.fullSchedule && serviceData.fullSchedule.length > 0) {
      // Map exact matrix
      rows = serviceData.fullSchedule.map((trip, idx) => {
        const times: Record<string, string> = {};
        trip.checkpoints.forEach((time, cIdx) => {
          times[`stop-${cIdx}`] = time;
        });
        return {
          id: trip.id || `row-${idx}`,
          startTime: trip.startTime,
          serviceNumber: serviceData.serviceNumber,
          times,
        };
      });
    } else {
      // Fallback (Old Logic or Empty Pattern)
      rows = [
        {
          id: 'row-1',
          times: {},
          serviceNumber: serviceData.serviceNumber,
        },
      ];
    }

    return {
      serviceNumber: serviceData.serviceNumber,
      line: serviceData.lineCode,
      title: `CARTÓN DIGITAL ${serviceData.serviceNumber}`,
      startTime: serviceData.startTime,
      endTime: serviceData.endTime ?? '',
      startLocationDescription: headers[0]?.location || 'SALIDA',
      headers,
      rows,
      reliefs: [],
      totalHours: serviceData.durationMinutes
        ? `${Math.floor(serviceData.durationMinutes / 60)}:${String(serviceData.durationMinutes % 60).padStart(2, '0')}`
        : '',
      waitingTime: '',
      liquidHours: '',
      kilometers: '0',
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

  // Cloud Upload State
  const [uploadArea, setUploadArea] = useState<'TRAFFIC' | 'FLEET' | 'RRHH'>('TRAFFIC');
  const [publishToCloud, setPublishToCloud] = useState(true);

  // Sincronizar Líneas UCOT (Navegador)
  const [syncProgress, setSyncProgress] = useState<{
    current: number;
    total: number;
    codigo: string;
  } | null>(null);
  const [syncResult, setSyncResult] = useState<{ synced: number; errors: string[] } | null>(null);

  // Ingesta de Recorridos STM (GeoJSON/JSON)
  const [stmUploading, setStmUploading] = useState(false);
  const [stmProgress, setStmProgress] = useState<{ written: number; total: number } | null>(null);
  const [stmResult, setStmResult] = useState<{ written: number; errors: string[] } | null>(null);

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
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls'],
      'text/csv': ['.csv'],
    },
    maxFiles: 1,
  });

  const handleSyncLineasUCOT = useCallback(async () => {
    setSyncResult(null);
    const { syncAllLineasFromAPI } = await import('../../services/ucotLinesService');
    const result = await syncAllLineasFromAPI((current, total, codigo) => {
      setSyncProgress({ current, total, codigo });
    });
    setSyncProgress(null);
    setSyncResult(result);
    if (result.errors.length === 0) toast.success(`${result.synced} líneas UCOT sincronizadas.`);
    else toast.error(`${result.synced} OK, ${result.errors.length} errores.`);
  }, []);

  const handleStmFileUpload = useCallback(async (file: File) => {
    setStmResult(null);
    setStmUploading(true);
    try {
      let text: string;
      const isZip = file.name.toLowerCase().endsWith('.zip');
      if (isZip) {
        const buffer = await file.arrayBuffer();
        const geojson = await shp(buffer);
        const normalized = Array.isArray(geojson)
          ? {
              type: 'FeatureCollection' as const,
              features: geojson.flatMap((g: { type?: string; features?: unknown[] }) =>
                g?.type === 'FeatureCollection' && g.features ? g.features : [g],
              ),
            }
          : (geojson as { type?: string; features?: unknown[] })?.type === 'FeatureCollection'
            ? geojson
            : { type: 'FeatureCollection' as const, features: [geojson] };
        text = JSON.stringify(normalized);
      } else {
        text = await file.text();
      }
      const lineas = parseGeoJSONOrJSONToLineasUCOT(text);
      if (lineas.length === 0) {
        toast.error(
          'No se encontraron líneas en el archivo. Esperado: { lineas: [...] } o GeoJSON FeatureCollection.',
        );
        setStmUploading(false);
        return;
      }
      const result = await writeLineasUCOTInBatches(lineas, (written, total) => {
        setStmProgress({ written, total });
      });
      setStmProgress(null);
      setStmResult(result);
      if (result.errors.length === 0)
        toast.success(`${result.written} recorridos STM guardados en lineas_ucot.`);
      else toast.error(`${result.written} OK, ${result.errors.length} errores.`);
    } catch (e) {
      toast.error('Error al procesar archivo: ' + (e instanceof Error ? e.message : String(e)));
      setStmProgress(null);
      setStmResult(null);
    } finally {
      setStmUploading(false);
    }
  }, []);

  // 🚀 CLIENT-SIDE PROCESSING
  const analyzeFile = async (uploadedFile: File) => {
    setUploading(true);
    try {
      // 1. Parse Excel in Browser
      const result = await ExcelParser.parse(uploadedFile);
      setParsedData(result);

      // 2. Análisis local: se ingestarán TODOS los servicios (sin límite)
      const total = result.services.length;
      setAnalysis({
        type: 'JSON_READY',
        count: total,
        preview: result.services.slice(0, 50), // Solo vista previa (máx 50 filas en tabla)
        message: `Archivo procesado: ${result.lines.length} Líneas, ${total} Servicios. Se ingestarán los ${total} registros en la nube.`,
      });
    } catch (error) {
      console.error(error);
      setAnalysis({
        type: 'UNKNOWN',
        count: 0,
        preview: [],
        message: 'Error al procesar archivo en navegador: ' + (error as any).message,
      });
    } finally {
      setUploading(false);
    }
  };

  const [importMode, setImportMode] = useState<'AUTO' | 'ROTATION' | 'CARTON'>('AUTO');
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);

  // ...

  const confirmUpload = async () => {
    if (!parsedData) return;
    setUploading(true);

    try {
      // 1. CLOUD PUBLISH (If checked)
      if (publishToCloud && file) {
        const toastId = toast.loading('Subiendo archivo oficial a Nube...');
        try {
          const timestamp = Date.now();
          const storagePath = `service_matrices/${uploadArea}/${timestamp}_${file.name}`;
          const storageRef = ref(storage, storagePath);

          await uploadBytes(storageRef, file);
          const downloadURL = await getDownloadURL(storageRef);

          // Metadata
          await addDoc(collection(db, 'service_matrices'), {
            fileName: file.name,
            fileUrl: downloadURL,
            area: uploadArea,
            uploadedAt: serverTimestamp(),
            uploadedBy: 'Admin',
            size: file.size,
            type: 'OFFICIAL_MATRIX',
          });
          toast.success('Archivo publicado correctamente', { id: toastId });
        } catch (e: any) {
          toast.error('Error al subir archivo a nube: ' + e.message, { id: toastId });
          // We continue to Ingestion even if Cloud Upload fails?
          // Let's stop if critical? No, allow Partial success.
        }
      }

      // 2. DATA INGESTION (Firestore Seeding)
      const { TransitSeeder } = await import('../../services/TransitSeeder'); // Lazy load

      let res;
      if (importMode === 'ROTATION') {
        res = await TransitSeeder.importUniversal(
          { ...parsedData, type: 'ROTACION' },
          selectedDate,
        );
      } else {
        res = await TransitSeeder.importUniversal(parsedData, selectedDate);
      }

      if (res.success) {
        setSuccessMsg(res.message + (publishToCloud ? ' + Publicado en Nube' : ''));
        setAnalysis(null);
        setFile(null);
        setParsedData(null);
      } else {
        alert('Error de Ingesta: ' + res.message);
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
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.blob())
      .then((blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'Simulacion_Operativa.pdf';
        document.body.appendChild(a);
        a.click();
        a.remove();
      })
      .catch((e) => alert('Error descargando reporte'));
  };

  const resetSimulation = async () => {
    if (!confirm('¿Estás seguro? Esto borrará todas las alertas de simulación activas.')) return;
    try {
      const token = localStorage.getItem('token');
      await fetch(`${API_URL}/simulation/reset`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
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
          Ingesta Universal V3.0 (Cloud + Data)
        </h1>
        <p className="text-slate-400 text-lg">
          Soporta: Matriz (300a), Rotación (Coches), y Sábana (Horarios).
        </p>
        <div className="pt-4">
          <button
            onClick={async () => {
              const token = localStorage.getItem('token');
              const res = await fetch(`${API_URL}/data-import/template`, {
                headers: { Authorization: `Bearer ${token}` },
              });
              if (!res.ok) return alert('Error al descargar plantilla');
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
          <p className="text-xs text-slate-500 mt-1">
            Usa esta plantilla para evitar errores de columnas faltantes.
          </p>
        </div>
      </div>

      {/* Sincronizar Líneas UCOT (Navegador) — 12.7 */}
      <div className="bg-slate-800/80 rounded-2xl border border-slate-700 p-6 mb-6">
        <h3 className="text-lg font-bold text-white flex items-center gap-2">
          <Map className="w-5 h-5 text-primary-500" />
          Sincronizar Líneas UCOT
        </h3>
        <p className="text-slate-400 text-sm mt-1 mb-4">
          Pre-carga recorridos y paradas desde la API de Montevideo para el Navegador UCOT. Una vez
          sincronizadas, estarán disponibles offline en Firestore.
        </p>
        <button
          type="button"
          onClick={handleSyncLineasUCOT}
          disabled={!!syncProgress}
          className="flex items-center gap-2 px-4 py-3 rounded-xl bg-primary-600 hover:bg-primary-500 text-white font-medium disabled:opacity-50"
        >
          {syncProgress ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              {syncProgress.current} / {syncProgress.total} — {syncProgress.codigo}
            </>
          ) : (
            <>
              <Cloud className="w-5 h-5" />
              Sincronizar todas las líneas UCOT
            </>
          )}
        </button>
        {syncProgress && (
          <div className="mt-3 h-2 bg-slate-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-primary-500 transition-all duration-300"
              style={{ width: `${(syncProgress.current / syncProgress.total) * 100}%` }}
            />
          </div>
        )}
        {syncResult && !syncProgress && (
          <div className="mt-3 text-sm text-slate-300">
            <span className="text-emerald-400 font-medium">
              {syncResult.synced} líneas sincronizadas.
            </span>
            {syncResult.errors.length > 0 && (
              <p className="text-amber-400 mt-1">Errores: {syncResult.errors.join('; ')}</p>
            )}
          </div>
        )}
      </div>

      {/* Ingesta de Recorridos STM (GeoJSON/JSON) — Plan B Datos Abiertos IMM */}
      <div className="bg-slate-800/80 rounded-2xl border border-slate-700 p-6 mb-6">
        <h3 className="text-lg font-bold text-white flex items-center gap-2">
          <Map className="w-5 h-5 text-amber-500" />
          Ingesta de Recorridos STM (GeoJSON/JSON)
        </h3>
        <p className="text-slate-400 text-sm mt-1 mb-4">
          Sube un archivo .json o .geojson de Datos Abiertos de la IMM. Formato:{' '}
          <code className="text-amber-400 bg-slate-900 px-1 rounded">
            {'{ lineas: [ { codigo, nombre?, paradas?, recorrido? } ] }'}
          </code>{' '}
          o GeoJSON FeatureCollection con LineString.
        </p>
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 px-4 py-3 rounded-xl bg-slate-700 hover:bg-slate-600 text-white font-medium cursor-pointer transition-colors">
            <FileUp className="w-5 h-5" />
            <span>Seleccionar archivo .json / .geojson / .zip (Shapefile)</span>
            <input
              type="file"
              accept=".json,.geojson,.zip,application/json,application/zip"
              className="hidden"
              disabled={!!stmUploading}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleStmFileUpload(f);
                e.target.value = '';
              }}
            />
          </label>
          {stmUploading && (
            <div className="flex items-center gap-2 text-amber-400">
              <Loader2 className="w-5 h-5 animate-spin" />
              {stmProgress ? `${stmProgress.written} / ${stmProgress.total}` : 'Procesando...'}
            </div>
          )}
        </div>
        {stmProgress && (
          <div className="mt-3 h-2 bg-slate-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-amber-500 transition-all duration-300"
              style={{ width: `${(stmProgress.written / stmProgress.total) * 100}%` }}
            />
          </div>
        )}
        {stmResult && !stmUploading && (
          <div className="mt-3 text-sm text-slate-300">
            <span className="text-emerald-400 font-medium">
              {stmResult.written} líneas guardadas en lineas_ucot.
            </span>
            {stmResult.errors.length > 0 && (
              <p className="text-amber-400 mt-1">Errores: {stmResult.errors.join('; ')}</p>
            )}
          </div>
        )}
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
            <span className="text-2xl font-bold">Procesando archivo...</span>
          </div>
        ) : analysis ? (
          <div className="space-y-6 w-full">
            <div className="flex flex-col items-center text-emerald-300">
              <FileUp className="w-16 h-16 mb-2" />
              <h3 className="text-2xl font-bold">{analysis.message}</h3>
            </div>

            {/* DIGITAL TWIN EDITOR */}
            {analysis.type === 'JSON_READY' &&
            parsedData?.services.length &&
            parsedData.services.length > 0 &&
            parsedData.type === 'CARTON' ? (
              <div className="bg-slate-900 rounded-xl p-4 border border-slate-700">
                <h4 className="text-sm font-bold text-center text-blue-400 uppercase mb-4 animate-pulse">
                  🛠️ Editor Gemini (Gemelo Digital) - {parsedData.services[0].lineCode}
                </h4>
                <DigitalCartonEditorWrapper
                  serviceData={parsedData.services[0]}
                  onUpdate={(updatedV) => {
                    console.log(updatedV);
                  }}
                />
              </div>
            ) : (
              <div className="w-full overflow-x-auto shadow-sm rounded-lg bg-slate-900 rounded-xl p-4 text-left">
                <h4 className="text-xs font-bold text-slate-500 uppercase mb-2">
                  Vista Previa (mostrando {analysis.preview.length} de {analysis.count} — se
                  ingestarán todos)
                </h4>
                <table className="w-full text-xs text-slate-300 min-w-[400px]">
                  <thead>
                    <tr className="border-b border-slate-700">
                      {analysis.preview[0] &&
                        Object.keys(analysis.preview[0])
                          .slice(0, 8)
                          .map((key) => (
                            <th key={key} className="p-2 text-slate-400">
                              {key}
                            </th>
                          ))}
                    </tr>
                  </thead>
                  <tbody>
                    {analysis.preview.map((row, i) => (
                      <tr key={i} className="border-b border-slate-800 hover:bg-slate-800/50">
                        {Object.entries(row)
                          .slice(0, 8)
                          .map(([key, val], j) => (
                            <td key={j} className="p-2 truncate max-w-[200px]">
                              {String(val)}
                            </td>
                          ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="bg-slate-800 p-4 rounded-xl border border-slate-700 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs uppercase text-slate-500 font-bold mb-1">
                    Import Mode
                  </label>
                  <select
                    className="w-full bg-slate-900 text-white p-2 rounded border border-slate-600 outline-none"
                    value={importMode}
                    onChange={(e) => setImportMode(e.target.value as any)}
                  >
                    <option value="AUTO">Automático</option>
                    <option value="ROTATION">Rotación</option>
                    <option value="CARTON">Cartones</option>
                  </select>
                </div>
                {(importMode === 'ROTATION' || parsedData?.type === 'ROTACION') && (
                  <div>
                    <label className="block text-xs uppercase text-slate-500 font-bold mb-1">
                      Fecha Op.
                    </label>
                    <input
                      type="date"
                      className="w-full bg-slate-900 text-white p-2 rounded border border-slate-600 outline-none"
                      value={selectedDate}
                      onChange={(e) => setSelectedDate(e.target.value)}
                    />
                  </div>
                )}
              </div>

              <div className="pt-4 border-t border-slate-700">
                <div className="flex items-center gap-3 mb-3">
                  <input
                    type="checkbox"
                    id="publishCheck"
                    checked={publishToCloud}
                    onChange={(e) => setPublishToCloud(e.target.checked)}
                    className="w-5 h-5 rounded border-slate-600 text-emerald-500 focus:ring-emerald-500 bg-slate-900"
                  />
                  <label
                    htmlFor="publishCheck"
                    className="flex flex-col cursor-pointer select-none"
                  >
                    <span className="text-white font-bold flex items-center gap-2">
                      <Cloud className="w-4 h-4 text-blue-400" />
                      Publicar Archivo en Matriz de Servicio
                    </span>
                    <span className="text-xs text-slate-400">
                      Hace que este archivo sea visible para todos los usuarios en tiempo real.
                    </span>
                  </label>
                </div>
                {publishToCloud && (
                  <div className="ml-8">
                    <label className="block text-xs uppercase text-slate-500 font-bold mb-1">
                      Área de Publicación
                    </label>
                    <select
                      value={uploadArea}
                      onChange={(e) => setUploadArea(e.target.value as any)}
                      className="w-full bg-slate-900 border border-slate-600 rounded px-3 py-2 text-sm text-white"
                    >
                      <option value="TRAFFIC">Tránsito (Matriz Operativa)</option>
                      <option value="FLEET">Flota (Inventario)</option>
                      <option value="RRHH">RRHH (Planilla)</option>
                    </select>
                  </div>
                )}
              </div>
            </div>

            <div className="flex gap-4 justify-center pt-4">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setFile(null);
                  setAnalysis(null);
                  setParsedData(null);
                }}
                className="px-6 py-3 rounded-xl bg-slate-700 hover:bg-slate-600 font-bold transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  confirmUpload();
                }}
                className="px-8 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold shadow-lg flex items-center gap-2"
              >
                <Database className="w-5 h-5" />
                {publishToCloud ? 'INGESTAR Y PUBLICAR' : 'SOLO INGESTAR'}
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
              <p className="text-slate-400">Publicar en Matriz o Ingestar Datos</p>
            </div>
          </>
        )}
      </div>

      {/* Keeping Existing Simulation/Reset UI */}
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
            className="flex items-center justify-center gap-3 p-4 bg-slate-800 rounded-xl"
          >
            <Download className="w-6 h-6 text-blue-400" />{' '}
            <span className="font-bold text-slate-200">Reporte PDF</span>
          </button>
          <button
            onClick={resetSimulation}
            className="flex items-center justify-center gap-3 p-4 bg-slate-800 rounded-xl"
          >
            <Trash2 className="w-6 h-6 text-red-400" />{' '}
            <span className="font-bold text-slate-200">Limpiar Simulación</span>
          </button>
        </div>
      </div>
    </div>
  );
};
export default DataIngestion;
