import { useState, useMemo } from 'react';
import {
  MapPin,
  Bus,
  Clock,
  ArrowUpCircle,
  ArrowDownCircle,
  ShieldAlert,
  Brain,
  Crosshair,
  Timer
} from 'lucide-react';
import { getMasterLineas } from '../../data/ucotMaster';

// Mock data para puntos de control
const PUNTOS_CONTROL = [
  { id: 'pc_puntacarretas', nombre: 'Terminal Punta Carretas' },
  { id: 'pc_portones', nombre: 'Terminal Portones' },
  { id: 'pc_belloni', nombre: 'Intercambiador Belloni' },
  { id: 'pc_paso_arena', nombre: 'Terminal Paso de la Arena' },
];

export default function AsistenteInspectorCalle() {
  const lineasUcot = getMasterLineas();
  
  const [selectedLinea, setSelectedLinea] = useState(lineasUcot[0]?.linea || '17');
  const [selectedPunto, setSelectedPunto] = useState('pc_puntacarretas');

  // Lógica de predicción e inteligencia táctica
  const tacticalIntel = useMemo(() => {
    // Esto es un mock dinámico de la IA que genera la táctica basado en la selección actual
    const rivals = [
      {
        id: 'r1',
        empresa: 'CUTCSA',
        linea: '121',
        destino: 'Punta Carretas',
        etaReal: 2, // llega en 2 mins
        etaProgramado: 4, // debía llegar en 4
        comportamientoPredicho: 'Suele adelantar +2 min en este tramo para robar carga a UCOT.',
        nivelRiesgo: 'Alto'
      },
      {
        id: 'r2',
        empresa: 'COME',
        linea: '582',
        destino: 'Punta Carretas',
        etaReal: 8,
        etaProgramado: 8,
        comportamientoPredicho: 'Mantiene horario normal.',
        nivelRiesgo: 'Bajo'
      }
    ];

    let recomendacion = '';
    let accion: 'ADELANTAR' | 'ATRASAR' | 'MANTENER' = 'MANTENER';
    
    // Motor de decisión:
    const mainRival = rivals[0];
    if (mainRival.etaReal < mainRival.etaProgramado) {
      accion = 'ADELANTAR';
      recomendacion = `La IA detectó maniobra hostil: ${mainRival.empresa} (${mainRival.linea}) está adelantando su marcha. Sugerimos ADELANTAR el coche de UCOT 3 minutos para posicionarse por delante en el load-point de ${selectedPunto.replace('pc_', '').toUpperCase()}.`;
    } else {
      accion = 'MANTENER';
      recomendacion = `No se detectan maniobras agresivas. Mantener la frecuencia regulada actual.`;
    }

    return { rivals, recomendacion, accion };
  }, [selectedLinea, selectedPunto]);

  return (
    <div className="flex flex-col w-full h-full p-4 space-y-6 bg-slate-950 overflow-y-auto pb-20">
      
      {/* HEADER TÁCTICO */}
      <div className="bg-slate-900 border border-slate-700 rounded-xl p-4 shadow-lg">
        <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2 mb-4">
          <Crosshair className="w-6 h-6 text-blue-400" />
          Asistente Táctico de Calle (Inspector)
        </h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-1">
              Línea a Controlar (UCOT)
            </label>
            <select
              value={selectedLinea}
              onChange={(e) => setSelectedLinea(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-slate-200 focus:outline-none focus:border-blue-500"
            >
              {lineasUcot.map(l => (
                <option key={l.linea} value={l.linea}>Línea {l.linea}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-1">
              Punto de Control Actual
            </label>
            <select
              value={selectedPunto}
              onChange={(e) => setSelectedPunto(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-slate-200 focus:outline-none focus:border-blue-500"
            >
              {PUNTOS_CONTROL.map(p => (
                <option key={p.id} value={p.id}>{p.nombre}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* RECOMENDACIÓN DE LA IA (PREDICCIÓN) */}
      <div className={`border-l-4 rounded-xl p-5 shadow-lg flex gap-4 items-start ${tacticalIntel.accion === 'ADELANTAR' ? 'bg-orange-950/40 border-orange-500' : 'bg-blue-950/40 border-blue-500'}`}>
        <Brain className={`w-8 h-8 shrink-0 mt-1 ${tacticalIntel.accion === 'ADELANTAR' ? 'text-orange-400' : 'text-blue-400'}`} />
        <div>
          <h3 className={`text-lg font-bold mb-1 ${tacticalIntel.accion === 'ADELANTAR' ? 'text-orange-400' : 'text-blue-400'}`}>
            Predicción del Motor IA
          </h3>
          <p className="text-slate-300 leading-relaxed text-sm md:text-base">
            {tacticalIntel.recomendacion}
          </p>
          <div className="mt-4 flex gap-3">
            {tacticalIntel.accion === 'ADELANTAR' && (
              <button className="bg-orange-600 hover:bg-orange-500 text-white font-medium py-2 px-6 rounded-lg shadow flex items-center gap-2 transition-colors">
                <ArrowUpCircle className="w-5 h-5" />
                Emitir Orden: Adelantar
              </button>
            )}
            <button className="bg-slate-700 hover:bg-slate-600 text-slate-200 font-medium py-2 px-6 rounded-lg shadow transition-colors">
              Ignorar
            </button>
          </div>
        </div>
      </div>

      {/* RADAR DE COMPETENCIA */}
      <div className="bg-slate-900 border border-slate-700 rounded-xl overflow-hidden shadow-lg">
        <div className="px-5 py-4 border-b border-slate-700/80 bg-slate-800/50 flex justify-between items-center">
          <h3 className="font-semibold text-slate-200 flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-rose-400" />
            Radar de Competencia Inminente
          </h3>
          <span className="text-xs bg-slate-700 text-slate-300 py-1 px-2 rounded-md">Live ETA</span>
        </div>
        
        <div className="divide-y divide-slate-700/50">
          {tacticalIntel.rivals.map(rival => (
            <div key={rival.id} className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-slate-800/30 transition-colors">
              
              <div className="flex gap-4 items-start">
                <div className="bg-slate-800 p-3 rounded-lg flex flex-col items-center justify-center border border-slate-700 shadow-inner w-16">
                  <Bus className="w-5 h-5 text-slate-400 mb-1" />
                  <span className="text-sm font-bold text-slate-200">{rival.linea}</span>
                </div>
                
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold text-slate-200">{rival.empresa}</span>
                    <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full ${rival.nivelRiesgo === 'Alto' ? 'bg-rose-900/50 text-rose-400 border border-rose-800' : 'bg-emerald-900/50 text-emerald-400 border border-emerald-800'}`}>
                      Riesgo {rival.nivelRiesgo}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-slate-400 mt-1">
                    <MapPin className="w-3.5 h-3.5" />
                    Destino: {rival.destino}
                  </div>
                  
                  {/* PREDICCIÓN DE MANIOBRA */}
                  <div className="mt-2 text-xs border-l-2 border-slate-600 pl-2 text-slate-400 italic">
                    <span className="text-blue-400 font-medium not-italic mr-1">Histórico:</span> 
                    {rival.comportamientoPredicho}
                  </div>
                </div>
              </div>

              <div className="flex md:flex-col gap-4 md:gap-2 items-center md:items-end justify-between border-t md:border-t-0 border-slate-700/50 pt-3 md:pt-0">
                <div className="flex items-center gap-2">
                  <Timer className="w-4 h-4 text-slate-400" />
                  <span className="text-xs text-slate-400">Prog.</span>
                  <span className="text-sm font-medium text-slate-300">{rival.etaProgramado} min</span>
                </div>
                
                <div className="flex items-center gap-2 bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-800 shadow-inner">
                  <Clock className="w-4 h-4 text-emerald-400" />
                  <span className="text-xs text-slate-400">ETA Real</span>
                  <span className={`text-xl font-bold ${rival.etaReal < rival.etaProgramado ? 'text-rose-400' : 'text-emerald-400'}`}>
                    {rival.etaReal} <span className="text-xs font-normal text-slate-500">min</span>
                  </span>
                </div>
              </div>

            </div>
          ))}
        </div>
      </div>

    </div>
  );
}
