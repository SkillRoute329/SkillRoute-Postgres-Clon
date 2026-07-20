import React from 'react';
import { Calendar, CheckCircle, Clock, ShieldCheck, Info } from 'lucide-react';
import { TIMELINE } from '../../data/brtData';

export default function TabTimeline() {
  return (
    <div className="space-y-4">
      <div className="bg-amber-900/20 border border-amber-700/40 rounded-xl p-4 flex items-start gap-3">
        <Calendar className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
        <div>
          <p className="font-bold text-amber-300">Ventana crítica: Licitaciones 2026 Q3-Q4</p>
          <p className="text-amber-400/80 text-sm mt-1">
            El proceso de licitación para operadores alimentadores se abrirá en el segundo semestre de 2026.
            UCOT debe tener lista su propuesta técnica y financiera antes de ese período.
          </p>
        </div>
      </div>

      <div className="space-y-3">
        {TIMELINE.map((t, i) => (
          <div key={i} className="flex gap-4">
            <div className="flex flex-col items-center">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 font-bold text-xs ${
                t.estado === 'completado' ? 'bg-emerald-600 text-white' :
                t.estado === 'en_curso' ? 'bg-amber-600 text-white animate-pulse' :
                'bg-slate-800 text-slate-400 border border-slate-700'
              }`}>
                {t.estado === 'completado' ? <CheckCircle className="w-5 h-5" /> :
                 t.estado === 'en_curso' ? <Clock className="w-5 h-5" /> :
                 <Clock className="w-5 h-5" />}
              </div>
              {i < TIMELINE.length - 1 && (
                <div className={`w-0.5 flex-1 mt-2 min-h-[20px] ${
                  t.estado === 'completado' ? 'bg-emerald-700' : 'bg-slate-800'
                }`} />
              )}
            </div>
            <div className="flex-1 pb-5">
              <div className="bg-slate-900 rounded-xl border border-slate-800 p-4">
                <div className="flex items-center gap-3 mb-2 flex-wrap">
                  <span className={`text-sm font-black px-2 py-0.5 rounded ${
                    t.estado === 'completado' ? 'bg-emerald-900/40 text-emerald-300' :
                    t.estado === 'en_curso' ? 'bg-amber-900/40 text-amber-300' :
                    'bg-slate-800 text-slate-400'
                  }`}>
                    {t.periodo}
                  </span>
                  {t.estado === 'en_curso' && (
                    <span className="text-xs bg-amber-600 text-white px-2 py-0.5 rounded-full font-bold animate-pulse">
                      AHORA
                    </span>
                  )}
                </div>
                <p className="text-white font-bold text-sm">{t.evento}</p>
                <p className="text-slate-400 text-xs mt-1.5 leading-relaxed">{t.detalle}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Checklist UCOT */}
      <div className="bg-slate-900 rounded-xl border border-primary-800/40 overflow-hidden">
        <div className="px-4 py-3 border-b border-primary-800/40 bg-primary-900/20">
          <p className="font-bold text-primary-300 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4" /> Checklist estratégico para UCOT — ¿Qué hacer AHORA?
          </p>
        </div>
        <div className="p-4 space-y-3">
          {[
            { prioridad: 'URGENTE', accion: 'Contratar asesor legal especializado en contratos de concesión de transporte público', deadline: 'Antes de Q3 2026' },
            { prioridad: 'URGENTE', accion: 'Presentar propuesta técnica formal para operar alimentadoras en los corredores A y B', deadline: 'Q3 2026' },
            { prioridad: 'ALTA', accion: 'Mapear recorridos de las 5 alimentadoras propuestas con datos GPS reales', deadline: '2026' },
            { prioridad: 'ALTA', accion: 'Calcular viabilidad financiera con tarifa $420 UYU/km en escenarios optimista/conservador/pesimista', deadline: '2026' },
            { prioridad: 'MEDIA', accion: 'Evaluar renovación de flota (buses accesibles, puertas al nivel de parada BRT)', deadline: '2027' },
            { prioridad: 'MEDIA', accion: 'Negociar con MTOP/IMM posición preferente como operador histórico de los corredores', deadline: '2026-2027' },
            { prioridad: 'INFO', accion: 'Monitorear avance de obras y ajustar servicios transitoriamente durante la construcción', deadline: '2027-2029' },
          ].map(item => (
            <div key={item.accion} className="flex items-start gap-3">
              <span className={`text-[10px] font-black px-2 py-0.5 rounded shrink-0 mt-0.5 ${
                item.prioridad === 'URGENTE' ? 'bg-red-900/50 text-red-300 border border-red-700/50' :
                item.prioridad === 'ALTA' ? 'bg-amber-900/50 text-amber-300 border border-amber-700/50' :
                item.prioridad === 'MEDIA' ? 'bg-blue-900/50 text-blue-300 border border-blue-700/50' :
                'bg-slate-800 text-slate-400 border border-slate-700'
              }`}>
                {item.prioridad}
              </span>
              <div className="flex-1">
                <p className="text-slate-200 text-sm">{item.accion}</p>
                <p className="text-slate-500 text-xs mt-0.5">Deadline: {item.deadline}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Nota fuentes */}
      <div className="flex items-start gap-2 text-xs text-slate-600">
        <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
        <span>
          Datos basados en: MTOP (publicación estudios técnicos BRT, abril 2026), El Observador, La Diaria, Subrayado, Caras y Caretas.
          US$490M inversión confirmada. Inicio obras enero 2027 confirmado. Tarifas $/km estimadas sobre contratos vigentes de CUTCSA y COME.
        </span>
      </div>
    </div>
  );
}
