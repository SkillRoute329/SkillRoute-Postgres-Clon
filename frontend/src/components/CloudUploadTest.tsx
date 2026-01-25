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
            console.log("🚀 Iniciando prueba de carga...");
            const url = await StorageService.uploadSancionPhoto(file, 'TEST_DEV_001');
            setImageUrl(url);
        } catch (err: any) {
            setError(err.message || 'Error desconocido');
        } finally {
            setUploading(false);
        }
    };

    return (
        <div style={{ padding: '20px', border: '2px dashed #ccc', borderRadius: '10px', textAlign: 'center', margin: '20px' }}>
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
                        fontWeight: 'bold'
                    }}
                >
                    {uploading ? 'Subiendo a la Nube...' : '📷 Seleccionar Foto'}
                </label>
            </div>

            {error && (
                <div style={{ marginTop: '15px', color: 'red', fontWeight: 'bold' }}>
                    ❌ {error}
                </div>
            )}

            {imageUrl && (
                <div style={{ marginTop: '20px' }}>
                    <p style={{ color: 'green', fontWeight: 'bold' }}>✅ Éxito: Imagen en la Nube</p>
                    <a href={imageUrl} target="_blank" rel="noreferrer" style={{ fontSize: '0.8em', wordBreak: 'break-all' }}>{imageUrl}</a>
                    <br />
                    <img
                        src={imageUrl}
                        alt="Uploaded Evidence"
                        style={{ marginTop: '10px', maxWidth: '100%', maxHeight: '200px', borderRadius: '8px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}
                    />
                </div>
            )}
        </div>
    );
};
