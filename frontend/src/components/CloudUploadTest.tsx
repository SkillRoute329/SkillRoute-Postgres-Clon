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
    <div
      style={{
        padding: '20px',
        border: '2px dashed #ccc',
        borderRadius: '10px',
        textAlign: 'center',
        margin: '20px',
      }}
    >
      <h3>☁️ Prueba de Capacidad: Storage Directo</h3>
      <p style={{ fontSize: '0.9em', color: '#666' }}>
        Sube una imagen para verificar la conexión directa con el bucket <b>ucot-gestor-cloud</b>.
        Esto salta el servidor backend completamente.
      </p>

      <div style={{ marginTop: '15px' }}>
        <input
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          disabled={uploading}
          style={{ display: 'none' }}
          id="cloud-upload-input"
        />
        <label
          htmlFor="cloud-upload-input"
          style={{
            cursor: uploading ? 'not-allowed' : 'pointer',
            padding: '10px 20px',
            backgroundColor: uploading ? '#ccc' : '#007bff',
            color: 'white',
            borderRadius: '5px',
            fontWeight: 'bold',
          }}
        >
          {uploading ? 'Subiendo a la Nube...' : '📷 Seleccionar Foto'}
        </label>
      </div>

      {/* Estado de Error */}
      {error && (
        <div
          style={{
            marginTop: '15px',
            padding: '10px',
            backgroundColor: '#ffebee',
            color: '#c62828',
            borderRadius: '5px',
            border: '1px solid #ffcdd2',
            fontWeight: 'bold',
          }}
        >
          ❌ {error}
        </div>
      )}

      {/* Estado de Éxito */}
      {imageUrl && (
        <div
          style={{
            marginTop: '20px',
            padding: '15px',
            backgroundColor: '#e8f5e9',
            borderRadius: '8px',
            border: '1px solid #c8e6c9',
          }}
        >
          <p
            style={{ color: '#2e7d32', fontWeight: '900', fontSize: '1.2em', margin: '0 0 10px 0' }}
          >
            🎉 ¡SUBIDA EXITOSA!
          </p>
          <a
            href={imageUrl}
            target="_blank"
            rel="noreferrer"
            style={{ fontSize: '0.8em', color: '#1565c0', wordBreak: 'break-all' }}
          >
            Ver imagen original
          </a>
          <br />
          <img
            src={imageUrl}
            alt="Uploaded Evidence"
            style={{
              marginTop: '10px',
              maxWidth: '100%',
              maxHeight: '200px',
              borderRadius: '8px',
              boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
            }}
          />
        </div>
      )}
    </div>
  );
};
