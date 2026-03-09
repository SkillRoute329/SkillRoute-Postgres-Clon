import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import {
  Upload,
  CheckCircle,
  Loader2,
  FileUp,
} from 'lucide-react';
import { DataImportService } from '../services/api';
import { ExcelParser, type ParsedData } from '../utils/ExcelParserV2';

const ExcelUploader = ({ onSuccess }: { onSuccess?: () => void }) => {
  const [parsedData, setParsedData] = useState<ParsedData | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const selectedFile = acceptedFiles[0];
    if (!selectedFile) return;

    setErrorMsg(null);
    setSuccessMsg(null);
    setParsedData(null);
    setAnalyzing(true);

    try {
      // CLIENT-SIDE PARSING ENGINE
      // We parse it locally to ensure it's valid BEFORE hitting the server
      const result = await ExcelParser.parse(selectedFile);
      setParsedData(result);
    } catch (error: any) {
      setErrorMsg('Error leyendo archivo: ' + error.message);
    } finally {
      setAnalyzing(false);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls'],
    },
    maxFiles: 1,
  });

  const confirmUpload = async () => {
    if (!parsedData || uploading) return; // Prevent double submission
    setUploading(true);
    try {
      // Send the PRE-PARSED JSON, not the file
      // This bypasses server-side parsing issues
      await DataImportService.ingestJson(parsedData as unknown as unknown[]);
      setSuccessMsg(
        `✅ Importación Exitosa: ${parsedData.lines.length} Lineas, ${parsedData.services.length} Servicios.`,
      );
      setParsedData(null);
      if (onSuccess) onSuccess();
    } catch (error: any) {
      console.error(error);
      setErrorMsg('Error al enviar datos: ' + error.message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="w-full">
      {/* Success / Error Messages */}
      {successMsg && (
        <div className="bg-emerald-100 border border-emerald-400 text-emerald-700 p-4 rounded-lg flex items-center gap-2 mb-4">
          <CheckCircle className="w-5 h-5" />
          <strong>{successMsg}</strong>
        </div>
      )}
      {errorMsg && (
        <div className="bg-red-100 border border-red-400 text-red-700 p-4 rounded-lg mb-4">
          <strong>Error:</strong> {errorMsg}
        </div>
      )}

      {/* Drop Zone */}
      {!parsedData ? (
        <div
          {...getRootProps()}
          className={`
                        border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all
                        flex flex-col items-center justify-center gap-4
                        ${isDragActive ? 'border-primary-500 bg-primary-50' : 'border-slate-300 hover:border-slate-400 bg-slate-50'}
                    `}
        >
          <input {...getInputProps()} />
          {analyzing ? (
            <Loader2 className="w-10 h-10 animate-spin text-primary-500" />
          ) : (
            <Upload className="w-10 h-10 text-slate-400" />
          )}
          <div>
            <p className="font-bold text-slate-700">
              {analyzing ? 'Analizando archivo...' : 'Tocá para buscar archivo o arrastralo aquí'}
            </p>
            <p className="text-xs text-slate-500">
              Soporta formatos: BOLETÍN y CARTONES (.xlsx, .xls)
            </p>
          </div>
        </div>
      ) : (
        /* Preview & Confirm */
        <div className="bg-white border rounded-xl p-6 shadow-sm">
          <div className="flex items-center gap-3 text-emerald-600 mb-4">
            <FileUp className="w-8 h-8" />
            <div>
              <h4 className="font-bold text-lg">Archivo Analizado ({parsedData.type})</h4>
              <p className="text-xs text-slate-500">
                {parsedData.lines.length} Líneas | {parsedData.services.length} Servicios
              </p>
            </div>
          </div>

          {/* Mini Preview Table */}
          <div className="bg-slate-50 rounded-lg p-2 max-h-40 overflow-auto text-xs mb-4">
            <table className="w-full text-left">
              <thead className="text-slate-500 border-b">
                <tr>
                  <th className="p-1">Línea</th>
                  <th className="p-1">Servicio</th>
                  <th className="p-1">Inicio</th>
                  <th className="p-1">Fin</th>
                </tr>
              </thead>
              <tbody>
                {parsedData.services.slice(0, 5).map((s, i) => (
                  <tr key={i} className="border-b border-slate-100">
                    <td className="p-1 font-mono">{s.lineCode}</td>
                    <td className="p-1 font-mono">{s.serviceNumber}</td>
                    <td className="p-1">{s.startTime}</td>
                    <td className="p-1">{s.endTime}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {parsedData.services.length > 5 && (
              <p className="text-center text-slate-400 mt-2 italic">
                ... y {parsedData.services.length - 5} más
              </p>
            )}
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => setParsedData(null)}
              className="flex-1 py-2 px-4 rounded-lg border border-slate-300 hover:bg-slate-50 text-slate-600 font-semibold"
            >
              Cancelar
            </button>
            <button
              onClick={confirmUpload}
              disabled={uploading}
              className="flex-1 py-2 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-md flex justify-center items-center gap-2"
            >
              {uploading && <Loader2 className="w-4 h-4 animate-spin" />}
              Confirmar Ingesta
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ExcelUploader;
