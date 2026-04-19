/**
 * STMLayeredMap — Mapa STM embebido con overlay de inteligencia UCOT
 *
 * ARQUITECTURA DE CAPAS:
 * ┌─────────────────────────────────────────┐
 * │  CAPA 3: HUD Overlay (alertas, badges)  │  ← position: absolute, z-index alto
 * ├─────────────────────────────────────────┤
 * │  CAPA 2: Canvas de inteligencia         │  ← buses UCOT, rivales, zonas fricción
 * │          (pointer-events: none)         │
 * ├─────────────────────────────────────────┤
 * │  CAPA 1: iframe STM Montevideo          │  ← Mapa OpenLayers del STM
 * │          (recorridos reales, paradas)   │
 * └─────────────────────────────────────────┘
 *
 * La CAPA 1 siempre muestra los datos REALES actualizados por la IMM.
 * La CAPA 2 superpone nuestros datos de inteligencia (transparente).
 * La CAPA 3 muestra el HUD con métricas y alertas.
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Globe,
  Navigation,
  MapPin,
  Radio,
  Eye,
  EyeOff,
  Maximize2,
  Minimize2,
  RefreshCw,
  Layers,
  AlertTriangle,
  Clock,
  Shield,
  Crosshair,
  Activity,
} from 'lucide-react';

import { getLineaData, getLineVariants } from '../services/ucotLinesService';
import type { LineaUCOT } from '../types/lineasUcot';

// ─── INTERFACES ───────────────────────────────────────────────────────────────

interface LiveBus {
  id: string;
  linea: string;
  lat: number;
  lng: number;
  heading: number;
  empresa: string | number;
}

interface STMLayeredMapProps {
  /** Buses en tiempo real para mostrar en overlay */
  liveBuses: LiveBus[];
  /** Recorrido de la línea UCOT seleccionada (array de lat/lng) */
  ucotPath?: Array<{ lat: number; lng: number }>;
  /** Recorridos de las líneas rivales (múltiples rutas) */
  rivalPaths?: Array<{ lineId: string; color: string; path: Array<{ lat: number; lng: number }> }>;
  /** Línea seleccionada (para filtrar overlay) */
  selectedLineId?: string;
  /** Corredor activo */
  corridorLabel?: string;
  corridorTerminals?: string;
  /** Rivales del corredor */
  corridorRivals?: string[];
  /** Info de horario competitivo */
  scheduleInfo?: {
    ucotNextDep: string | null;
    rivalNextDep: string | null;
    ventajaMin: number;
    descripcion: string;
    enHoraPico: boolean;
  } | null;
  /** Threat level actual */
  threatLevel?: 'CRITICAL' | 'WARN' | 'SAFE';
  /** Recomendación IA */
  recommendation?: string;
}

// ─── INFO MAPA ABSTRACTO O DE FALLBACK ────────────────────────────────────

type STMMapMode = 'routes' | 'live';

const STM_URLS: Record<STMMapMode, { url: string; label: string; desc: string }> = {
  routes: {
    url: 'https://www.montevideo.gub.uy/app/stm/horarios/pages/mapa.xhtml',
    label: 'Recorridos',
    desc: 'Mapa de recorridos y paradas STM',
  },
  live: {
    url: 'https://www.montevideo.gub.uy/buses/mapaBuses.html',
    label: 'Buses Vivo',
    desc: 'Posiciones de buses en tiempo real',
  },
};

// ─── COMPONENTE PRINCIPAL ────────────────────────────────────────────────────

const STMLayeredMap: React.FC<STMLayeredMapProps> = ({
  liveBuses,
  ucotPath,
  rivalPaths,
  selectedLineId,
  corridorLabel,
  corridorTerminals,
  corridorRivals,
  scheduleInfo,
  threatLevel = 'SAFE',
  recommendation,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [overlayVisible, setOverlayVisible] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const [iframeError, setIframeError] = useState(false);
  const [showLabels, setShowLabels] = useState(true);
  const [mapMode, setMapMode] = useState<STMMapMode>('live');
  const [iframeKey, setIframeKey] = useState(0);

  // States to fetch internal paths if not provided
  const [internalUcotPath, setInternalUcotPath] = useState<Array<{
    lat: number;
    lng: number;
  }> | null>(null);
  const [internalRivalPaths, setInternalRivalPaths] = useState<Array<{
    lineId: string;
    color: string;
    path: Array<{ lat: number; lng: number }>;
  }> | null>(null);

  // Load internal UCOT path if not provided
  useEffect(() => {
    let mounted = true;
    if (ucotPath) return;
    if (selectedLineId) {
      queueMicrotask(() => {
        if (mounted) setInternalUcotPath(null);
      });
      const baseLine = selectedLineId.split(' ')[0];
      getLineVariants(baseLine)
        .then(({ ida }) => {
          if (mounted && ida?.recorrido) {
            setInternalUcotPath(ida.recorrido.filter((p) => p.lat !== 0 && p.lng !== 0));
          }
        })
        .catch((err) => console.error('Error loading UCOT bounds', err));
    } else {
      queueMicrotask(() => {
        if (mounted) setInternalUcotPath(null);
      });
    }
    return () => {
      mounted = false;
    };
  }, [selectedLineId, ucotPath]);

  // Load internal Rival paths if not provided
  useEffect(() => {
    let mounted = true;
    if (rivalPaths) return;
    if (corridorRivals && corridorRivals.length > 0) {
      queueMicrotask(() => {
        if (mounted) setInternalRivalPaths(null);
      });
      Promise.allSettled(corridorRivals.map((id) => getLineaData(id)))
        .then((results) => {
          if (!mounted) return;
          const loaded = results
            .map((r, i) =>
              r.status === 'fulfilled' ? { ...r.value, _id: corridorRivals[i] } : null,
            )
            .filter(
              (r): r is LineaUCOT & { _id: string } => r !== null && (r.recorrido?.length ?? 0) > 2,
            )
            .map((r) => ({
              lineId: r._id,
              color: '#ef4444',
              path: r.recorrido!.filter((p) => p.lat !== 0 && p.lng !== 0),
            }));
          setInternalRivalPaths(loaded);
        })
        .catch((err) => console.error('Error loading Rival bounds', err));
    } else {
      queueMicrotask(() => {
        if (mounted) setInternalRivalPaths(null);
      });
    }
    return () => {
      mounted = false;
    };
  }, [corridorRivals, rivalPaths]);

  const effectiveUcotPath = ucotPath || internalUcotPath;
  const effectiveRivalPaths = rivalPaths || internalRivalPaths;

  // ─── OVERLAY CANVAS: Dibuja buses y zonas de fricción ─────────────────────
  const drawOverlay = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container || !overlayVisible) return;

    const rect = container.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Centro de Montevideo para proyección simple
    const centerLat = -34.9011;
    const centerLng = -56.1645;
    const scale = Math.min(canvas.width, canvas.height) * 12; // ~12px por grado

    const toScreen = (lat: number, lng: number): [number, number] => {
      const x = canvas.width / 2 + (lng - centerLng) * scale;
      const y = canvas.height / 2 - (lat - centerLat) * scale;
      return [x, y];
    };

    // ═══════════════════════════════════════════════════════════
    // DIBUJAR RECORRIDOS (polylines de rutas)
    // ═══════════════════════════════════════════════════════════

    // Helper para dibujar un path como polyline
    const drawRoutePath = (
      path: Array<{ lat: number; lng: number }>,
      color: string,
      lineWidth: number,
      glowColor?: string,
      dashPattern?: number[],
      label?: string,
    ) => {
      if (path.length < 2) return;

      const screenPoints = path.map((p) => toScreen(p.lat, p.lng));

      // Glow effect
      if (glowColor) {
        ctx.beginPath();
        ctx.moveTo(screenPoints[0][0], screenPoints[0][1]);
        for (let i = 1; i < screenPoints.length; i++) {
          ctx.lineTo(screenPoints[i][0], screenPoints[i][1]);
        }
        ctx.strokeStyle = glowColor;
        ctx.lineWidth = lineWidth + 6;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.setLineDash([]);
        ctx.stroke();
      }

      // Main line
      ctx.beginPath();
      ctx.moveTo(screenPoints[0][0], screenPoints[0][1]);
      for (let i = 1; i < screenPoints.length; i++) {
        ctx.lineTo(screenPoints[i][0], screenPoints[i][1]);
      }
      ctx.strokeStyle = color;
      ctx.lineWidth = lineWidth;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      if (dashPattern) {
        ctx.setLineDash(dashPattern);
      } else {
        ctx.setLineDash([]);
      }
      ctx.stroke();
      ctx.setLineDash([]);

      // Start/End markers
      if (screenPoints.length > 0) {
        // Start point (circle)
        const [sx, sy] = screenPoints[0];
        ctx.beginPath();
        ctx.arc(sx, sy, 5, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // End point (diamond)
        const [ex, ey] = screenPoints[screenPoints.length - 1];
        ctx.beginPath();
        ctx.moveTo(ex, ey - 6);
        ctx.lineTo(ex + 6, ey);
        ctx.lineTo(ex, ey + 6);
        ctx.lineTo(ex - 6, ey);
        ctx.closePath();
        ctx.fillStyle = color;
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      // Label at midpoint
      if (label && screenPoints.length > 2) {
        const midIdx = Math.floor(screenPoints.length / 2);
        const [mx, my] = screenPoints[midIdx];
        ctx.font = 'bold 10px monospace';
        ctx.textAlign = 'center';
        // Background pill
        const metrics = ctx.measureText(label);
        const pw = metrics.width + 8;
        const ph = 14;
        ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
        ctx.beginPath();
        ctx.roundRect(mx - pw / 2, my - ph - 4, pw, ph, 4);
        ctx.fill();
        ctx.fillStyle = color;
        ctx.fillText(label, mx, my - 6);
      }
    };

    // Dibujar rutas rivales PRIMERO (debajo)
    if (effectiveRivalPaths && effectiveRivalPaths.length > 0) {
      effectiveRivalPaths.forEach((rival) => {
        drawRoutePath(rival.path, rival.color || '#ef4444', 2, undefined, [6, 4], rival.lineId);
      });
    }

    // Dibujar ruta UCOT ENCIMA (con glow)
    if (effectiveUcotPath && effectiveUcotPath.length > 1) {
      drawRoutePath(
        effectiveUcotPath,
        '#06b6d4',
        3.5,
        'rgba(6, 182, 212, 0.25)',
        undefined,
        selectedLineId ? `UCOT ${selectedLineId}` : 'UCOT',
      );
    }

    // Si no hay buses ni rutas, no seguir dibujando
    if (liveBuses.length === 0 && !ucotPath && !rivalPaths) return;

    // Dibujar buses
    liveBuses.forEach((bus) => {
      if (bus.lat === 0 && bus.lng === 0) return;

      const [x, y] = toScreen(bus.lat, bus.lng);

      // Fuera de pantalla?
      if (x < -20 || x > canvas.width + 20 || y < -20 || y > canvas.height + 20) return;

      const isUCOT = bus.empresa === 'UCOT' || bus.empresa === 2 || bus.id?.includes('sim-ucot');

      // Glow effect
      const gradient = ctx.createRadialGradient(x, y, 0, x, y, isUCOT ? 18 : 14);
      if (isUCOT) {
        gradient.addColorStop(0, 'rgba(6, 182, 212, 0.9)');
        gradient.addColorStop(0.5, 'rgba(6, 182, 212, 0.3)');
        gradient.addColorStop(1, 'rgba(6, 182, 212, 0)');
      } else {
        gradient.addColorStop(0, 'rgba(239, 68, 68, 0.9)');
        gradient.addColorStop(0.5, 'rgba(239, 68, 68, 0.3)');
        gradient.addColorStop(1, 'rgba(239, 68, 68, 0)');
      }
      ctx.beginPath();
      ctx.arc(x, y, isUCOT ? 18 : 14, 0, Math.PI * 2);
      ctx.fillStyle = gradient;
      ctx.fill();

      // Bus dot
      ctx.beginPath();
      ctx.arc(x, y, isUCOT ? 6 : 5, 0, Math.PI * 2);
      ctx.fillStyle = isUCOT ? '#06b6d4' : 'rgba(239, 68, 68, 0.3)'; // Lighter fill to contrast the dashed border
      ctx.fill();
      ctx.strokeStyle = isUCOT ? '#0e7490' : '#ef4444';
      ctx.lineWidth = 2;
      if (!isUCOT) {
        ctx.setLineDash([3, 2]); // Linea punteada/dash para competidores
      }
      ctx.stroke();
      ctx.setLineDash([]);

      // Heading arrow
      if (bus.heading > 0) {
        const angle = (bus.heading - 90) * (Math.PI / 180);
        const arrowLen = isUCOT ? 14 : 11;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + Math.cos(angle) * arrowLen, y + Math.sin(angle) * arrowLen);
        ctx.strokeStyle = isUCOT ? '#22d3ee' : '#f87171';
        ctx.lineWidth = 2;
        if (!isUCOT) {
          ctx.setLineDash([2, 2]); // Linea punteada para dirección del competidor
        }
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Label
      if (showLabels) {
        const cleanLine = bus.linea?.toString().replace(/[ab]$/i, '') || '?';
        ctx.font = 'bold 9px monospace';
        ctx.textAlign = 'center';
        ctx.fillStyle = isUCOT ? '#cffafe' : '#fecaca';
        ctx.fillText(cleanLine, x, y - 12);

        if (isUCOT) {
          ctx.font = 'bold 7px monospace';
          ctx.fillStyle = '#67e8f9';
          ctx.fillText('UCOT', x, y + 20);
        }
      }
    });

    // Friction zones (where UCOT and rival buses are close)
    const ucotBuses = liveBuses.filter(
      (b) => b.empresa === 'UCOT' || b.empresa === 2 || b.id?.includes('sim-ucot'),
    );
    const rivalBuses = liveBuses.filter(
      (b) => b.empresa !== 'UCOT' && b.empresa !== 2 && !b.id?.includes('sim-ucot'),
    );

    ucotBuses.forEach((ucot) => {
      rivalBuses.forEach((rival) => {
        const dist = Math.sqrt(
          Math.pow((ucot.lat - rival.lat) * 111000, 2) +
            Math.pow((ucot.lng - rival.lng) * 85000, 2),
        );
        if (dist < 500) {
          // 500m = zona de fricción
          const [x1, y1] = toScreen(ucot.lat, ucot.lng);
          const [x2, y2] = toScreen(rival.lat, rival.lng);
          const mx = (x1 + x2) / 2;
          const my = (y1 + y2) / 2;

          // Pulsing zone
          const pulseRadius = 25 + Math.sin(Date.now() / 300) * 8;
          const zoneGrad = ctx.createRadialGradient(mx, my, 0, mx, my, pulseRadius);
          zoneGrad.addColorStop(0, 'rgba(168, 85, 247, 0.4)');
          zoneGrad.addColorStop(1, 'rgba(168, 85, 247, 0)');
          ctx.beginPath();
          ctx.arc(mx, my, pulseRadius, 0, Math.PI * 2);
          ctx.fillStyle = zoneGrad;
          ctx.fill();

          if (showLabels) {
            ctx.font = 'bold 8px monospace';
            ctx.fillStyle = '#c084fc';
            ctx.textAlign = 'center';
            ctx.fillText(`⚡ ${Math.round(dist)}m`, mx, my - pulseRadius - 4);
          }
        }
      });
    });
  }, [
    liveBuses,
    overlayVisible,
    showLabels,
    ucotPath,
    rivalPaths,
    selectedLineId,
    effectiveUcotPath,
    effectiveRivalPaths,
  ]);

  // Redibujar overlay en cada frame cuando hay buses
  useEffect(() => {
    if (!overlayVisible || liveBuses.length === 0) return;

    let animFrame: number;
    const loop = () => {
      drawOverlay();
      animFrame = requestAnimationFrame(loop);
    };
    animFrame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animFrame);
  }, [drawOverlay, overlayVisible, liveBuses]);

  // Resize observer
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(() => drawOverlay());
    observer.observe(container);
    return () => observer.disconnect();
  }, [drawOverlay]);

  // Threat colors
  const threatBgClass =
    threatLevel === 'CRITICAL'
      ? 'bg-red-500'
      : threatLevel === 'WARN'
        ? 'bg-amber-500'
        : 'bg-green-500';
  const threatTextClass =
    threatLevel === 'CRITICAL'
      ? 'text-red-500'
      : threatLevel === 'WARN'
        ? 'text-amber-500'
        : 'text-green-500';

  return (
    <div
      ref={containerRef}
      className={`stm-layered-map relative overflow-hidden bg-slate-950 ${
        expanded ? 'fixed inset-0 z-[9999]' : 'h-full w-full'
      }`}
    >
      {/* ══════════════════════════════════════════════════════════════════
          CAPA 1: iframe STM — Mapa base real de Montevideo
          ══════════════════════════════════════════════════════════════════ */}
      <iframe
        key={`${iframeKey}-${mapMode}`}
        src={STM_URLS[mapMode].url}
        title={`STM Montevideo - ${STM_URLS[mapMode].label}`}
        className={`absolute inset-0 w-full h-full border-0 transition-opacity duration-700 ${
          iframeLoaded ? 'opacity-100' : 'opacity-0'
        }`}
        onLoad={() => {
          setIframeLoaded(true);
          setIframeError(false);
        }}
        onError={() => setIframeError(true)}
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
        referrerPolicy="no-referrer"
        loading="eager"
      />

      {/* Loading state */}
      {!iframeLoaded && !iframeError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950 z-10">
          <div className="relative">
            <Globe
              className="h-12 w-12 text-cyan-500 animate-spin"
              style={{ animationDuration: '3s' }}
            />
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="h-4 w-4 rounded-full bg-cyan-500 animate-pulse" />
            </div>
          </div>
          <span className="mt-4 text-[10px] font-black text-cyan-400 tracking-[0.3em] uppercase animate-pulse">
            Cargando Mapa STM Montevideo...
          </span>
          <span className="mt-1 text-[8px] text-slate-600 font-mono">
            Conectando con montevideo.gub.uy
          </span>
        </div>
      )}

      {/* Error state */}
      {iframeError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950 z-10">
          <AlertTriangle className="h-10 w-10 text-amber-500 mb-3" />
          <span className="text-[10px] font-black text-amber-400 tracking-widest uppercase">
            Error al cargar mapa STM
          </span>
          <button
            onClick={() => {
              setIframeKey((k) => k + 1);
              setIframeError(false);
              setIframeLoaded(false);
            }}
            className="mt-3 px-4 py-1.5 bg-amber-600/20 border border-amber-500/30 rounded text-[9px] font-bold text-amber-300 hover:bg-amber-600/30 transition-all"
          >
            <RefreshCw className="h-3 w-3 inline mr-1" /> Reintentar
          </button>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          CAPA 2: Canvas overlay — Inteligencia UCOT
          ══════════════════════════════════════════════════════════════════ */}
      {overlayVisible && (
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full z-20 pointer-events-none mix-blend-screen"
        />
      )}

      {/* ══════════════════════════════════════════════════════════════════
          CAPA 3: HUD Overlay — Métricas, alertas, controles
          ══════════════════════════════════════════════════════════════════ */}

      {/* █ TOP-LEFT: Corridor Info Badge */}
      {corridorLabel && (
        <div className="absolute top-3 left-3 z-30 max-w-[280px]">
          <div className="rounded-xl border border-cyan-500/20 bg-slate-950/90 backdrop-blur-md p-3 shadow-2xl">
            <div className="flex items-center gap-2 mb-1">
              <Navigation className="h-4 w-4 text-cyan-400" />
              <span className="text-[10px] font-black text-cyan-400 tracking-widest uppercase">
                {corridorLabel}
              </span>
            </div>
            {corridorTerminals && (
              <div className="text-[8px] text-slate-500 font-mono mb-1">{corridorTerminals}</div>
            )}
            {corridorRivals && corridorRivals.length > 0 && (
              <div className="text-[8px] text-red-400 font-bold">
                <Shield className="h-3 w-3 inline mr-1 text-red-500" />
                vs {corridorRivals.join(' · ')}
              </div>
            )}
            {scheduleInfo && (
              <div
                className={`text-[9px] font-black mt-1 px-2 py-0.5 rounded ${
                  scheduleInfo.ventajaMin > 0
                    ? 'bg-emerald-500/10 text-emerald-400'
                    : scheduleInfo.ventajaMin < 0
                      ? 'bg-red-500/10 text-red-400'
                      : 'bg-slate-800 text-slate-400'
                }`}
              >
                <Clock className="h-3 w-3 inline mr-1" />
                UCOT {scheduleInfo.ucotNextDep || '--:--'} vs Rival{' '}
                {scheduleInfo.rivalNextDep || '--:--'}
                <span className="ml-1">
                  ({scheduleInfo.ventajaMin > 0 ? '+' : ''}
                  {scheduleInfo.ventajaMin}min)
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* █ TOP-CENTER: Threat Status */}
      {selectedLineId && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30">
          <div
            className={`flex items-center gap-2 px-4 py-1.5 rounded-full border shadow-lg ${
              threatLevel === 'CRITICAL'
                ? 'bg-red-950/90 border-red-500/30 animate-pulse'
                : threatLevel === 'WARN'
                  ? 'bg-amber-950/90 border-amber-500/30'
                  : 'bg-emerald-950/90 border-emerald-500/30'
            }`}
          >
            <div className={`h-2 w-2 rounded-full animate-pulse ${threatBgClass}`} />
            <span className={`text-[9px] font-black tracking-widest uppercase ${threatTextClass}`}>
              {threatLevel === 'CRITICAL'
                ? '🔴 AMENAZA CRÍTICA'
                : threatLevel === 'WARN'
                  ? '🟡 ALERTA ACTIVA'
                  : '🟢 CORREDOR SEGURO'}
            </span>
          </div>
        </div>
      )}

      {/* █ TOP-RIGHT: Controls */}
      <div className="absolute top-3 right-3 z-30 flex flex-col gap-1.5">
        {/* Toggle overlay */}
        <button
          onClick={() => setOverlayVisible((v) => !v)}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border backdrop-blur-md shadow-lg text-[8px] font-black uppercase tracking-wider transition-all ${
            overlayVisible
              ? 'bg-cyan-500/10 border-cyan-500/20 text-cyan-400 hover:bg-cyan-500/20'
              : 'bg-slate-900/80 border-white/10 text-slate-500 hover:bg-slate-800/80'
          }`}
          title={overlayVisible ? 'Ocultar overlay UCOT' : 'Mostrar overlay UCOT'}
        >
          {overlayVisible ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
          <span>Intel</span>
        </button>

        {/* Toggle labels */}
        <button
          onClick={() => setShowLabels((l) => !l)}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border backdrop-blur-md shadow-lg text-[8px] font-black uppercase tracking-wider transition-all ${
            showLabels
              ? 'bg-purple-500/10 border-purple-500/20 text-purple-400 hover:bg-purple-500/20'
              : 'bg-slate-900/80 border-white/10 text-slate-500 hover:bg-slate-800/80'
          }`}
        >
          <Crosshair className="h-3 w-3" />
          <span>Tags</span>
        </button>

        {/* Expand */}
        <button
          onClick={() => setExpanded((e) => !e)}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border bg-slate-900/80 border-white/10 text-slate-500 backdrop-blur-md shadow-lg text-[8px] font-black uppercase tracking-wider hover:bg-slate-800/80 transition-all"
        >
          {expanded ? <Minimize2 className="h-3 w-3" /> : <Maximize2 className="h-3 w-3" />}
          <span>{expanded ? 'Min' : 'Max'}</span>
        </button>

        {/* Toggle map mode: Routes vs Live */}
        <button
          onClick={() => {
            const next = mapMode === 'live' ? 'routes' : 'live';
            setMapMode(next);
            setIframeLoaded(false);
          }}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border backdrop-blur-md shadow-lg text-[8px] font-black uppercase tracking-wider transition-all ${
            mapMode === 'live'
              ? 'bg-green-500/10 border-green-500/20 text-green-400 hover:bg-green-500/20'
              : 'bg-blue-500/10 border-blue-500/20 text-blue-400 hover:bg-blue-500/20'
          }`}
          title={`Cambiar a: ${STM_URLS[mapMode === 'live' ? 'routes' : 'live'].desc}`}
        >
          <Activity className="h-3 w-3" />
          <span>{mapMode === 'live' ? '🔴 VIVO' : '🗺️ RUTAS'}</span>
        </button>

        {/* Reload iframe */}
        <button
          onClick={() => {
            setIframeKey((k) => k + 1);
            setIframeLoaded(false);
          }}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border bg-slate-900/80 border-white/10 text-slate-500 backdrop-blur-md shadow-lg text-[8px] font-black uppercase tracking-wider hover:bg-slate-800/80 transition-all"
          title="Recargar mapa STM"
        >
          <RefreshCw className="h-3 w-3" />
        </button>
      </div>

      {/* █ BOTTOM-LEFT: Recommendation Badge */}
      {recommendation && selectedLineId && (
        <div className="absolute bottom-14 left-3 z-30">
          <div
            className={`px-3 py-1.5 rounded-lg border shadow-lg text-[10px] font-black ${
              recommendation === 'DELAY'
                ? 'bg-red-600 text-white border-red-400 animate-pulse'
                : recommendation === 'SPEED_UP'
                  ? 'bg-emerald-600 text-white border-emerald-400'
                  : 'bg-slate-800 text-slate-400 border-white/10'
            }`}
          >
            {recommendation === 'DELAY' && '🛑 FRENAR — Rival adelante'}
            {recommendation === 'SPEED_UP' && '🚀 ACELERAR — Ventana libre'}
            {recommendation === 'HOLD' && '⏸ MANTENER — Sin conflicto'}
            {!['DELAY', 'SPEED_UP', 'HOLD'].includes(recommendation) && `→ ${recommendation}`}
          </div>
        </div>
      )}

      {/* █ BOTTOM: Status Bar */}
      <div className="absolute bottom-0 left-0 right-0 z-30 flex items-center justify-between px-3 py-1.5 bg-slate-950/90 backdrop-blur-md border-t border-white/5">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <Layers className="h-3 w-3 text-cyan-500" />
            <span className="text-[7px] font-black text-cyan-500 uppercase tracking-widest">
              STM Live + UCOT Intel
            </span>
          </div>
          <div className="h-2 w-px bg-white/10" />
          <div className="flex items-center gap-1">
            <Radio className="h-2.5 w-2.5 text-green-500 animate-pulse" />
            <span className="text-[7px] font-bold text-slate-500">
              {liveBuses.length} units tracked
            </span>
          </div>
          {selectedLineId && (
            <>
              <div className="h-2 w-px bg-white/10" />
              <span className="text-[7px] font-bold text-primary-400">
                <MapPin className="h-2.5 w-2.5 inline mr-0.5" />L{selectedLineId}
              </span>
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[7px] font-black text-slate-700 italic">
            STM © montevideo.gub.uy
          </span>
          <div className="h-2 w-px bg-white/10" />
          <span className="text-[7px] font-black text-slate-600 tracking-widest">
            CORRIDOR COMMAND v6.0
          </span>
        </div>
      </div>

      {/* █ LEGEND (bottom-right) */}
      <div className="absolute bottom-10 right-3 z-30 rounded-lg border border-white/10 bg-slate-950/85 p-2 backdrop-blur-md shadow-2xl">
        <div className="flex flex-col gap-1.5">
          <div className="text-[7px] font-black text-slate-500 uppercase tracking-widest mb-0.5 flex items-center gap-1">
            <Layers className="h-2.5 w-2.5" /> Capas
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-1.5 w-4 rounded-full bg-cyan-500 shadow-[0_0_5px_#06b6d4]" />
            <span className="text-[7px] font-bold text-slate-400">UCOT Patrol</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-1.5 w-4 rounded-full bg-red-500 shadow-[0_0_5px_#ef4444]" />
            <span className="text-[7px] font-bold text-slate-400">Rival Bus</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-1.5 w-4 rounded-full bg-purple-500 shadow-[0_0_5px_#a855f7]" />
            <span className="text-[7px] font-bold text-slate-400">Zona Fricción</span>
          </div>
          <div className="h-px bg-white/5" />
          <div className="flex items-center gap-1.5">
            <Globe className="h-3 w-3 text-blue-400" />
            <span className="text-[7px] font-bold text-slate-400">Base: Mapa STM</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default STMLayeredMap;
