import { useState, useEffect, useRef } from 'react';
import { Html5QrcodeScanner, Html5Qrcode } from 'html5-qrcode';

// Interface for what the hook returns
interface UseCameraReturn {
  // State
  isScanning: boolean;
  isCameraOpen: boolean;
  capturedImage: string | null;
  scannedCode: string | null;
  error: string | null;

  // Actions
  startScanner: (elementId: string) => Promise<void>;
  stopScanner: () => Promise<void>;
  startCamera: (elementId?: string) => Promise<void>; // For photo evidence
  captureImage: () => Promise<string | null>;
  closeCamera: () => void;
  reset: () => void;
}

export const useCamera = (): UseCameraReturn => {
  const [isScanning, setIsScanning] = useState(false);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [scannedCode, setScannedCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const scannerRef = useRef<Html5QrcodeScanner | null>(null);
  const html5QrCodeRef = useRef<Html5Qrcode | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // --- SCANNER MODE (QR) ---
  const startScanner = async (elementId: string) => {
    setError(null);
    try {
      // Cleanup previous instances if any
      if (scannerRef.current) {
        await stopScanner();
      }

      // Using Html5QrcodeScanner for ease of UI (or Html5Qrcode for custom UI)
      // Here we use Html5QrcodeScanner but controlled
      const scanner = new Html5QrcodeScanner(
        elementId,
        {
          fps: 10,
          qrbox: { width: 250, height: 250 },
          aspectRatio: 1.0,
        },
        /* verbose= */ false,
      );

      scanner.render(
        (decodedText) => {
          setScannedCode(decodedText);
          stopScanner(); // Auto-stop on success? Configurable.
        },
        (errorMessage) => {
          // console.warn(errorMessage); // Ignore parse errors
        },
      );

      scannerRef.current = scanner;
      setIsScanning(true);
    } catch (err: any) {
      setError(err.message || 'Error iniciando escáner');
      setIsScanning(false);
    }
  };

  const stopScanner = async () => {
    if (scannerRef.current) {
      try {
        await scannerRef.current.clear();
        scannerRef.current = null;
      } catch (e) {
        console.error('Failed to clear scanner', e);
      }
    }
    setIsScanning(false);
  };

  // --- EVIDENCE MODE (Photo) ---
  // Using raw navigator.mediaDevices for better control over "Capture Image"
  const startCamera = async (elementId = 'camera-preview') => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });

      // Find or create video element
      const videoEl = document.getElementById(elementId) as HTMLVideoElement;
      if (!videoEl) {
        // If the element doesn't exist, we assume the hook consumer provides refs or handles it.
        // For simplicity, we just look for the ID.
        throw new Error(`Element #${elementId} not found`);
      }

      videoEl.srcObject = stream;
      videoEl.play();
      videoRef.current = videoEl;
      setIsCameraOpen(true);
    } catch (err: any) {
      setError('No se pudo acceder a la cámara: ' + err.message);
      setIsCameraOpen(false);
    }
  };

  const captureImage = async () => {
    if (!videoRef.current) {
      setError('Cámara no iniciada');
      return null;
    }

    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
      setCapturedImage(dataUrl);
      return dataUrl;
    }
    return null;
  };

  const closeCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      const tracks = stream.getTracks();
      tracks.forEach((track) => track.stop());
      videoRef.current.srcObject = null;
    }
    setIsCameraOpen(false);
  };

  const reset = () => {
    setCapturedImage(null);
    setScannedCode(null);
    setError(null);
    closeCamera();
    stopScanner();
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      closeCamera();
      stopScanner();
    };
  }, []);

  return {
    isScanning,
    isCameraOpen,
    capturedImage,
    scannedCode,
    error,
    startScanner,
    stopScanner,
    startCamera,
    captureImage,
    closeCamera,
    reset,
  };
};
