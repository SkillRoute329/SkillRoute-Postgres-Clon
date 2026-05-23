import { useState, useCallback } from 'react';
import { RefreshCw, Printer, TrendingDown, ShieldAlert, BarChart3, Lightbulb, AlertCircle } from 'lucide-react';
import { useEmpresaPropia } from '../../hooks/useEmpresaPropia';
import { fetchDiagnostico, type DiagnosticoCompleto } from '../../services/diagnosticoEjecutivoService';
import BloquePerdidaMercado from '../../components/diagnostico/BloquePerdidaMercado';
import BloqueInconsistenciasInternas from '../../components/diagnostico/BloqueInconsistenciasInternas';
import BloqueComparativaRival from '../../components/diagnostico/BloqueComparativaRival';
import BloqueRecomendaciones from '../../components/diagnostico/BloqueRecomendaciones';
import InformeAccionableLineas from '../../components/diagnostico/InformeAccionableLineas';
import { getDiagnosticoLineas, type DiagnosticoLineasResultado } from '../../services/comandoService';

const BLOQUES = [
  {
    id: 'b1',
    titulo: 'Pérdida de mercado',
    subtitulo: 'Share vs rivales en corredores compartidos · últimos 7 días',
    icon: TrendingDown,
    iconColor: 'text-red-400',
    borderAccent: 'border-l-red-500/60',
  },
  {
    id: 'b2',
    titulo: 'Inconsistencias internas',
    subtitulo: 'Auditoría OTP · coches anómalos · etapas desviadas',
    icon: ShieldAlert,
    iconColor: 'text-orange-400',
    borderAccent: 'border-l-orange-500/60',
  },
  {
    id: 'b3',
    titulo: 'Comparativa vs rival',
    subtitulo: 'OTP · velocidad operativa · cobertura horaria por corredor',
    icon: BarChart3,
    iconColor: 'text-blue-400',
    borderAccent: 'border-l-blue-500/60',
  },
  {
    id: 'b4',
    titulo: 'Recomendaciones accionables',
    subtitulo: 'Acciones priorizadas derivadas del diagnóstico completo',
    icon: Lightbulb,
    iconColor: 'text-yellow-400',
    borderAccent: 'border-l-yellow-500/60',
  },
] as const;

const EMPRESAS_DISPONIBLES = [
  { agencyId: '70', label: 'UCOT', color: 'text-yellow-400' },
  { agencyId: '50', label: 'CUTCSA', color: 'text-blue-400' },
  { agencyId: '20', label: 'COME', color: 'text-emerald-400' },
  { agencyId: '10', label: 'COETC', color: 'text-red-400' },
];

interface BloqueCardProps {
  bloque: typeof BLOQUES[number];
  children: React.ReactNode;
  loading: boolean;
  error: boolean;
}

function BloqueCard({ bloque, children, loading, error }: BloqueCardProps) {
  const Icon = bloque.icon;
  return (
    <div className={`bg-slate-900 border border-slate-700/50 border-l-2 ${bloque.borderAccent} rounded-xl p-5`}>
      <div className="flex items-start gap-3 mb-4">
        <div className={`p-2 rounded-lg bg-slate-800/60 ${bloque.iconColor}`}>
          <Icon className="w-5 h-5" />
        </div>
        <div>
          <h3 className="text-base font-bold text-slate-100">{bloque.titulo}</h3>
          <p className="text-xs text-slate-500 mt-0.5">{bloque.subtitulo}</p>
        </div>
      </div>
      {loading ? (
        <div className="flex items-center gap-2 py-6">
          <RefreshCw className="w-4 h-4 text-slate-500 animate-spin" />
          <span className="text-sm text-slate-500">Calculando…</span>
        </div>
      ) : error ? (
        <div className="flex items-center gap-2 py-4 text-red-400">
          <AlertCircle className="w-4 h-4" />
          <span className="text-sm">Error al cargar este bloque. Reintentar.</span>
        </div>
      ) : children}
    </div>
  );
}

export default function DiagnosticoEjecutivo() {
  const { empresaCfg, setEmpresaPropia } = useEmpresaPropia();
  const [selectedAgency, setSelectedAgency] = useState<string>(empresaCfg.agencyId);
  const [diagnostico, setDiagnostico] = useState<DiagnosticoCompleto | null>(null);
  const [informe, setInforme] = useState<DiagnosticoLineasResultado | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generar = useCallback(async (agencyId: string) => {
    setLoading(true);
    setError(null);
    setDiagnostico(null);
    setInforme(null);
    // El informe accionable línea×línea es el entregable principal; los 4
    // bloques agregados son complementarios. Se cargan en paralelo y se
    // muestra cada uno apenas llega (el informe puede tardar ~15s).
    void getDiagnosticoLineas(agencyId)
      .then(setInforme)
      .catch((e) =>
        setError((prev) => prev ?? (e?.message ?? 'Error al generar el informe por línea.')),
      );
    try {
      const result = await fetchDiagnostico(agencyId);
      setDiagnostico(result);
    } catch (err: any) {
      setError((prev) => prev ?? (err.message ?? 'Error desconocido al generar diagnóstico.'));
    } finally {
      setLoading(false);
    }
  }, []);

  const handleChangeEmpresa = (agencyId: string) => {
    setSelectedAgency(agencyId);
    const num = Number(agencyId) as 70 | 50 | 20 | 10;
    if ([70, 50, 20, 10].includes(num)) setEmpresaPropia(num);
    setDiagnostico(null);
    setInforme(null);
    setError(null);
  };

  const handleExportar = () => {
    window.print();
  };

  const generadoEn = diagnostico?.generadoEn;

  return (
    <div className="min-h-screen bg-slate-950 text-white p-6 space-y-6 print:bg-white print:text-black">
      {/* Cabecera */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Diagnóstico Ejecutivo</h1>
          <p className="text-sm text-slate-400 mt-1">
            Análisis automático de mercado, operación interna y comparativa vs rivales
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {generadoEn && (
            <span className="text-xs text-slate-500">
              Actualizado: {generadoEn.toLocaleTimeString('es-UY', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          <button
            onClick={handleExportar}
            className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-sm px-3 py-2 rounded-lg transition-colors print:hidden"
          >
            <Printer className="w-4 h-4" />
            Exportar
          </button>
        </div>
      </div>

      {/* Selector de operador + botón generar */}
      <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center gap-4 print:hidden">
        <div className="flex-1">
          <label className="text-xs text-slate-500 uppercase tracking-widest mb-2 block">
            Operador a diagnosticar
          </label>
          <div className="flex gap-2 flex-wrap">
            {EMPRESAS_DISPONIBLES.map(e => (
              <button
                key={e.agencyId}
                onClick={() => handleChangeEmpresa(e.agencyId)}
                className={`px-4 py-2 rounded-lg text-sm font-semibold border transition-all ${
                  selectedAgency === e.agencyId
                    ? `bg-blue-600/20 border-blue-500 ${e.color}`
                    : 'bg-slate-800/60 border-slate-700 text-slate-400 hover:border-slate-500'
                }`}
              >
                {e.label}
              </button>
            ))}
          </div>
        </div>
        <button
          onClick={() => generar(selectedAgency)}
          disabled={loading}
          className="flex items-center gap-2 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl px-5 py-2.5 font-semibold text-white text-sm transition-all whitespace-nowrap"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          {loading ? 'Calculando…' : 'Generar diagnóstico'}
        </button>
      </div>

      {/* Error global */}
      {error && (
        <div className="flex items-center gap-3 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-300 text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Estado inicial — sin diagnóstico */}
      {!diagnostico && !loading && !error && (
        <div className="flex flex-col items-center gap-4 py-20 text-center">
          <div className="w-16 h-16 rounded-2xl bg-blue-600/10 flex items-center justify-center">
            <BarChart3 className="w-8 h-8 text-blue-400/60" />
          </div>
          <div>
            <p className="text-slate-300 font-medium">Seleccioná un operador y generá el diagnóstico</p>
            <p className="text-slate-500 text-sm mt-1">
              El sistema analizará mercado, inconsistencias internas y comparativa vs rivales.
            </p>
          </div>
        </div>
      )}

      {/* INFORME ACCIONABLE LÍNEA POR LÍNEA — entregable principal */}
      {(informe || loading) && (
        <div className="bg-slate-900 border border-slate-700/50 border-l-2 border-l-blue-500/60 rounded-xl p-5">
          <div className="flex items-start gap-3 mb-4">
            <div className="p-2 rounded-lg bg-slate-800/60 text-blue-400">
              <BarChart3 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-100">
                Informe accionable — línea por línea
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Venta de boletos precisa mes a mes · competidor real con su horario · servicio que
                la cubre · acción concreta
              </p>
            </div>
          </div>
          {informe ? (
            <InformeAccionableLineas data={informe} />
          ) : (
            <div className="flex items-center gap-2 py-6">
              <RefreshCw className="w-4 h-4 text-slate-500 animate-spin" />
              <span className="text-sm text-slate-500">
                Generando informe línea por línea (cruzando STM, competencia y horarios)…
              </span>
            </div>
          )}
        </div>
      )}

      {/* 4 Bloques complementarios */}
      {(diagnostico || loading) && (
        <div className="grid gap-5">
          <BloqueCard bloque={BLOQUES[3]} loading={loading} error={false}>
            {diagnostico && <BloqueRecomendaciones data={diagnostico.bloque4} />}
          </BloqueCard>

          <BloqueCard bloque={BLOQUES[0]} loading={loading} error={false}>
            {diagnostico && <BloquePerdidaMercado data={diagnostico.bloque1} />}
          </BloqueCard>

          <BloqueCard bloque={BLOQUES[1]} loading={loading} error={false}>
            {diagnostico && <BloqueInconsistenciasInternas data={diagnostico.bloque2} />}
          </BloqueCard>

          <BloqueCard bloque={BLOQUES[2]} loading={loading} error={false}>
            {diagnostico && <BloqueComparativaRival data={diagnostico.bloque3} />}
          </BloqueCard>
        </div>
      )}

      {/* Footer print */}
      {diagnostico && (
        <div className="hidden print:block text-xs text-gray-400 text-center pt-4 border-t border-gray-200">
          Diagnóstico Ejecutivo — {diagnostico.empresaNombre} — {generadoEn?.toLocaleDateString('es-UY')} ·
          Generado por SkillRoute · Datos GPS STM + GTFS oficiales IMM
        </div>
      )}
    </div>
  );
}
