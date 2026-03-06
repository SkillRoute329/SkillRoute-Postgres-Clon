import React, { useState } from 'react';
import { Camera, Image as ImageIcon, Loader2, CheckCircle, XCircle } from 'lucide-react';
import { StorageService } from '../../services/storageService';

interface UniversalImageUploaderProps {
  folder: string; // 'sanciones', 'mantenimiento', 'flota', etc.
  entityId?: string;
  label?: string;
  currentImageUrl?: string;
  onUploadComplete: (url: string) => void;
  onError?: (error: string) => void;
}

export const UniversalImageUploader: React.FC<UniversalImageUploaderProps> = ({
  folder,
  entityId = 'new',
  label = 'Adjuntar Evidencia',
  currentImageUrl,
  onUploadComplete,
  onError,
}) => {
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(currentImageUrl || null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validaciones básicas
    if (file.size > 10 * 1024 * 1024) {
      // 10MB
      setErrorMsg('El archivo es demasiado grande (Máx 10MB)');
      return;
    }

    setUploading(true);
    setErrorMsg(null);

    try {
      // Subida Directa
      const url = await StorageService.uploadFile(file, folder, entityId);

      // Éxito
      setPreview(url);
      onUploadComplete(url);
    } catch (err: any) {
      console.error('Upload failed', err);
      let msg = 'Error al subir imagen.';
      if (err.code === 'storage/unauthorized') msg = 'Sin permisos de escritura (403).';
      setErrorMsg(msg);
      if (onError) onError(msg);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="w-full">
      <label className="block text-sm font-bold text-slate-400 mb-2 uppercase tracking-wider">
        {label}
      </label>

      <div
        className={`
                relative border-2 border-dashed rounded-xl p-4 transition-all
                ${errorMsg ? 'border-red-500 bg-red-500/10' : 'border-slate-700 hover:border-primary-500 bg-slate-900/50'}
                ${uploading ? 'opacity-50 pointer-events-none' : ''}
            `}
      >
        <input
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20"
          disabled={uploading}
        />

        <div className="flex flex-col items-center justify-center space-y-3 py-4">
          {uploading ? (
            <>
              <Loader2 className="w-10 h-10 text-primary-500 animate-spin" />
              <span className="text-sm font-medium text-primary-400">Subiendo a Nube...</span>
            </>
          ) : preview ? (
            <>
              <div className="relative w-full aspect-video md:aspect-[21/9] bg-black rounded-lg overflow-hidden group">
                <img src={preview} alt="Evidencia" className="w-full h-full object-contain" />
                <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <div className="flex items-center gap-2 text-white font-bold bg-black/60 px-4 py-2 rounded-full">
                    <Camera size={16} /> Cambiar Foto
                  </div>
                </div>
                <div className="absolute top-2 right-2 bg-green-500 text-white text-xs px-2 py-1 rounded-full flex items-center gap-1 shadow-lg font-bold">
                  <CheckCircle size={12} /> GUARDADO
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="w-16 h-16 rounded-full bg-slate-800 flex items-center justify-center text-slate-500 mb-1 ring-4 ring-slate-800 ring-offset-2 ring-offset-slate-900 group-hover:text-primary-400 group-hover:ring-primary-900/50 transition-all">
                <ImageIcon size={32} />
              </div>
              <div className="text-center">
                <p className="text-base font-bold text-slate-300">Tocar para subir evidencia</p>
                <p className="text-xs text-slate-500 mt-1">Soporta JPG, PNG (Máx 10MB)</p>
              </div>
            </>
          )}
        </div>
      </div>

      {errorMsg && (
        <div className="mt-2 flex items-center gap-2 text-red-400 text-xs font-bold animate-pulse">
          <XCircle size={14} /> {errorMsg}
        </div>
      )}
    </div>
  );
};
