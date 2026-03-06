import { useState, useRef } from 'react';
import { Upload, FileSpreadsheet, Download, CheckCircle, AlertTriangle, X } from 'lucide-react';
import { DataImportService } from '../services/api';

const DataImporter = () => {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState<'IDLE' | 'SUCCESS' | 'ERROR'>('IDLE');
  const [resultData, setResultData] = useState<any>(null); // For success stats or detailed errors
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const droppedFile = e.dataTransfer.files[0];
      if (droppedFile.name.endsWith('.xlsx')) {
        setFile(droppedFile);
        setStatus('IDLE');
        setResultData(null);
      } else {
        alert('Solo se permiten archivos .xlsx');
      }
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setStatus('IDLE');
      setResultData(null);
    }
  };

  const handleUpload = async () => {
    if (!file) return;

    setUploading(true);
    setStatus('IDLE');
    setResultData(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await DataImportService.upload(formData);
      setStatus('SUCCESS');
      setResultData(res);
    } catch (error: any) {
      console.error(error);
      setStatus('ERROR');
      // Try to parse detailed error if available
      try {
        // The error thrown by handleResponse is generic mostly, but if the API returns JSON error,
        // handleResponse throws `error.message`.
        // For detailed row errors, we might need to adjust handleResponse or just assume the message is informative.
        // However, if the error is 400 Bad Request with JSON, handleResponse throws { message: ... } usually.
        // Let's just store the error object/message.
        // In our implementation, handleResponse throws an Error with .message.
        // If there were detailed errors in the body, handleResponse might mask them if simply throwing message.
        // Let's assume validation errors come in the catch block if handleResponse was modified to support details,
        // but simpler for now:
        setResultData({ message: error.message });
      } catch (e) {
        setResultData({ message: 'Error desconocido al subir.' });
      }
    } finally {
      setUploading(false);
    }
  };

  const handleDownloadTemplate = async () => {
    try {
      const blob = await DataImportService.downloadTemplate();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'plantilla_servicios.xlsx';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (error) {
      console.error('Error downloading template', error);
      alert('Error al descargar la plantilla');
    }
  };

  const clearFile = () => {
    setFile(null);
    setStatus('IDLE');
    setResultData(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="bg-slate-800 rounded-2xl border border-slate-700 overflow-hidden shadow-xl">
      <div className="p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-white font-bold text-lg flex items-center gap-2">
            <Upload className="w-5 h-5 text-indigo-400" />
            Importación Masiva
          </h3>
          <button
            onClick={handleDownloadTemplate}
            className="text-xs flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-600 text-slate-300 hover:bg-slate-700 hover:text-white transition-colors"
          >
            <Download className="w-4 h-4" />
            Descargar Plantilla Oficial
          </button>
        </div>

        {!file ? (
          <div
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-slate-600 rounded-xl p-8 flex flex-col items-center justify-center text-center cursor-pointer hover:border-indigo-500 hover:bg-slate-700/30 transition-all group min-h-[160px]"
          >
            <input
              type="file"
              ref={fileInputRef}
              className="hidden"
              accept=".xlsx"
              onChange={handleFileSelect}
            />
            <div className="bg-slate-700/50 p-3 rounded-full mb-3 group-hover:scale-110 transition-transform">
              <FileSpreadsheet className="w-8 h-8 text-slate-400 group-hover:text-indigo-400" />
            </div>
            <p className="text-slate-300 font-medium">
              Click para seleccionar o arrastra tu Excel aquí
            </p>
            <p className="text-xs text-slate-500 mt-1">Solo archivos .xlsx hasta 5MB</p>
          </div>
        ) : (
          <div className="bg-slate-700/50 rounded-xl p-4 animate-fade-in">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="bg-emerald-500/20 p-2 rounded-lg">
                  <FileSpreadsheet className="w-6 h-6 text-emerald-400" />
                </div>
                <div>
                  <p className="text-white font-medium text-sm">{file.name}</p>
                  <p className="text-xs text-slate-400">{(file.size / 1024).toFixed(1)} KB</p>
                </div>
              </div>
              <button onClick={clearFile} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            {uploading ? (
              <div className="space-y-2">
                <div className="flex justify-between text-xs text-slate-400">
                  <span>Procesando datos masivos...</span>
                  <span>Espere por favor</span>
                </div>
                <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                  <div className="h-full bg-indigo-500 animate-progress"></div>
                </div>
              </div>
            ) : status === 'SUCCESS' ? (
              <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-3">
                <div className="flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 text-emerald-400 mt-0.5" />
                  <div>
                    <p className="text-emerald-300 font-bold text-sm">¡Importación Exitosa!</p>
                    <p className="text-emerald-400/80 text-xs mt-1">
                      Se procesaron {resultData?.processed} de {resultData?.totalRows} registros
                      correctamente.
                    </p>
                  </div>
                </div>
              </div>
            ) : status === 'ERROR' ? (
              <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-red-400 mt-0.5" />
                  <div className="w-full">
                    <p className="text-red-300 font-bold text-sm">Error en la importación</p>
                    <p className="text-red-400/80 text-xs mt-1 mb-2">{resultData?.message}</p>

                    {/* Fallback for detailed errors if we manage to get them from API */}
                    {resultData?.errors && Array.isArray(resultData.errors) && (
                      <div className="max-h-32 overflow-y-auto custom-scrollbar bg-red-900/20 rounded p-2 border border-red-500/10">
                        {resultData.errors.map((err: any, idx: number) => (
                          <div
                            key={idx}
                            className="text-xs text-red-300 border-b border-red-500/10 last:border-0 py-1"
                          >
                            LINEA {err.row}: {err.error}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <button
                onClick={handleUpload}
                className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-2 rounded-lg transition-colors shadow-lg shadow-indigo-900/20"
              >
                Iniciar Importación
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default DataImporter;
