import { useState, useEffect } from 'react';
import { doc, getDoc, collection, query, where, getDocs, limit } from '../../config/firestoreShim';
import { db } from '../../config/firebase';
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
  ClipboardList,
  RefreshCw
} from 'lucide-react';
import { INCIDENCIA_META } from '../../services/incidenciasService';
import type { User as DriverUser, Vehicle } from '../../services/firestore/types';

interface PanelTrazabilidad360Props {
  incidentId?: string;
}

export default function PanelTrazabilidad360({ incidentId }: PanelTrazabilidad360Props) {
  const [searchQuery, setSearchQuery] = useState(incidentId || '');
  const [loading, setLoading] = useState(!!incidentId);
  const [incidencia, setIncidencia] = useState<any>(null);
  const [chofer, setChofer] = useState<DriverUser | null>(null);
  const [vehiculo, setVehiculo] = useState<Vehicle | null>(null);
  const [error, setError] = useState('');

  const isEmbedded = !!incidentId;

  // Lógica de Veredicto determinista basada en el tipo de incidencia
  const generarVeredicto = () => {
    if (!incidencia) return { texto: 'Esperando datos...', accion: '' };
    const t = (incidencia.type || '').toUpperCase();
    
    if (t === 'MECANICA' || t === 'ROTURA') {
      return {
        texto: `Fallo detectado en el componente motriz. Revisión de taller sugerida.`,
        accion: 'Derivar unidad a taller central (Retén sugerido).'
      };
    } else if (t === 'ACCIDENTE' || t === 'EVASION') {
      return {
        texto: `Incidencia asociada al factor humano o externo.`,
        accion: 'Protocolo de seguros activo. Citar a declaración (Scoring afectado).'
      };
    } else if (t === 'DEMORA' || t === 'CONGESTION') {
      return {
        texto: `Afectación estructural de la vía.`,
        accion: 'Ajuste de algoritmo Headway necesario (Intervalos dinámicos).'
      };
    }
    return {
      texto: `Traza sin anomalías graves. Factor ambiental probable.`,
      accion: 'Monitorear unidad en los próximos 15 minutos.'
    };
  };

  useEffect(() => {
    const idToFetch = incidentId || searchQuery;
    if (!idToFetch) return;

    let isMounted = true;
    setLoading(true);
    setError('');

    const fetchData = async () => {
      try {
        const incDoc = await getDoc(doc(db, 'incidencias', idToFetch));
        if (!incDoc.exists()) {
          if (isMounted) setError('Incidencia no encontrada.');
          return;
        }
        const incData = incDoc.data();
        if (isMounted) setIncidencia({ id: incDoc.id, ...incData });

        // Fetch driver si existe
        if (incData.reportedBy?.uid) {
          const uDoc = await getDoc(doc(db, 'users', incData.reportedBy.uid));
          if (uDoc.exists() && isMounted) setChofer(uDoc.data() as DriverUser);
        }

        // Fetch vehículo si existe
        if (incData.vehicleId) {
          const vQuery = query(collection(db, 'vehiculos'), where('internalNumber', '==', incData.vehicleId), limit(1));
          const vSnap = await getDocs(vQuery);
          if (!vSnap.empty && isMounted) {
            setVehiculo(vSnap.docs[0].data() as Vehicle);
          } else {
             // fallback buscar por ID
             const vDoc = await getDoc(doc(db, 'vehiculos', incData.vehicleId));
             if (vDoc.exists() && isMounted) setVehiculo(vDoc.data() as Vehicle);
          }
        }
      } catch (err) {
        console.error(err);
        if (isMounted) setError('Error obteniendo trazabilidad 360');
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    void fetchData();

    return () => { isMounted = false; };
  }, [incidentId, searchQuery]);

  if (loading) {
    return (
      <div className={`flex flex-col items-center justify-center bg-slate-950 ${isEmbedded ? 'p-10' : 'h-screen'}`}>
        <RefreshCw className="w-8 h-8 text-indigo-500 animate-spin mb-4" />
        <p className="text-slate-400 font-bold">Rastreando traza 360° en BD...</p>
      </div>
    );
  }

  if (error || !incidencia) {
    return (
      <div className={`flex flex-col h-full bg-slate-950 overflow-y-auto ${isEmbedded ? 'p-4' : 'p-6'}`}>
         <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 p-4 rounded-xl text-center">
            {error || 'Ingresa un ID para comenzar el análisis.'}
         </div>
      </div>
    );
  }

  const meta = INCIDENCIA_META[incidencia.type ?? 'otro'] || { label: incidencia.type || 'Otro' };
  const veredicto = generarVeredicto();

  return (
    <div className={`flex flex-col h-full bg-slate-950 overflow-y-auto ${isEmbedded ? 'p-2' : 'p-6'}`}>
      
      {/* HEADER DE BÚSQUEDA (Oculto si está embebido) */}
      {!isEmbedded && (
        <div className="flex flex-col md:flex-row gap-6 justify-between items-start md:items-center mb-8">
          <div>
            <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-3">
              <GitMerge className="w-7 h-7 text-indigo-400" />
              Trazabilidad Operativa 360°
            </h1>
            <p className="text-slate-400 mt-1 text-sm">
              Datos obtenidos de Firebase en tiempo real.
            </p>
          </div>
          
          <div className="relative w-full md:w-72">
            <input 
              type="text" 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="ID Incidencia..."
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
                  {meta.label} - {incidencia.description || 'Sin descripción adicional'}
                </p>
                <div className="flex gap-4 text-sm text-slate-400">
                  <span className="flex items-center gap-1"><Bus className="w-4 h-4" /> Coche {incidencia.vehicleId || 'N/A'}</span>
                  <span className="flex items-center gap-1"><ArrowRight className="w-4 h-4" /> Línea {incidencia.lineaNombre || 'N/A'}</span>
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
                  {chofer ? (
                     <>
                      <p className="text-slate-200 font-medium text-base mb-1">Chofer: {chofer.name || 'Desconocido'}</p>
                      <p className="text-xs text-slate-400">Legajo UID: {chofer.id}</p>
                     </>
                  ) : (
                    <p className="text-slate-400 italic text-sm">No hay un chofer vinculado de forma explícita a este reporte.</p>
                  )}
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
                  {vehiculo ? (
                     <>
                       <p className="text-slate-200 font-medium text-base mb-1">Coche {vehiculo.internalNumber || 'S/N'}</p>
                       <p className="text-xs text-slate-400">Placa: {vehiculo.plate || 'S/N'}</p>
                       <div className="mt-3 bg-slate-900 border border-slate-800 p-2 rounded text-xs text-slate-400">
                         Estado en BD: {vehiculo.status || 'OPERATIVO'}
                       </div>
                     </>
                  ) : (
                     <p className="text-slate-400 italic text-sm">No se pudo vincular la unidad en la base de datos.</p>
                  )}
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
                <h3 className="text-orange-400 font-bold uppercase tracking-wider text-xs mb-1">Impacto Táctico</h3>
                
                <div className="grid grid-cols-2 gap-4 mt-3">
                  <div className="bg-slate-900 p-3 rounded-lg border border-slate-800">
                    <span className="text-xs text-slate-500 block">Pérdida (Est.)</span>
                    <span className="text-lg font-bold text-rose-400">Calculando...</span>
                  </div>
                  <div className="bg-slate-900 p-3 rounded-lg border border-slate-800">
                    <span className="text-xs text-slate-500 block">Prioridad BD</span>
                    <span className="text-lg font-bold text-orange-400">{incidencia.priority || 'NORMAL'}</span>
                  </div>
                  <div className="bg-slate-900 p-3 rounded-lg border border-slate-800 col-span-2">
                    <span className="text-xs text-slate-500 block mb-1">Fuga de Mercado</span>
                    <div className="flex items-center gap-2">
                      <ShieldAlert className="w-4 h-4 text-orange-400" />
                      <span className="text-sm font-medium text-slate-300">
                        Evaluando superposición con flota rival.
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
              <h3 className="text-indigo-400 font-bold text-sm uppercase tracking-wider">Veredicto del Motor IA (Simulado)</h3>
            </div>
            <p className="text-slate-300 text-sm">
              {veredicto.texto}
              <br/><br/>
              <strong>Acción Correctiva Sugerida:</strong> {veredicto.accion}
            </p>
          </div>

        </div>

      </div>
    </div>
  );
}
