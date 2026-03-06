import { useState, useEffect, useRef } from 'react';
import { CartonService, InspectionService } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { computeTimeDeltaMinutes } from '../../utils/inspectionTimeDelta';
import { Timestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '../../config/firebase';
import type { PassengerLoadCategory } from '../../types/inspections';
import { Clock, CheckCircle, Users, Loader2, Camera, Upload, X } from 'lucide-react';

type ControlPointOption = { id: string; name: string; scheduledTime: string };

const InspectorCapture = () => {
  const { user } = useAuth();
  const [lines, setLines] = useState<string[]>([]);
  const [services, setServices] = useState<
    Array<{
      id: string;
      linea: string;
      headers?: Array<{ id: string; location?: string }>;
      rawMatrix?: Array<{ checkpoints: string[] }>;
    }>
  >([]);
  const [controlPoints, setControlPoints] = useState<ControlPointOption[]>([]);

  const [selectedLineId, setSelectedLineId] = useState('');
  const [selectedServiceId, setSelectedServiceId] = useState('');
  const [selectedPoint, setSelectedPoint] = useState<ControlPointOption | null>(null);

  const [loadingLines, setLoadingLines] = useState(true);
  const [loadingServices, setLoadingServices] = useState(false);
  const [capturedAt, setCapturedAt] = useState<number | null>(null);
  const [timeDelta, setTimeDelta] = useState<number | null>(null);
  const [passengerLoad, setPassengerLoad] = useState<PassengerLoadCategory | number | null>(null);
  const [numericPassengers, setNumericPassengers] = useState('');
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState(false);
  /** Matriz "Tocar para llenar": por punto, hora real ingresada y delta (para pintar fila amarillo/naranja). */
  const [matrixCaptured, setMatrixCaptured] = useState<
    Record<string, { actualTime: string; delta: number }>
  >({});
  const [matrixEditingPointId, setMatrixEditingPointId] = useState<string | null>(null);
  const [matrixActualTimeInput, setMatrixActualTimeInput] = useState('');
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const serviceDate = new Date().toISOString().split('T')[0];

  // Líneas dinámicas desde Firestore (colección lineas). Sin arrays estáticos ni datos de prueba.
  useEffect(() => {
    setLoadingLines(true);
    CartonService.getLineIds()
      .then(setLines)
      .catch(console.error)
      .finally(() => setLoadingLines(false));
  }, []);

  useEffect(() => {
    if (!selectedLineId) {
      setServices([]);
      setControlPoints([]);
      setSelectedServiceId('');
      setSelectedPoint(null);
      return;
    }
    setLoadingServices(true);
    setSelectedServiceId('');
    setSelectedPoint(null);
    CartonService.getAll(selectedLineId)
      .then((list: unknown[]) => {
        const svcs = (list || []) as Array<{
          id: string;
          linea: string;
          headers?: Array<{ id: string; location?: string }>;
          rawMatrix?: Array<{ checkpoints: string[] }>;
        }>;
        setServices(svcs);
      })
      .catch(console.error)
      .finally(() => setLoadingServices(false));
  }, [selectedLineId]);

  useEffect(() => {
    if (!selectedServiceId) {
      setControlPoints([]);
      setSelectedPoint(null);
      setMatrixCaptured({});
      setMatrixEditingPointId(null);
      return;
    }
    const svc = services.find((s) => s.id === selectedServiceId);
    if (!svc?.headers?.length || !svc.rawMatrix?.[0]?.checkpoints) {
      setControlPoints([]);
      setSelectedPoint(null);
      return;
    }
    const points: ControlPointOption[] = svc.headers
      .map((h, i) => ({
        id: h.id || `stop-${i}`,
        name: (h as { location?: string }).location || h.id || `Punto ${i + 1}`,
        scheduledTime: svc.rawMatrix![0].checkpoints[i] || '--:--',
      }))
      .filter((p) => p.scheduledTime && p.scheduledTime !== '--:--');
    setControlPoints(points);
    setSelectedPoint(null);
  }, [selectedServiceId, services]);

  const applyMatrixActualTime = (pointId: string, actualTime: string) => {
    const point = controlPoints.find((p) => p.id === pointId);
    if (!point || !/^\d{1,2}:\d{2}$/.test(actualTime.trim())) return;
    const [h, m] = actualTime.trim().split(':').map(Number);
    const [y, mo, d] = serviceDate.split('-').map(Number);
    const actualMs = new Date(y, mo - 1, d, h, m, 0, 0).getTime();
    const delta = computeTimeDeltaMinutes(point.scheduledTime, serviceDate, actualMs);
    setMatrixCaptured((prev) => ({ ...prev, [pointId]: { actualTime: actualTime.trim(), delta } }));
    setMatrixEditingPointId(null);
    setMatrixActualTimeInput('');
  };

  const handleMarcarPasada = () => {
    if (!selectedPoint || !selectedServiceId || !selectedLineId) return;
    const now = Date.now();
    const delta = computeTimeDeltaMinutes(selectedPoint.scheduledTime, serviceDate, now);
    setCapturedAt(now);
    setTimeDelta(delta);
    setPassengerLoad(null);
    setNumericPassengers('');
    setLastSaved(false);
  };

  const handleGuardar = async () => {
    if (
      !selectedPoint ||
      !selectedServiceId ||
      !selectedLineId ||
      capturedAt == null ||
      timeDelta == null
    )
      return;
    const load: number | PassengerLoadCategory =
      numericPassengers.trim() !== '' && !Number.isNaN(Number(numericPassengers))
        ? Number(numericPassengers)
        : (passengerLoad ?? 'MEDIO');
    if (typeof load !== 'number' && !['BAJO', 'MEDIO', 'ALTO'].includes(load)) return;

    setSaving(true);
    try {
      let photoUrl: string | undefined;
      if (photoFile) {
        const path = `inspections/${selectedServiceId}_${Date.now()}_${photoFile.name}`;
        const storageRef = ref(storage, path);
        await uploadBytes(storageRef, photoFile);
        photoUrl = await getDownloadURL(storageRef);
      }
      await InspectionService.create({
        cartonServiceId: selectedServiceId,
        lineId: selectedLineId,
        controlPointId: selectedPoint.id,
        serviceDate,
        scheduledTime: selectedPoint.scheduledTime,
        actualPassedAt: Timestamp.fromMillis(capturedAt),
        timeDeltaMinutes: timeDelta,
        passengerLoad: load,
        inspectorId: (user as { uid?: string })?.uid ?? undefined,
        ...(photoUrl && { photoUrl }),
      });
      setLastSaved(true);
      setCapturedAt(null);
      setTimeDelta(null);
      setPassengerLoad(null);
      setNumericPassengers('');
      setPhotoFile(null);
      setPhotoPreviewUrl(null);
    } catch (e) {
      console.error(e);
      alert('Error al guardar. Revisa conexión.');
    } finally {
      setSaving(false);
    }
  };

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });
      streamRef.current = stream;
      setCameraActive(true);
      if (videoRef.current) videoRef.current.srcObject = stream;
    } catch (e) {
      console.error(e);
      alert('No se pudo acceder a la cámara.');
    }
  };

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraActive(false);
    if (videoRef.current) videoRef.current.srcObject = null;
  };

  const captureFromCamera = () => {
    if (!videoRef.current) return;
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    canvas.getContext('2d')?.drawImage(videoRef.current, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const file = new File([blob], `capture_${Date.now()}.jpg`, { type: 'image/jpeg' });
        setPhotoFile(file);
        setPhotoPreviewUrl(URL.createObjectURL(file));
        stopCamera();
      },
      'image/jpeg',
      0.9,
    );
  };

  const onFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f && f.type.startsWith('image/')) {
      setPhotoFile(f);
      setPhotoPreviewUrl(URL.createObjectURL(f));
    }
    e.target.value = '';
  };

  useEffect(() => {
    if (!cameraActive || !videoRef.current || !streamRef.current) return;
    videoRef.current.srcObject = streamRef.current;
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [cameraActive]);

  useEffect(
    () => () => {
      if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl);
    },
    [photoPreviewUrl],
  );

  const canGuardar =
    capturedAt != null &&
    timeDelta != null &&
    (passengerLoad != null ||
      (numericPassengers.trim() !== '' && !Number.isNaN(Number(numericPassengers))));

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col pb-8 md:pb-12">
      <header className="sticky top-0 z-10 bg-slate-900 border-b border-slate-800 p-4">
        <h1 className="text-lg md:text-xl font-bold flex items-center gap-2">
          <CheckCircle className="text-emerald-500 w-6 h-6" />
          Captura Inspector
        </h1>
        <p className="text-slate-400 text-sm mt-1">
          Seleccione línea, servicio y punto de control. Luego Marcar Pasada.
        </p>
      </header>

      <main className="flex-1 p-4 md:p-6 space-y-6 max-w-lg mx-auto w-full">
        {/* Línea */}
        <section>
          <label className="block text-slate-400 text-sm font-medium mb-2">Línea</label>
          <select
            value={selectedLineId}
            onChange={(e) => setSelectedLineId(e.target.value)}
            disabled={loadingLines}
            className="w-full min-h-[44px] h-12 px-4 rounded-xl bg-slate-800 border border-slate-700 text-white text-base touch-manipulation md:w-full"
          >
            <option value="">Seleccionar línea</option>
            {lines.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </section>

        {/* Servicio / Cartón */}
        <section>
          <label className="block text-slate-400 text-sm font-medium mb-2">Servicio / Cartón</label>
          <select
            value={selectedServiceId}
            onChange={(e) => setSelectedServiceId(e.target.value)}
            disabled={loadingServices || !selectedLineId}
            className="w-full min-h-[44px] h-12 px-4 rounded-xl bg-slate-800 border border-slate-700 text-white text-base touch-manipulation md:w-full"
          >
            <option value="">Seleccionar servicio</option>
            {services.map((s) => {
              const serviceNumber =
                (s as { serviceNumber?: string }).serviceNumber ?? String(s.id).split('_')[0];
              const minuta = String(s.id).includes('_') ? String(s.id).split('_')[1] : 'HABILES';
              return (
                <option key={s.id} value={s.id}>
                  #{serviceNumber} ({minuta})
                </option>
              );
            })}
          </select>
        </section>

        {/* Punto de control — dropdown (tercer selector) según orden */}
        <section>
          <label className="block text-slate-400 text-sm font-medium mb-2">Punto de control</label>
          <select
            value={selectedPoint?.id ?? ''}
            onChange={(e) => {
              const id = e.target.value;
              const p = controlPoints.find((x) => x.id === id) ?? null;
              setSelectedPoint(p);
            }}
            disabled={!selectedServiceId || controlPoints.length === 0}
            className="w-full min-h-[44px] h-12 px-4 rounded-xl bg-slate-800 border border-slate-700 text-white text-base touch-manipulation md:w-full"
            aria-label="Seleccionar punto de control"
          >
            <option value="">
              {controlPoints.length === 0
                ? selectedServiceId
                  ? 'Sin puntos cargados (reingestar cartón)'
                  : 'Seleccionar servicio primero'
                : 'Seleccionar punto de control'}
            </option>
            {controlPoints.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} — {p.scheduledTime}
              </option>
            ))}
          </select>
          {controlPoints.length > 0 && (
            <p className="text-slate-500 text-xs mt-1">
              {controlPoints.length} punto(s) de control del cartón
            </p>
          )}
        </section>

        {/* Matriz "Tocar para llenar" – filas por punto, tap para ingresar hora real, delta pinta amarillo/naranja */}
        {controlPoints.length > 0 && (
          <section
            className="bg-slate-800/80 rounded-2xl border border-slate-700 p-4"
            data-testid="inspector-matrix-tocar-llenar"
          >
            <h3 className="text-slate-300 font-medium text-sm mb-3">Tocar para llenar</h3>
            <div className="space-y-2">
              {controlPoints.map((p) => {
                const captured = matrixCaptured[p.id];
                const isEditing = matrixEditingPointId === p.id;
                const delta = captured?.delta ?? null;
                const rowBg =
                  delta != null && delta > 0
                    ? 'bg-amber-500/20 border-amber-500/50'
                    : delta != null && delta < 0
                      ? 'bg-emerald-500/10 border-emerald-500/30'
                      : 'bg-slate-800/50 border-slate-700';
                return (
                  <div
                    key={p.id}
                    className={`rounded-xl border p-3 ${rowBg}`}
                    data-testid={`inspector-matrix-row-${p.id}`}
                    data-delta={delta != null ? String(delta) : undefined}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-white">{p.scheduledTime}</span>
                      <span className="text-slate-400 text-sm">{p.name}</span>
                      {captured && (
                        <span className="text-slate-300 text-sm">
                          Real: {captured.actualTime}
                          {delta != null && (
                            <span
                              className={
                                delta > 0
                                  ? 'text-amber-400'
                                  : delta < 0
                                    ? 'text-emerald-400'
                                    : 'text-slate-400'
                              }
                            >
                              {' '}
                              ({delta > 0 ? '+' : ''}
                              {delta} min)
                            </span>
                          )}
                        </span>
                      )}
                      {!isEditing ? (
                        <button
                          type="button"
                          onClick={() => {
                            setMatrixEditingPointId(p.id);
                            setMatrixActualTimeInput('');
                          }}
                          className="min-h-[36px] px-3 rounded-lg bg-primary-600 hover:bg-primary-500 text-white text-sm"
                        >
                          {captured ? 'Cambiar hora real' : 'Tocar para llenar'}
                        </button>
                      ) : (
                        <span className="flex items-center gap-2 flex-wrap">
                          <input
                            type="text"
                            placeholder="HH:mm"
                            value={matrixActualTimeInput}
                            onChange={(e) => setMatrixActualTimeInput(e.target.value)}
                            className="w-20 min-h-[36px] px-2 rounded-lg bg-slate-800 border border-slate-600 text-white font-mono"
                            data-testid="inspector-matrix-input-actual"
                          />
                          <button
                            type="button"
                            onClick={() => applyMatrixActualTime(p.id, matrixActualTimeInput)}
                            className="min-h-[36px] px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm"
                          >
                            Aplicar
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setMatrixEditingPointId(null);
                              setMatrixActualTimeInput('');
                            }}
                            className="min-h-[36px] px-3 rounded-lg bg-slate-600 text-white text-sm"
                          >
                            Cancelar
                          </button>
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Tarjeta hora teórica + Marcar Pasada */}
        {selectedPoint && (
          <section className="bg-slate-800/80 rounded-2xl border border-slate-700 p-6">
            <div className="flex items-center gap-2 text-slate-400 text-sm mb-2">
              <Clock className="w-4 h-4" />
              Hora teórica
            </div>
            <p className="text-3xl font-mono font-bold text-white mb-6">
              {selectedPoint.scheduledTime}
            </p>
            <button
              type="button"
              onClick={handleMarcarPasada}
              className="w-full min-h-[44px] h-14 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:scale-[0.98] font-bold text-lg text-white touch-manipulation md:w-full"
            >
              Marcar Pasada
            </button>
          </section>
        )}

        {/* Foto opcional (cámara o subir), vinculada a servicioId */}
        {selectedServiceId && (
          <section className="bg-slate-800/80 rounded-2xl border border-slate-700 p-4">
            <h3 className="text-slate-300 font-medium text-sm mb-3 flex items-center gap-2">
              <Camera className="w-4 h-4" />
              Foto (opcional) — Servicio #{selectedServiceId}
            </h3>
            {!cameraActive && !photoPreviewUrl && (
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={startCamera}
                  className="min-h-[44px] px-4 rounded-xl bg-slate-700 hover:bg-slate-600 text-white text-sm flex items-center gap-2"
                >
                  <Camera className="w-4 h-4" />
                  Abrir cámara
                </button>
                <label className="min-h-[44px] px-4 rounded-xl bg-slate-700 hover:bg-slate-600 text-white text-sm flex items-center gap-2 cursor-pointer">
                  <Upload className="w-4 h-4" />
                  Subir foto
                  <input type="file" accept="image/*" className="hidden" onChange={onFileSelect} />
                </label>
              </div>
            )}
            {cameraActive && (
              <div className="space-y-2">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full max-h-[240px] rounded-xl bg-black object-contain"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={captureFromCamera}
                    className="min-h-[44px] px-4 rounded-xl bg-emerald-600 text-white text-sm"
                  >
                    Tomar foto
                  </button>
                  <button
                    type="button"
                    onClick={stopCamera}
                    className="min-h-[44px] px-4 rounded-xl bg-slate-600 text-white text-sm"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            )}
            {photoPreviewUrl && !cameraActive && (
              <div className="flex items-start gap-3">
                <img
                  src={photoPreviewUrl}
                  alt="Vista previa"
                  className="w-24 h-24 object-cover rounded-xl border border-slate-600"
                />
                <button
                  type="button"
                  onClick={() => {
                    setPhotoFile(null);
                    setPhotoPreviewUrl(null);
                  }}
                  className="p-2 rounded-lg bg-slate-700 text-slate-400 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            )}
          </section>
        )}

        {/* Después de Marcar: delta + pasajeros + Guardar */}
        {capturedAt != null && timeDelta != null && (
          <section className="bg-slate-800/80 rounded-2xl border border-slate-700 p-6 space-y-6">
            <div>
              <p className="text-slate-400 text-sm mb-1">Diferencia (min)</p>
              <p
                className={`text-2xl font-mono font-bold ${timeDelta > 0 ? 'text-amber-400' : timeDelta < 0 ? 'text-emerald-400' : 'text-slate-300'}`}
              >
                {timeDelta > 0
                  ? `+${timeDelta} atraso`
                  : timeDelta < 0
                    ? `${timeDelta} adelanto`
                    : 'En hora'}
              </p>
            </div>

            <div>
              <p className="text-slate-400 text-sm font-medium mb-3 flex items-center gap-2">
                <Users className="w-4 h-4" />
                Carga de pasajeros
              </p>
              <div className="grid grid-cols-3 gap-3 md:flex md:flex-row md:gap-3 md:flex-wrap">
                {(['BAJO', 'MEDIO', 'ALTO'] as const).map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => {
                      setPassengerLoad(cat);
                      setNumericPassengers('');
                    }}
                    className={`min-h-[44px] h-14 w-full md:w-auto rounded-xl border-2 font-bold touch-manipulation transition-all ${
                      passengerLoad === cat
                        ? 'border-emerald-500 bg-emerald-500/20 text-white'
                        : 'border-slate-700 bg-slate-800 text-slate-300 hover:border-slate-600'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
              <p className="text-slate-500 text-xs mt-2 mb-1">O número exacto:</p>
              <input
                type="number"
                min={0}
                max={999}
                placeholder="Ej. 25"
                value={numericPassengers}
                onChange={(e) => setNumericPassengers(e.target.value)}
                className="w-full min-h-[44px] h-12 py-3 px-4 rounded-xl bg-slate-800 border border-slate-700 text-white text-base md:w-full"
              />
            </div>

            <button
              type="button"
              onClick={handleGuardar}
              disabled={!canGuardar || saving}
              className="w-full min-h-[44px] h-14 py-3 rounded-xl bg-primary-600 hover:bg-primary-500 disabled:opacity-50 font-bold text-lg text-white touch-manipulation flex items-center justify-center gap-2 md:w-full"
            >
              {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : null}
              {lastSaved ? 'Guardado' : 'Guardar'}
            </button>
          </section>
        )}
      </main>
    </div>
  );
};

export default InspectorCapture;
