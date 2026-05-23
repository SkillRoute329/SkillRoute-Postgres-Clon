import React, { useState } from 'react';
import { StorageService } from '../services/storageService';

export const CloudUploadTest: React.FC = () => {
  const [uploading, setUploading] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError(null);
    setImageUrl(null);

    try {
      console.log('🚀 Iniciando prueba de carga...');
      const url = await StorageService.uploadFile(file, 'sanciones', 'TEST_DEV_001');

      console.log('✅ Subida exitosa. URL:', url);
      setImageUrl(url);

      // Feedback explícito en pantalla
      alert(`🎉 ¡ÉXITO! Imagen subida correctamente.\n\nURL: ${url}`);
    } catch (err: unknown) {
      console.error('❌ Fallo en la subida:', err);

      let errorMessage = 'Error desconocido.';
      let userTip = 'Intenta nuevamente.';

      // Type narrowing for Firebase Storage errors
      const firebaseErr = err as { code?: string; message?: string };

      // Mapeo de errores comunes de Firebase Storage
      if (firebaseErr.code === 'storage/unauthorized') {
        errorMessage = '⛔ ACCESO DENEGADO (403)';
        userTip =
          "No tienes permiso para escribir en esta ruta ('/reportes'). Verifica las Reglas de Seguridad en Firebase Console.";
      } else if (firebaseErr.code === 'storage/canceled') {
        errorMessage = '⏹️ Subida Cancelada';
        userTip = 'El usuario canceló la operación.';
      } else if (firebaseErr.code === 'storage/unknown') {
        errorMessage = '❓ Error Desconocido';
        userTip = 'Ocurrió un error inesperado al conectar con el servidor.';
      } else if (firebaseErr.message && firebaseErr.message.includes('network')) {
        errorMessage = '📡 Error de Red';
        userTip = 'Verifica tu conexión a internet.';
      } else {
        errorMessage = firebaseErr.message || errorMessage;
      }

      setError(`${errorMessage}: ${userTip}`);
      alert(`❌ ${errorMessage}\n\n${userTip}`);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="p-5 border-2 border-dashed border-gray-300 rounded-xl text-center m-5">
      <h3 className="text-lg font-bold">Prueba de Capacidad: Storage Soberano</h3>
      <p className="text-sm text-gray-500 mt-2">
        Sube una imagen para verificar la conexión con el almacenamiento del servidor propio.
      </p>

      <div className="mt-4">
        <input
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          disabled={uploading}
          className="hidden"
          id="cloud-upload-input"
        />
        <label
          htmlFor="cloud-upload-input"
          className={`px-5 py-2.5 rounded font-bold text-white inline-block transition-colors ${
            uploading
              ? 'cursor-not-allowed bg-gray-400'
              : 'cursor-pointer bg-blue-600 hover:bg-blue-700'
          }`}
        >
          {uploading ? 'Subiendo a la Nube...' : '📷 Seleccionar Foto'}
        </label>
      </div>

      {/* Estado de Error */}
      {error && (
        <div className="mt-4 p-3 bg-red-50 text-red-800 rounded border border-red-200 font-bold">
          ❌ {error}
        </div>
      )}

      {/* Estado de Éxito */}
      {imageUrl && (
        <div className="mt-5 p-4 bg-green-50 rounded-lg border border-green-200">
          <p className="text-green-800 font-black text-xl mb-3">🎉 ¡SUBIDA EXITOSA!</p>
          <a
            href={imageUrl}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-blue-700 break-all hover:underline"
          >
            Ver imagen original
          </a>
          <br />
          <img
            src={imageUrl}
            alt="Uploaded Evidence"
            className="mt-3 max-w-full max-h-[200px] rounded-lg shadow-md mx-auto"
          />
        </div>
      )}
    </div>
  );
};
