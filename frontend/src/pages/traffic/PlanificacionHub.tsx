import { useState, lazy, Suspense } from 'react';
import { Calendar, CheckSquare, FileText, Tag, RefreshCw, CalendarDays, ClipboardCheck, Layers } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import EmpresaGuard from './EmpresaGuard';

const CartonManager         = lazy(() => import('./CartonManager'));
const ServiceMatrix         = lazy(() => import('./ServiceMatrix'));
const BoletinInspeccion     = lazy(() => import('./BoletinInspeccion'));
const ServiceCategoryPage   = lazy(() => import('../admin/ServiceCategoryPage'));
const VistaDia              = lazy(() => import('./VistaDia'));
const DespachoConfirmado    = VistaDia;
const GanttRedMetropolitana = lazy(() => import('./GanttRedMetropolitana'));

const TABS = [
  { key: 'vista-dia',   label: 'Vista del Día',           icon: Calendar       },
  { key: 'red',         label: 'Red Metropolitana',        icon: Layers         },
  { key: 'despacho',    label: 'Despacho Confirmado',      icon: CheckSquare    },
  { key: 'matriz',      label: 'Matriz de Servicio',       icon: CalendarDays   },
  { key: 'documentos',  label: 'Documentos de Servicio',   icon: FileText       },
  { key: 'boletin',     label: 'Boletín de Inspección',    icon: ClipboardCheck },
  { key: 'servicios',   label: 'Asignación de Servicios',  icon: Tag            },
] as const;

type TabKey = (typeof TABS)[number]['key'];

const Loader = () => (
  <div className="flex items-center justify-center py-24 gap-3">
    <RefreshCw className="w-6 h-6 text-blue-400 animate-spin" />
    <span className="text-slate-400 text-sm">Cargando…</span>
  </div>
);

export default function PlanificacionHub() {
  const { user } = useAuth();
  const [tab, setTab] = useState<TabKey>('vista-dia');

  const tabsVisibles = TABS.filter((t) => {
    if (t.key === 'red') return user?.role?.toLowerCase() === 'superadmin';
    return true;
  });

  return (
    <div className="bg-slate-950 min-h-screen flex flex-col">
      <div className="sticky top-0 z-30 bg-slate-950/95 backdrop-blur border-b border-slate-800 px-6 pt-5">
        <div className="flex gap-1 flex-wrap">
          {tabsVisibles.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-t-lg border-b-2 transition-all ${
                  tab === t.key
                    ? 'border-blue-500 text-white bg-slate-800/50'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <Icon className="w-4 h-4" />{t.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex-1">
        <Suspense fallback={<Loader />}>
          {tab === 'vista-dia'  ? <VistaDia /> :
           tab === 'red'        ? <GanttRedMetropolitana /> :
           tab === 'despacho'   ? <DespachoConfirmado /> :
           tab === 'matriz'     ? <ServiceMatrix /> :
           tab === 'documentos' ? (
             <EmpresaGuard empresasHabilitadas={['70']} nombreModulo="Documentos de Servicio">
               <CartonManager />
             </EmpresaGuard>
           ) :
           tab === 'boletin'    ? (
             <EmpresaGuard empresasHabilitadas={['70']} nombreModulo="Boletín de Inspección">
               <BoletinInspeccion />
             </EmpresaGuard>
           ) :
                                  <ServiceCategoryPage />}
        </Suspense>
      </div>
    </div>
  );
}
