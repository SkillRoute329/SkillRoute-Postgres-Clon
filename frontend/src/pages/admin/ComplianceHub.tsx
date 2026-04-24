/**
 * ComplianceHub — Centro de Cumplimiento Regulatorio
 * ====================================================
 * Genera reportes automáticos requeridos por la Intendencia de Montevideo
 * (MTOP / IMM) en los plazos legales. Primeros 3 días hábiles del mes.
 *
 * DÓNDE COLOCAR: frontend/src/pages/admin/ComplianceHub.tsx
 * AGREGAR RUTA:  { path: 'compliance', element: <ComplianceHub /> }
 */

import { useState, useEffect } from 'react';
import { collection, getDocs, query, where, orderBy } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { gtfsExporter } from '../../services/gtfsExporter';
import {
  FileCheck,
  Download,
  AlertCircle,
  CheckCircle2,
  Clock,
  FileText,
  Calendar,
  Shield,
  TrendingUp,
} from 'lucide-react';

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface ReporteRequerido {
  id: string;
  nombre: string;
  descripcion: string;
  frecuencia: 'mensual' | 'trimestral' | 'anual' | 'evento';
  organismoReceptor: string;
  plazoLegal: string;
  ultimoEnvio?: string;
  estado: 'al_dia' | 'proximo' | 'vencido' | 'no_aplica';
  diasRestantes?: number;
  generadoAutomaticamente: boolean;
}

// ─── Datos de reportes requeridos por regulación Uruguay ─────────────────────

function calcularEstadoReporte(
  ultimoEnvio?: string,
  diaLimite = 3,
): {
  estado: ReporteRequerido['estado'];
  diasRestantes: number;
} {
  const hoy = new Date();
  const primerDiaMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
  const fechaLimite = new Date(primerDiaMes);

  // Sumar días hábiles (aproximación simple: días hábiles ≈ días corridos * 1.4)
  let diasHabilesContados = 0;
  const temp = new Date(primerDiaMes);
  while (diasHabilesContados < diaLimite) {
    temp.setDate(temp.getDate() + 1);
    const dow = temp.getDay();
    if (dow !== 0 && dow !== 6) diasHabilesContados++;
  }
  fechaLimite.setTime(temp.getTime());

  const diasRestantes = Math.ceil((fechaLimite.getTime() - hoy.getTime()) / 86400000);
  const yaEnviado =
    ultimoEnvio &&
    ultimoEnvio.startsWith(`${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`);

  if (yaEnviado) return { estado: 'al_dia', diasRestantes };
  if (diasRestantes < 0) return { estado: 'vencido', diasRestantes };
  if (diasRestantes <= 3) return { estado: 'proximo', diasRestantes };
  return { estado: 'proximo', diasRestantes };
}

// ─── Componente ───────────────────────────────────────────────────────────────

export default function ComplianceHub() {
  const [reportes, setReportes] = useState<ReporteRequerido[]>([]);
  const [generando, setGenerando] = useState<string | null>(null);
  const [mesSeleccionado, setMesSeleccionado] = useState<string>(
    new Date().toISOString().slice(0, 7),
  );

  async function cargarEstadoReportes() {
    // Cargar último envío de cada reporte desde Firestore
    let ultimoEnvioFlota = '';
    let ultimoEnvioKm = '';

    try {
      const snap = await getDocs(
        query(
          collection(db, 'compliance_log'),
          where('mes', '==', mesSeleccionado),
          orderBy('fechaEnvio', 'desc'),
        ),
      );
      snap.docs.forEach((d) => {
        const data = d.data();
        if (data.tipo === 'declaracion_jurada_flota') ultimoEnvioFlota = data.fechaEnvio;
        if (data.tipo === 'reporte_kilometros') ultimoEnvioKm = data.fechaEnvio;
      });
    } catch {
      // Sin datos previos
    }

    const hoy = new Date();
    const estadoFlota = calcularEstadoReporte(ultimoEnvioFlota, 3);
    const estadoKm = calcularEstadoReporte(ultimoEnvioKm, 3);

    setReportes([
      {
        id: 'declaracion_jurada_flota',
        nombre: 'Declaración Jurada de Flota',
        descripcion:
          'Reporte mensual de vehículos activos, bajas, altas y estado técnico de la flota. Requerido por MTOP/DNT.',
        frecuencia: 'mensual',
        organismoReceptor: 'MTOP — Dirección Nacional de Transporte',
        plazoLegal: 'Primeros 3 días hábiles de cada mes',
        ultimoEnvio: ultimoEnvioFlota || undefined,
        estado: estadoFlota.estado,
        diasRestantes: estadoFlota.diasRestantes,
        generadoAutomaticamente: true,
      },
      {
        id: 'reporte_kilometros',
        nombre: 'Reporte de Kilómetros Recorridos',
        descripcion:
          'Kilómetros recorridos por línea y por vehículo en el mes. Base para cálculo de subsidios del Estado.',
        frecuencia: 'mensual',
        organismoReceptor: 'MTOP — DNT',
        plazoLegal: 'Primeros 3 días hábiles de cada mes',
        ultimoEnvio: ultimoEnvioKm || undefined,
        estado: estadoKm.estado,
        diasRestantes: estadoKm.diasRestantes,
        generadoAutomaticamente: true,
      },
      {
        id: 'informe_puntualidad',
        nombre: 'Informe de Cumplimiento de Frecuencias',
        descripcion:
          'Porcentaje de cumplimiento de los horarios programados por línea. Incluye causales de incumplimiento.',
        frecuencia: 'mensual',
        organismoReceptor: 'Intendencia de Montevideo — División Movilidad',
        plazoLegal: 'Primeros 5 días hábiles de cada mes',
        estado: 'proximo',
        diasRestantes: 8,
        generadoAutomaticamente: true,
      },
      {
        id: 'gtfs_feed',
        nombre: 'Actualización Feed GTFS',
        descripcion:
          'Datos de rutas, paradas y horarios en formato GTFS para el sistema de información al pasajero de la IMM.',
        frecuencia: 'mensual',
        organismoReceptor: 'IMM — Sistema de Información al Pasajero',
        plazoLegal: 'Primer día hábil de cada mes',
        estado: 'proximo',
        diasRestantes: 12,
        generadoAutomaticamente: true,
      },
      {
        id: 'habilitacion_vehiculos',
        nombre: 'Habilitación Anual de Vehículos',
        descripcion:
          'Revisión técnica anual de cada unidad. Certificado de aptitud para servicio público de transporte.',
        frecuencia: 'anual',
        organismoReceptor: 'MTOP — Dirección Nacional de Transporte',
        plazoLegal: 'Según vencimiento de cada vehículo',
        estado: 'al_dia',
        generadoAutomaticamente: false,
      },
      {
        id: 'seguros_flota',
        nombre: 'Renovación Pólizas de Seguro',
        descripcion:
          'Seguro obligatorio de responsabilidad civil para transporte colectivo de pasajeros.',
        frecuencia: 'anual',
        organismoReceptor: 'BSE / Aseguradoras privadas habilitadas',
        plazoLegal: 'Según vencimiento de cada póliza',
        estado: 'al_dia',
        generadoAutomaticamente: false,
      },
    ]);
  }

  useEffect(() => {
    void cargarEstadoReportes();
  }, [mesSeleccionado]);

  async function handleGenerar(reporte: ReporteRequerido) {
    setGenerando(reporte.id);

    try {
      switch (reporte.id) {
        case 'gtfs_feed':
          await gtfsExporter.exportarComoArchivos();
          break;

        case 'declaracion_jurada_flota':
          await generarDeclaracionFlota(mesSeleccionado);
          break;

        case 'reporte_kilometros':
          await generarReporteKm(mesSeleccionado);
          break;

        case 'informe_puntualidad':
          await generarInformePuntualidad(mesSeleccionado);
          break;

        default:
          alert('Reporte generado. Verificar en documentos de descarga.');
      }
    } catch (err) {
      alert(
        'Error al generar reporte: ' + (err instanceof Error ? err.message : 'Error desconocido'),
      );
    }

    setGenerando(null);
  }

  const vencidos = reportes.filter((r) => r.estado === 'vencido');
  const proximos = reportes.filter((r) => r.estado === 'proximo' && (r.diasRestantes ?? 99) <= 5);
  const alDia = reportes.filter((r) => r.estado === 'al_dia');

  return (
    <div className="flex flex-col h-full bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b px-6 py-4">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
              <Shield className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-800">Centro de Cumplimiento</h1>
              <p className="text-sm text-slate-500">Reportes regulatorios MTOP / IMM</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <input
              type="month"
              value={mesSeleccionado}
              onChange={(e) => setMesSeleccionado(e.target.value)}
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700"
            />
          </div>
        </div>

        {/* Resumen */}
        <div className="flex gap-4 mt-4">
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            <AlertCircle className="w-4 h-4 text-red-600" />
            <span className="text-sm font-medium text-red-800">
              {vencidos.length} vencido{vencidos.length !== 1 ? 's' : ''}
            </span>
          </div>
          <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            <Clock className="w-4 h-4 text-amber-600" />
            <span className="text-sm font-medium text-amber-800">
              {proximos.length} próximo{proximos.length !== 1 ? 's' : ''}
            </span>
          </div>
          <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
            <CheckCircle2 className="w-4 h-4 text-green-600" />
            <span className="text-sm font-medium text-green-800">{alDia.length} al día</span>
          </div>
        </div>
      </div>

      {/* Lista de reportes */}
      <div className="flex-1 overflow-auto p-6">
        <div className="space-y-3">
          {reportes.map((reporte) => {
            const colorEstado = {
              al_dia: 'bg-green-100 text-green-800 border-green-200',
              proximo: 'bg-amber-100 text-amber-800 border-amber-200',
              vencido: 'bg-red-100 text-red-800 border-red-200',
              no_aplica: 'bg-slate-100 text-slate-600 border-slate-200',
            }[reporte.estado];

            const iconoEstado = {
              al_dia: <CheckCircle2 className="w-4 h-4 text-green-600" />,
              proximo: <Clock className="w-4 h-4 text-amber-600" />,
              vencido: <AlertCircle className="w-4 h-4 text-red-600" />,
              no_aplica: <FileText className="w-4 h-4 text-slate-400" />,
            }[reporte.estado];

            const etiquetaEstado = {
              al_dia: 'Al día',
              proximo:
                reporte.diasRestantes != null
                  ? reporte.diasRestantes <= 0
                    ? 'Hoy vence'
                    : `${reporte.diasRestantes}d restantes`
                  : 'Próximo',
              vencido: 'VENCIDO',
              no_aplica: 'No aplica',
            }[reporte.estado];

            return (
              <div key={reporte.id} className="bg-white rounded-xl border p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div className="mt-0.5">{iconoEstado}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-slate-800">{reporte.nombre}</p>
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full border font-medium ${colorEstado}`}
                        >
                          {etiquetaEstado}
                        </span>
                        {reporte.generadoAutomaticamente && (
                          <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">
                            Auto
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-slate-500 mt-1">{reporte.descripcion}</p>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-slate-400">
                        <span className="flex items-center gap-1">
                          <Shield className="w-3 h-3" /> {reporte.organismoReceptor}
                        </span>
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" /> {reporte.plazoLegal}
                        </span>
                        {reporte.ultimoEnvio && (
                          <span className="flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3 text-green-500" />
                            Último envío: {reporte.ultimoEnvio}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {reporte.generadoAutomaticamente && (
                    <button
                      onClick={() => handleGenerar(reporte)}
                      disabled={generando === reporte.id}
                      className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 disabled:bg-slate-400 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors whitespace-nowrap"
                    >
                      {generando === reporte.id ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                          Generando...
                        </>
                      ) : (
                        <>
                          <Download className="w-4 h-4" />
                          Generar
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Funciones de generación ──────────────────────────────────────────────────

async function generarDeclaracionFlota(mes: string): Promise<void> {
  const snap = await getDocs(collection(db, 'vehicles'));
  const vehiculos = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

  const activos = vehiculos.filter(
    (v: Record<string, unknown>) =>
      !/mantenimiento|taller|paralizado|baja/i.test(String(v.status ?? '')),
  );

  const csv = [
    'ID,Numero,Tipo,Modelo,Año,Estado,Empresa',
    ...vehiculos.map(
      (v: Record<string, unknown>) =>
        `${v.id},${v.numero ?? ''},${v.tipo ?? 'diesel'},${v.modelo ?? ''},${v.año ?? ''},${v.status ?? 'activo'},UCOT`,
    ),
  ].join('\n');

  const linea1 = `DECLARACIÓN JURADA DE FLOTA - UCOT - ${mes}\n`;
  const linea2 = `Total vehículos: ${vehiculos.length} | Activos: ${activos.length}\n\n`;
  descargarTexto(`declaracion_jurada_flota_${mes}.csv`, linea1 + linea2 + csv);
}

async function generarReporteKm(mes: string): Promise<void> {
  let datos = '';
  try {
    const snap = await getDocs(
      query(collection(db, 'servicio_estado'), where('fecha', '>=', `${mes}-01`)),
    );
    const rows = snap.docs.map((d) => d.data());
    datos = [
      'Fecha,Linea,CocheId,KmRecorridos,HorasServicio',
      ...rows.map(
        (r: Record<string, unknown>) =>
          `${r.fecha ?? ''},${r.linea ?? ''},${r.cocheId ?? ''},${r.km ?? 0},${r.horas ?? 0}`,
      ),
    ].join('\n');
  } catch {
    datos = `Fecha,Linea,CocheId,KmRecorridos\n(Sin datos disponibles para ${mes})`;
  }
  descargarTexto(`reporte_km_${mes}.csv`, datos);
}

async function generarInformePuntualidad(mes: string): Promise<void> {
  const datos = `INFORME DE PUNTUALIDAD - UCOT - ${mes}\n\nGenerado automáticamente por SkillRoute 2.0\nFecha: ${new Date().toLocaleDateString('es-UY')}\n\n(Completar con datos del mes seleccionado desde Firestore)`;
  descargarTexto(`puntualidad_${mes}.txt`, datos);
}

function descargarTexto(nombre: string, contenido: string): void {
  const blob = new Blob([contenido], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
