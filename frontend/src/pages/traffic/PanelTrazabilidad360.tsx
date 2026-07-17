import { useState } from 'react';
import {
  GitMerge,
  AlertTriangle,
  User,
  Wrench,
  TrendingDown,
  Bus,
  Search,
  ArrowRight,
  ShieldAlert,
  ClipboardList
} from 'lucide-react';

interface PanelTrazabilidad360Props {
  incidentId?: string;
}

export default function PanelTrazabilidad360({ incidentId }: PanelTrazabilidad360Props) {
  const [searchQuery, setSearchQuery] = useState(incidentId || 'INC-4592');

  const isEmbedded = !!incidentId;

  return (
    <div className={`flex flex-col h-full bg-slate-950 overflow-y-auto ${isEmbedded ? 'p-2' : 'p-6'}`}>
      
      {/* HEADER DE BÚSQUEDA (Oculto si está embebido) */}
      {!isEmbedded && (
        <div className="flex flex-col md:flex-row gap-6 justify-between items-start md:items-center mb-8">
          <div>
            <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-3">
              <GitMerge className="w-7 h-7 text-indigo-400" />
              Trazabilidad Operativa 360° (Auditoría en Cascada)
            </h1>
            <p className="text-slate-400 mt-1 text-sm">
              Rastrea el origen y el impacto en cadena de cualquier incidencia del sistema.
            </p>
          </div>
          
          <div className="relative w-full md:w-72">
            <input 
              type="text" 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="ID Incidencia o Matrícula..."
              className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-10 pr-4 py-2 text-slate-200 focus:outline-none focus:border-indigo-500"
            />
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
          </div>
        </div>
      )}

      {/* ÁRBOL DE TRAZABILIDAD (Nodos) */}
      <div className={`flex-1 bg-slate-900 border border-slate-800 rounded-2xl relative shadow-2xl ${isEmbedded ? 'p-4' : 'p-6'}`}>
        
        <div className="max-w-4xl mx-auto flex flex-col items-center relative">
          
          {/* LÍNEA CONECTORA PRINCIPAL */}
          <div className="absolute top-10 bottom-10 left-1/2 w-1 bg-slate-800 -translate-x-1/2 z-0"></div>

          {/* NODO 1: EL HECHO (INCIDENCIA) */}
          <div className="relative z-10 bg-slate-950 border border-rose-500/50 rounded-xl p-5 w-full max-w-lg mb-12 shadow-lg shadow-rose-900/20">
            <div className="flex items-start gap-4">
              <div className="bg-rose-500/10 p-3 rounded-lg border border-rose-500/30">
                <AlertTriangle className="w-6 h-6 text-rose-400" />
              </div>
              <div>
                <h3 className="text-rose-400 font-bold uppercase tracking-wider text-xs mb-1">El Hecho Detectado</h3>
                <p className="text-slate-200 font-medium text-lg leading-tight mb-2">
                  Rotura de Caja de Cambios en Pleno Recorrido
                </p>
                <div className="flex gap-4 text-sm text-slate-400">
                  <span className="flex items-center gap-1"><Bus className="w-4 h-4" /> Coche 35</span>
                  <span className="flex items-center gap-1"><ArrowRight className="w-4 h-4" /> Línea 17 (Pza. Independencia)</span>
                </div>
              </div>
            </div>
          </div>

          {/* NODOS 2 y 3: FACTOR HUMANO Y FACTOR TÉCNICO */}
          <div className="flex flex-col md:flex-row w-full justify-between gap-8 mb-12 relative z-10">
            
            {/* LÍNEAS CONECTORAS HORIZONTALES */}
            <div className="hidden md:block absolute top-1/2 left-1/4 right-1/4 h-1 bg-slate-800 -translate-y-1/2 -z-10"></div>

            {/* NODO 2: RRHH (Factor Humano) */}
            <div className="bg-slate-950 border border-slate-700 rounded-xl p-5 w-full shadow-lg">
              <div className="flex items-start gap-4">
                <div className="bg-blue-500/10 p-3 rounded-lg border border-blue-500/30">
                  <User className="w-6 h-6 text-blue-400" />
                </div>
                <div>
                  <h3 className="text-blue-400 font-bold uppercase tracking-wider text-xs mb-1">Actor Humano (RRHH)</h3>
                  <p className="text-slate-200 font-medium text-base mb-1">Chofer: Juan Pérez (Legajo #4230)</p>
                  <p className="text-xs text-slate-400">Turno asignado por: Listero A. Martínez</p>
                  <div className="mt-3 bg-slate-900 border border-slate-800 p-2 rounded text-xs text-slate-400">
                    <span className="text-rose-400 font-medium block mb-1">⚠️ Historial de Conducción:</span>
                    3 incidencias de caja de cambios en los últimos 6 meses. (Scoring Severo).
                  </div>
                </div>
              </div>
            </div>

            {/* NODO 3: MANTENIMIENTO (Factor Técnico) */}
            <div className="bg-slate-950 border border-slate-700 rounded-xl p-5 w-full shadow-lg">
              <div className="flex items-start gap-4">
                <div className="bg-emerald-500/10 p-3 rounded-lg border border-emerald-500/30">
                  <Wrench className="w-6 h-6 text-emerald-400" />
                </div>
                <div>
                  <h3 className="text-emerald-400 font-bold uppercase tracking-wider text-xs mb-1">Actor Técnico (Taller)</h3>
                  <p className="text-slate-200 font-medium text-base mb-1">Coche 35 - Volvo B215</p>
                  <p className="text-xs text-slate-400">Último Service: Hace 14 horas</p>
                  <div className="mt-3 bg-slate-900 border border-slate-800 p-2 rounded text-xs text-slate-400">
                    <span className="text-emerald-400 font-medium block mb-1">✓ Reporte Mecánico:</span>
                    Mecánico responsable: M. Silva. Estado reportado como "Óptimo". Piezas nuevas instaladas.
                  </div>
                </div>
              </div>
            </div>

          </div>

          {/* NODO 4: IMPACTO (Consecuencias) */}
          <div className="relative z-10 bg-slate-950 border border-orange-500/50 rounded-xl p-5 w-full max-w-lg shadow-lg shadow-orange-900/10">
            <div className="flex items-start gap-4">
              <div className="bg-orange-500/10 p-3 rounded-lg border border-orange-500/30">
                <TrendingDown className="w-6 h-6 text-orange-400" />
              </div>
              <div className="w-full">
                <h3 className="text-orange-400 font-bold uppercase tracking-wider text-xs mb-1">Impacto Táctico y Económico</h3>
                
                <div className="grid grid-cols-2 gap-4 mt-3">
                  <div className="bg-slate-900 p-3 rounded-lg border border-slate-800">
                    <span className="text-xs text-slate-500 block">Pérdida de Boletos (Est.)</span>
                    <span className="text-lg font-bold text-rose-400">- 45 Boletos</span>
                  </div>
                  <div className="bg-slate-900 p-3 rounded-lg border border-slate-800">
                    <span className="text-xs text-slate-500 block">Multa IMM (Horario)</span>
                    <span className="text-lg font-bold text-rose-400">20 UR</span>
                  </div>
                  <div className="bg-slate-900 p-3 rounded-lg border border-slate-800 col-span-2">
                    <span className="text-xs text-slate-500 block mb-1">Fuga de Mercado</span>
                    <div className="flex items-center gap-2">
                      <ShieldAlert className="w-4 h-4 text-orange-400" />
                      <span className="text-sm font-medium text-slate-300">
                        Pasaje capturado por: <span className="text-orange-400">Línea 121 (CUTCSA)</span>
                      </span>
                    </div>
                  </div>
                </div>

              </div>
            </div>
          </div>

          {/* CONCLUSIÓN DE LA IA */}
          <div className="relative z-10 bg-indigo-950/40 border border-indigo-500/50 rounded-xl p-5 w-full max-w-lg mt-8 text-center">
            <div className="flex items-center justify-center gap-2 mb-2">
              <ClipboardList className="w-5 h-5 text-indigo-400" />
              <h3 className="text-indigo-400 font-bold text-sm uppercase tracking-wider">Veredicto del Motor IA</h3>
            </div>
            <p className="text-slate-300 text-sm">
              La trazabilidad indica que el fallo del <strong>Coche 35</strong> no es un problema de taller (mantenimiento reciente al día), sino de <strong>mala praxis del chofer</strong> (historial recurrente). 
              <br/><br/>
              <strong>Acción Correctiva Sugerida:</strong> Derivar chofer a capacitación (Scoring actualizado) y despachar coche de reserva.
            </p>
          </div>

        </div>

      </div>
    </div>
  );
}
