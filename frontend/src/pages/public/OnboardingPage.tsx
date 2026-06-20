/**
 * OnboardingPage — página pública de proceso de onboarding de SkillRoute
 * ========================================================================
 * Diferenciador comercial documentado: 2-4 semanas vs 6-18 meses de los
 * líderes mundiales. Ver docs/ONBOARDING_PROCESO.md para texto base.
 *
 * Ruta: /pricing/onboarding (no autenticada — accesible por cualquier
 * visitante).
 *
 * Sprint 1 entrega 1.2 del roadmap international-grade. Componente
 * publica el contenido textual ya documentado en /docs como vista web
 * consumible por prospects sin login.
 */
import { Link } from 'react-router-dom';
import {
  CheckCircle2,
  Clock,
  ArrowLeft,
  ArrowRight,
  Users,
  Settings,
  GraduationCap,
  Rocket,
  Mail,
} from 'lucide-react';

interface SemanaItem {
  num: number;
  titulo: string;
  hito: string;
  icon: React.ReactNode;
  color: string;
  proveedor: string[];
  operador: string[];
}

const SEMANAS: SemanaItem[] = [
  {
    num: 1,
    titulo: 'Setup y configuración',
    hito: 'Sistema accesible vía URL personalizada · datos de líneas y paradas correctos · admins con acceso',
    icon: <Settings className="w-6 h-6" />,
    color: 'emerald',
    proveedor: [
      'Kickoff call · entrega de credenciales admin',
      'Setup de tenant del operador en Firestore · RBAC inicial',
      'Importación de GTFS o construcción inicial del catálogo',
      'Primera vista de la red para validar datos',
    ],
    operador: [
      'Designar equipo: 1 admin, 1 operativo, 1 IT contact',
      'Provee logo, colores institucionales, nombres oficiales',
      'Provee GTFS o lista de líneas + paradas en Excel',
      'Valida líneas, paradas y geometrías importadas',
    ],
  },
  {
    num: 2,
    titulo: 'Datos operativos y conectividad',
    hito: 'Sistema con datos operativos reales · buses visibles en mapa en tiempo real',
    icon: <Users className="w-6 h-6" />,
    color: 'blue',
    proveedor: [
      'Configuración del feed GPS (STM API si aplica) o integración CAD/AVL',
      'Importación de horarios oficiales',
      'Setup de personal: importación masiva desde Excel · roles',
      'Setup de la flota: vehículos, asignación a líneas',
    ],
    operador: [
      'Provee credenciales o endpoint de su feed GPS',
      'Confirma horarios oficiales del organismo regulador',
      'Provee Excel con personal + roles',
      'Provee Excel con flota o lista de vehículos',
    ],
  },
  {
    num: 3,
    titulo: 'Capacitación y módulos avanzados',
    hito: 'Equipos del operador capacitados y usando el sistema en operativa diaria',
    icon: <GraduationCap className="w-6 h-6" />,
    color: 'amber',
    proveedor: [
      'Capacitación a tráfico · NavigationModule + ListeroModule + Distribución',
      'Capacitación a flota · FleetMonitor + MaintenanceDashboard',
      'Capacitación a RRHH · PersonalUcot + RotationMatrix + AdminTurnos',
      'Capacitación a directivos · CEODashboard + ShadowRadar + MarketPenetration',
      'Capacitación regulatoria · Compliance reporting + dossier exportable',
    ],
    operador: [
      'Equipo de tráfico participa de capacitación',
      'Equipo de mantenimiento participa',
      'Equipo de RRHH participa',
      'Directivos participan',
      'Equipo legal/regulatorio participa',
    ],
  },
  {
    num: 4,
    titulo: 'Refinamiento y go-live formal',
    hito: 'Sistema 100% operativo · equipos trabajando autónomamente · soporte continuo activo',
    icon: <Rocket className="w-6 h-6" />,
    color: 'purple',
    proveedor: [
      'Refinamiento basado en feedback de la semana 3',
      'Configuración de cron jobs · refresh competidores · OTP · market penetration',
      'Configuración de notificaciones FCM para conductores',
      'Distribución de APK driver app',
      'Reunión de cierre de onboarding · handoff a soporte continuo',
    ],
    operador: [
      'Reporta lo que no funcionó como esperaba',
      'Conductores instalan APK',
      'Equipo firma acta de aceptación',
    ],
  },
];

const COMPARATIVA = [
  { plataforma: 'SkillRoute', tiempo: '2-4 semanas', highlight: true },
  { plataforma: 'Remix (Via)', tiempo: 'Días a 2 semanas (solo planning)' },
  { plataforma: 'Swiftly', tiempo: '1-3 meses' },
  { plataforma: 'Optibus', tiempo: '6-12 meses (operadores grandes)' },
  { plataforma: 'Trapeze', tiempo: '6-18 meses + consultoría' },
];

export default function OnboardingPage() {
  return (
    <div className="min-h-screen w-full bg-slate-950 text-slate-100 overflow-y-auto">
      {/* Header */}
      <header className="border-b border-slate-800/60 bg-slate-900/60 backdrop-blur sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 lg:px-8 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center font-black text-slate-950 text-lg">
              S
            </div>
            <span className="text-lg font-black tracking-tight">SkillRoute</span>
          </Link>
          <Link
            to="/pricing"
            className="text-sm font-medium text-slate-300 hover:text-white inline-flex items-center gap-1"
          >
            <ArrowLeft className="w-4 h-4" />
            Volver a Pricing
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-5xl mx-auto px-4 lg:px-8 py-12 lg:py-16 text-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-amber-400/30 bg-amber-950/30 px-4 py-1.5 text-xs font-bold text-amber-300 mb-6">
          <Clock className="w-3.5 h-3.5" />
          Onboarding 2-4 semanas — diferenciador comercial verificado
        </div>
        <h1 className="text-4xl lg:text-5xl font-black tracking-tight mb-5">
          De la firma del contrato a sistema operativo
          <span className="bg-gradient-to-r from-amber-400 to-amber-200 bg-clip-text text-transparent">
            {' '}
            en 4 semanas.
          </span>
        </h1>
        <p className="text-lg text-slate-400 max-w-3xl mx-auto leading-relaxed">
          La única plataforma end-to-end (planning + scheduling + operations +
          real-time + analytics) que se entrega en menos de un mes. Mientras
          Optibus o Trapeze toman 6-18 meses, SkillRoute pone tu sistema en
          producción en 4 semanas con datos reales de tu operador.
        </p>
      </section>

      {/* Por qué tan rápido */}
      <section className="bg-slate-900/40 border-y border-slate-800/60 py-12 lg:py-16">
        <div className="max-w-5xl mx-auto px-4 lg:px-8">
          <h2 className="text-2xl lg:text-3xl font-black mb-8 text-center">
            Por qué SkillRoute se entrega en semanas, no en meses
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {[
              {
                num: 1,
                titulo: 'Cloud-native multi-tenant',
                desc: 'No requiere instalación on-premise, no requiere hardware nuevo, no requiere servidores del operador. Todo corre en infra Firebase gestionada por nosotros.',
              },
              {
                num: 2,
                titulo: 'Pre-cargado para Montevideo',
                desc: 'Red de transporte metropolitano completo (UCOT + CUTCSA + COME + COETC) ya en el sistema. Para nuevos operadores fuera de Montevideo, importamos GTFS en pocos días.',
              },
              {
                num: 3,
                titulo: 'Cross-operador es feature, no proyecto',
                desc: 'Otros sistemas necesitan personalizar workflows por cada cliente. SkillRoute usa el mismo modelo de datos para todos los operadores — agregar uno es configuración, no desarrollo.',
              },
            ].map((d) => (
              <div
                key={d.num}
                className="rounded-xl border border-slate-800 bg-slate-950/40 p-5"
              >
                <div className="text-amber-400 font-black text-2xl mb-2">
                  {d.num}
                </div>
                <h3 className="font-black text-white mb-2">{d.titulo}</h3>
                <p className="text-sm text-slate-400 leading-relaxed">{d.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Timeline semana por semana */}
      <section className="max-w-6xl mx-auto px-4 lg:px-8 py-12 lg:py-16">
        <h2 className="text-3xl font-black text-center mb-3">
          Timeline detallado · semana por semana
        </h2>
        <p className="text-center text-slate-400 mb-10">
          Lo que hace el proveedor (SkillRoute) y lo que hace el operador en
          cada semana del onboarding.
        </p>

        <div className="space-y-6">
          {SEMANAS.map((s) => (
            <div
              key={s.num}
              className="rounded-2xl border border-slate-800 bg-slate-900/40 overflow-hidden"
            >
              <div
                className={`bg-gradient-to-r from-${s.color}-950/40 to-slate-900/40 border-b border-slate-800/60 p-5 lg:p-6`}
              >
                <div className="flex items-start gap-4">
                  <div
                    className={`w-12 h-12 rounded-xl bg-${s.color}-500/20 border border-${s.color}-400/40 flex items-center justify-center text-${s.color}-300 shrink-0`}
                  >
                    {s.icon}
                  </div>
                  <div className="flex-1">
                    <div className="text-xs uppercase tracking-wider font-bold text-slate-500 mb-1">
                      Semana {s.num}
                    </div>
                    <h3 className="text-xl lg:text-2xl font-black text-white">
                      {s.titulo}
                    </h3>
                  </div>
                </div>
                <div className="mt-4 ml-16 text-sm text-slate-300">
                  <span className="text-amber-400 font-bold uppercase tracking-wide text-xs mr-2">
                    Hito:
                  </span>
                  {s.hito}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-slate-800">
                <div className="p-5 lg:p-6">
                  <h4 className="text-xs uppercase tracking-wider font-bold text-emerald-400 mb-3">
                    🛠️ SkillRoute hace
                  </h4>
                  <ul className="space-y-2">
                    {s.proveedor.map((p, i) => (
                      <li
                        key={i}
                        className="flex gap-2 text-sm text-slate-300 items-start"
                      >
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                        <span>{p}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="p-5 lg:p-6 bg-slate-950/40">
                  <h4 className="text-xs uppercase tracking-wider font-bold text-amber-400 mb-3">
                    🤝 El operador hace
                  </h4>
                  <ul className="space-y-2">
                    {s.operador.map((p, i) => (
                      <li
                        key={i}
                        className="flex gap-2 text-sm text-slate-300 items-start"
                      >
                        <CheckCircle2 className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                        <span>{p}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Comparativa con líderes */}
      <section className="bg-slate-900/40 border-y border-slate-800/60 py-12 lg:py-16">
        <div className="max-w-4xl mx-auto px-4 lg:px-8">
          <h2 className="text-3xl font-black text-center mb-3">
            Comparativa con líderes mundiales
          </h2>
          <p className="text-center text-slate-400 mb-10">
            Tiempo típico de onboarding por plataforma · fuente: G2,
            Capterra, casos públicos.
          </p>

          <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950/40">
            <table className="w-full text-sm">
              <thead className="bg-slate-950/60 text-xs uppercase font-bold text-slate-400">
                <tr>
                  <th className="text-left px-4 py-3">Plataforma</th>
                  <th className="text-left px-4 py-3">Onboarding típico</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {COMPARATIVA.map((c, i) => (
                  <tr
                    key={i}
                    className={
                      c.highlight ? 'bg-amber-950/20 font-bold' : ''
                    }
                  >
                    <td className="px-4 py-3 text-white">{c.plataforma}</td>
                    <td className="px-4 py-3 text-slate-300">{c.tiempo}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Caso UCOT */}
      <section className="max-w-4xl mx-auto px-4 lg:px-8 py-12 lg:py-16">
        <h2 className="text-3xl font-black text-center mb-3">
          Caso UCOT · evidencia documentada
        </h2>
        <p className="text-center text-slate-400 mb-10 max-w-2xl mx-auto">
          UCOT es nuestra primera implementación. Operador real con 70 buses
          operando en el sistema metropolitano de Montevideo.
        </p>

        <div className="rounded-xl border border-slate-800 bg-slate-900/40 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-950/60 text-xs uppercase font-bold text-slate-400">
              <tr>
                <th className="text-left px-4 py-3">Hito</th>
                <th className="text-left px-4 py-3">Resultado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {[
                ['Kickoff inicial', 'OK'],
                ['Importación de GTFS UCOT (semana 1)', '70 líneas operativas + ~2.000 paradas'],
                ['Conexión a STM (GPS público IMM, semana 1-2)', 'Feed en vivo, ~70-300 buses visibles'],
                ['Datos operativos cargados (semana 2)', 'Personal + cartones + boletines + flota'],
                ['Capacitación a equipo UCOT (semana 3)', 'Tráfico, RRHH, mantenimiento, dirección'],
                ['Go-live (semana 4)', 'Sistema en operativa diaria'],
              ].map((row, i) => (
                <tr key={i}>
                  <td className="px-4 py-3 text-white">{row[0]}</td>
                  <td className="px-4 py-3 text-slate-300">{row[1]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="text-center text-xs text-slate-500 mt-6">
          Resultado actual (abril 2026): UCOT usa SkillRoute en producción para
          todas sus operaciones diarias — gestión de cartones, listero,
          inspecciones, monitoreo de flota, ShadowRadar cross-operador, KPIs
          ejecutivos.
        </p>
      </section>

      {/* Compromisos mutuos */}
      <section className="bg-slate-900/40 border-y border-slate-800/60 py-12 lg:py-16">
        <div className="max-w-5xl mx-auto px-4 lg:px-8">
          <h2 className="text-3xl font-black text-center mb-10">
            Compromisos mutuos
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="rounded-xl border border-emerald-400/30 bg-emerald-950/20 p-6">
              <h3 className="font-black text-emerald-300 mb-4 text-lg">
                Compromisos del proveedor (SkillRoute)
              </h3>
              <ul className="space-y-2">
                {[
                  'Disponibilidad de equipo de implementación durante las 4 semanas',
                  'Soporte 24/7 durante go-live (semana 4)',
                  'Documentación completa en español',
                  'Capacitación grabada (videos accesibles permanentemente)',
                  'Acceso a roadmap público',
                  <span key="sla">
                    SLA post-go-live: uptime 99.95% (ver{' '}
                    <Link to="/pricing/sla" className="text-amber-400 hover:underline font-bold">
                      SLA detallado
                    </Link>
                    ) · latencia GTFS-RT &lt; 5s
                  </span>,
                ].map((c, i) => (
                  <li
                    key={i}
                    className="flex gap-2 text-sm text-slate-300 items-start"
                  >
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    <span>{c}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-xl border border-amber-400/30 bg-amber-950/20 p-6">
              <h3 className="font-black text-amber-300 mb-4 text-lg">
                Compromisos del operador
              </h3>
              <ul className="space-y-2">
                {[
                  'Equipo asignado con dedicación >50% durante las 4 semanas',
                  'Datos básicos disponibles (personal, flota, líneas, paradas)',
                  'Decisión rápida en validaciones (sin bloqueos > 24h)',
                  'Apertura para capacitación (presencial o virtual)',
                  'Feedback constructivo durante refinamiento',
                ].map((c, i) => (
                  <li
                    key={i}
                    className="flex gap-2 text-sm text-slate-300 items-start"
                  >
                    <CheckCircle2 className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                    <span>{c}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* CTA final */}
      <section className="max-w-4xl mx-auto px-4 lg:px-8 py-14 lg:py-20 text-center">
        <h2 className="text-3xl lg:text-4xl font-black mb-4">
          ¿Empezamos?
        </h2>
        <p className="text-slate-400 mb-8 max-w-2xl mx-auto">
          El primer paso es una reunión de descubrimiento de 60 minutos. Sin
          compromiso. Sin SOW. Sin lock-in.
        </p>
        <a
          href={`mailto:jonathanlaluz@gmail.com?subject=${encodeURIComponent('SkillRoute - Onboarding - Reunión de descubrimiento')}`}
          className="inline-flex items-center gap-2 rounded-lg bg-amber-400 hover:bg-amber-300 px-6 py-3.5 font-bold text-slate-950 transition"
        >
          <Mail className="w-4 h-4" />
          jonathanlaluz@gmail.com
          <ArrowRight className="w-4 h-4" />
        </a>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-800/60 bg-slate-900/40 py-8">
        <div className="max-w-7xl mx-auto px-4 lg:px-8 text-center text-xs text-slate-500">
          <p>
            © 2026 SkillRoute · Onboarding 2-4 semanas · Documento público
            actualizado abril 2026.
          </p>
        </div>
      </footer>
    </div>
  );
}
