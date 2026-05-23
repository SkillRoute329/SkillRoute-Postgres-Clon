import { useState } from 'react';
import { Upload, Loader2, Image as ImageIcon } from 'lucide-react';
import { getStorage, ref, uploadBytesResumable, getDownloadURL } from '../config/firebaseStubsShim';

interface ImageUploaderProps {
  path: string; // Storage path prefix, e.g. "vehicles/95"
  onUploadComplete: (url: string, metadata?: any) => void;
  onError?: (error: any) => void;
  label?: string;
  maxSizeMB?: number;
}

const ImageUploader = ({
  path,
  onUploadComplete,
  onError,
  label = 'Subir Imagen',
  maxSizeMB = 5,
}: ImageUploaderProps) => {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validation
    if (file.size > maxSizeMB * 1024 * 1024) {
      alert(`El archivo excede ${maxSizeMB}MB`);
      return;
    }
    if (!file.type.startsWith('image/')) {
      alert('Solo se permiten imágenes');
      return;
    }

    setUploading(true);
    setProgress(0);

    try {
      const storage = getStorage();
      const fileName = `${Date.now()}_${file.name}`;
      const storageRef = ref(storage, `${path}/${fileName}`);
      const uploadTask = uploadBytesResumable(storageRef, file);

      uploadTask.on(
        'state_changed',
        (snapshot) => {
          const p = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          setProgress(Math.round(p));
        },
        (error) => {
          console.error('Upload failed:', error);
          setUploading(false);
          if (onError) onError(error);
        },
        async () => {
          const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
          setUploading(false);
          onUploadComplete(downloadURL, { name: file.name, type: file.type });
        },
      );
    } catch (error) {
      console.error('Critical Upload Error:', error);
      setUploading(false);
      if (onError) onError(error);
    }
  };

  return (
    <div className="w-full">
      <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-slate-700 border-dashed rounded-xl cursor-pointer bg-slate-800/30 hover:bg-slate-800/50 transition-colors group">
        <div className="flex flex-col items-center justify-center pt-5 pb-6">
          {uploading ? (
            <div className="flex flex-col items-center text-indigo-400">
              <Loader2 className="w-8 h-8 animate-spin mb-2" />
              <p className="text-sm font-semibold">{progress}% Subiendo...</p>
            </div>
          ) : (
            <>
              <Upload className="w-8 h-8 mb-3 text-slate-400 group-hover:text-indigo-400 transition-colors" />
              <p className="mb-1 text-sm text-slate-400 font-medium">{label}</p>
              <p className="text-xs text-slate-500">JPG, PNG (Max {maxSizeMB}MB)</p>
            </>
          )}
        </div>
        <input
          type="file"
          className="hidden"
          onChange={handleFileChange}
          accept="image/*"
          disabled={uploading}
        />
      </label>
    </div>
  );
};

export default ImageUploader;
