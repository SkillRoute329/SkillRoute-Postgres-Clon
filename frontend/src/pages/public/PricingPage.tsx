/**
 * PricingPage — página pública de pricing transparente de SkillRoute
 * ====================================================================
 * Diferenciador comercial vs Optibus, Swiftly, Remix, Trapeze, Cittati
 * (todos quote-based opaco). Ver docs/PRICING_PUBLICO.md para
 * justificación completa de tiers y comparativa con líderes mundiales.
 *
 * Ruta: /pricing (no autenticada — accesible por cualquier visitante).
 * Mobile-responsive (probado <480px).
 *
 * Sprint 1 entrega 1.1 del roadmap international-grade (2026-04-25).
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CheckCircle2,
  Building2,
  Users,
  Briefcase,
  Mail,
  ArrowRight,
  Globe,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';

interface Tier {
  id: string;
  name: string;
  tagline: string;
  pricePerBus: number;
  monthlyMin: number;
  busesRange: string;
  exampleAnnual: { buses: number; total: number }[];
  features: string[];
  highlighted?: boolean;
  cta: string;
  icon: React.ReactNode;
  iconColor: string;
}

const TIERS: Tier[] = [
  {
    id: 'basic',
    name: 'Básico',
    tagline: 'Operadores 50-150 buses',
    pricePerBus: 8,
    monthlyMin: 500,
    busesRange: '50 a 150 buses',
    exampleAnnual: [
      { buses: 50, total: 4800 },
      { buses: 100, total: 9600 },
      { buses: 150, total: 14400 },
    ],
    features: [
      'Todos los módulos de SkillRoute',
      'Onboarding 2-4 semanas con dedicación',
      'Soporte por email + chat (<24h hábiles)',
      'Driver app APK ilimitada',
      'Hasta 2.000 paradas, 100 líneas, 200 personas',
      'Cross-operador analytics si forma parte de sistema metropolitano',
      'SLA 99.95% uptime',
    ],
    cta: 'Reservar reunión de descubrimiento',
    icon: <Building2 className="w-7 h-7" />,
    iconColor: 'text-emerald-400',
  },
  {
    id: 'pro',
    name: 'Profesional',
    tagline: 'Operadores 150-500 buses',
    pricePerBus: 7,
    monthlyMin: 1500,
    busesRange: '150 a 500 buses',
    highlighted: true,
    exampleAnnual: [
      { buses: 200, total: 16800 },
      { buses: 350, total: 29400 },
      { buses: 500, total: 42000 },
    ],
    features: [
      'Todo lo del Tier Básico, más:',
      'Soporte prioritario por chat + voz (<8h hábiles)',
      'Customer Success Manager dedicado',
      'Hasta 10.000 paradas, 500 líneas, 1.000 personas',
      'Reportes regulatorios estructurados (STM/IMM/ANTT/CAF)',
      'Análisis Equity Latam Engine',
      'Capacitación on-site (1 visita anual incluida en LATAM)',
    ],
    cta: 'Reservar reunión de descubrimiento',
    icon: <Briefcase className="w-7 h-7" />,
    iconColor: 'text-amber-400',
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    tagline: 'Sistemas metropolitanos completos',
    pricePerBus: 6,
    monthlyMin: 5000,
    busesRange: '500+ buses · sistemas completos',
    exampleAnnual: [
      { buses: 700, total: 50400 },
      { buses: 1500, total: 108000 },
      { buses: 3000, total: 216000 },
    ],
    features: [
      'Todo lo del Tier Profesional, más:',
      'Soporte 24/7 (<1h respuesta crítica)',
      'CSM dedicado + arquitecto técnico',
      'Capacitaciones on-site sin límite (LATAM)',
      'Customización dashboards ejecutivos',
      'Integración con sistemas legacy (CAD/AVL, ticketing, ERPs)',
      'Análisis regulatorio para autoridades (IMM/STM/CAF/ANTT)',
      'Office Hours mensuales con el fundador',
      'SLA 99.99% uptime',
      'Ilimitado en paradas, líneas, personas',
    ],
    cta: 'Conversar sobre sistema metropolitano',
    icon: <Users className="w-7 h-7" />,
    iconColor: 'text-blue-400',
  },
];

function TierCard({ tier }: { tier: Tier }) {
  return (
    <div
      className={`flex flex-col rounded-2xl border ${
        tier.highlighted
          ? 'border-amber-400/60 bg-gradient-to-b from-amber-950/30 to-slate-900/60 shadow-2xl shadow-amber-900/20 ring-1 ring-amber-400/30'
          : 'border-slate-800 bg-slate-900/40'
      } p-6 lg:p-7 backdrop-blur-sm`}
    >
      {tier.highlighted && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <span className="rounded-full bg-amber-400 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-slate-950">
            Más elegido
          </span>
        </div>
      )}
      <div className="relative">
        <div className={`${tier.iconColor} mb-3`}>{tier.icon}</div>
        <h3 className="text-2xl font-black text-white">{tier.name}</h3>
        <p className="text-sm text-slate-400 mt-1">{tier.tagline}</p>
      </div>

      <div className="mt-6 mb-5">
        <div className="flex items-baseline gap-1">
          <span className="text-5xl font-black text-white">${tier.pricePerBus}</span>
          <span className="text-sm text-slate-400">USD / bus / mes</span>
        </div>
        <p className="text-xs text-slate-500 mt-1">
          Mínimo USD {tier.monthlyMin.toLocaleString()}/mes · {tier.busesRange}
        </p>
      </div>

      <div className="mb-6 rounded-lg bg-slate-950/60 border border-slate-800/60 p-4">
        <p className="text-[10px] uppercase tracking-wider font-bold text-slate-500 mb-2">
          Ejemplo anual
        </p>
        <ul className="space-y-1 text-xs">
          {tier.exampleAnnual.map((ex) => (
            <li key={ex.buses} className="flex justify-between text-slate-300">
              <span>{ex.buses} buses</span>
              <span className="font-mono font-bold text-white">
                USD {ex.total.toLocaleString()}/año
              </span>
            </li>
          ))}
        </ul>
      </div>

      <ul className="flex-1 space-y-2.5 mb-6">
        {tier.features.map((f, i) => (
          <li key={i} className="flex gap-2.5 text-sm text-slate-300 items-start">
            <CheckCircle2
              className={`w-4 h-4 ${tier.iconColor} shrink-0 mt-0.5`}
            />
            <span>{f}</span>
          </li>
        ))}
      </ul>

      <a
        href={`mailto:jonathanlaluz@gmail.com?subject=${encodeURIComponent(`SkillRoute - Tier ${tier.name} - Reunión de descubrimiento`)}`}
        className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-bold transition ${
          tier.highlighted
            ? 'bg-amber-400 text-slate-950 hover:bg-amber-300'
            : 'bg-slate-800 text-white hover:bg-slate-700 border border-slate-700'
        }`}
      >
        {tier.cta}
        <ArrowRight className="w-4 h-4" />
      </a>
    </div>
  );
}

export default function PricingPage() {
  const [showFAQ, setShowFAQ] = useState<string | null>(null);

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
            to="/login"
            className="text-sm font-medium text-slate-300 hover:text-white"
          >
            Iniciar sesión
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-7xl mx-auto px-4 lg:px-8 py-12 lg:py-20 text-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-950/30 px-4 py-1.5 text-xs font-bold text-emerald-300 mb-6">
          <Sparkles className="w-3.5 h-3.5" />
          Pricing transparente — único en la industria
        </div>
        <h1 className="text-4xl lg:text-6xl font-black tracking-tight mb-5 max-w-4xl mx-auto">
          Inteligencia de transporte público
          <span className="bg-gradient-to-r from-amber-400 to-amber-200 bg-clip-text text-transparent">
            {' '}
            a precio que tu operador puede pagar.
          </span>
        </h1>
        <p className="text-lg lg:text-xl text-slate-400 max-w-3xl mx-auto leading-relaxed">
          Optibus, Swiftly, Remix, Trapeze son referencias mundiales — pero su
          pricing es opaco y excluye a operadores chicos y medianos. SkillRoute
          publica precios reales, en USD, con tiers claros por cantidad de buses.
        </p>
        <div className="mt-8 flex items-center justify-center gap-3 text-sm">
          <Link
            to="/pricing/onboarding"
            className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900/40 hover:bg-slate-800/40 px-4 py-2 text-slate-300 hover:text-white transition"
          >
            Ver proceso de onboarding (2-4 semanas)
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>

      {/* Tiers */}
      <section className="max-w-7xl mx-auto px-4 lg:px-8 pb-12">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8 relative">
          {TIERS.map((t) => (
            <TierCard key={t.id} tier={t} />
          ))}
        </div>

        <p className="text-center text-xs text-slate-500 mt-8 max-w-2xl mx-auto">
          Pricing en USD · ajuste anual máximo 7% · pago anual con descuento 10%
          · compromiso 3 años descuento adicional 10% · cooperativas asociadas
          15% off contratando en conjunto.
        </p>
      </section>

      {/* Diferenciadores estructurales */}
      <section className="bg-slate-900/40 border-y border-slate-800/60 py-14 lg:py-20">
        <div className="max-w-7xl mx-auto px-4 lg:px-8">
          <h2 className="text-3xl lg:text-4xl font-black text-center mb-3">
            Qué hace SkillRoute que ningún otro hace
          </h2>
          <p className="text-center text-slate-400 mb-12 max-w-2xl mx-auto">
            Cinco diferenciadores estructurales confirmados en auditoría
            competitiva contra los líderes mundiales.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {[
              {
                title: 'Cross-operador en tiempo real',
                desc: 'Único en el mundo. Detecta bunching, gapping, overlap improductivo entre operadores que comparten corredor. Optibus/Swiftly/Remix son single-tenant.',
                icon: <Globe className="w-6 h-6 text-amber-400" />,
              },
              {
                title: 'Pricing público transparente',
                desc: 'Sabés cuánto cuesta antes de pedir cotización. Cero fricción de evaluación.',
                icon: <CheckCircle2 className="w-6 h-6 text-emerald-400" />,
              },
              {
                title: 'Onboarding 2-4 semanas',
                desc: 'No 6-18 meses como Trapeze ni 3-12 como Optibus. Sistema operativo en 4 semanas.',
                icon: <Sparkles className="w-6 h-6 text-blue-400" />,
              },
              {
                title: 'Multi-tenancy nativa',
                desc: 'Diseñado desde origen para sistemas metropolitanos completos. No es un patch sobre arquitectura single-tenant.',
                icon: <Users className="w-6 h-6 text-purple-400" />,
              },
              {
                title: 'Análisis regulatorio para autoridades',
                desc: 'Dossier exportable preparado para IMM/STM/CAF/ANTT. Único producto que atiende al regulador, no solo al operador.',
                icon: <ShieldCheck className="w-6 h-6 text-rose-400" />,
              },
              {
                title: 'Español nativo + adaptación regional',
                desc: 'Diseñado para Uruguay/Argentina/Chile/Colombia/México. Cumple Ley 18.331 Uruguay y normativa local.',
                icon: <Globe className="w-6 h-6 text-cyan-400" />,
              },
            ].map((d, i) => (
              <div
                key={i}
                className="rounded-xl border border-slate-800 bg-slate-950/40 p-5"
              >
                <div className="mb-3">{d.icon}</div>
                <h3 className="font-black text-white mb-1.5">{d.title}</h3>
                <p className="text-sm text-slate-400 leading-relaxed">{d.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Comparativa */}
      <section className="max-w-6xl mx-auto px-4 lg:px-8 py-14 lg:py-20">
        <h2 className="text-3xl lg:text-4xl font-black text-center mb-3">
          Comparativa con líderes mundiales
        </h2>
        <p className="text-center text-slate-400 mb-10">
          Operador 200 buses · costo anual estimado.
        </p>

        <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900/40">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-950/60 text-xs uppercase font-bold text-slate-400">
              <tr>
                <th className="px-4 py-3">Plataforma</th>
                <th className="px-4 py-3 text-right">Anual estimado</th>
                <th className="px-4 py-3 text-center">Pricing público</th>
                <th className="px-4 py-3 text-center">Cross-op</th>
                <th className="px-4 py-3 text-center">Onboarding</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {[
                {
                  name: 'SkillRoute Profesional',
                  cost: 'USD 16.800',
                  pub: '✅',
                  xop: '✅',
                  ob: '2-4 semanas',
                  highlight: true,
                },
                { name: 'Optibus', cost: 'USD 80-200K', pub: '❌', xop: '❌', ob: '6-12 meses' },
                { name: 'Swiftly', cost: 'USD 80-150K', pub: '❌', xop: '❌', ob: '1-3 meses' },
                { name: 'Remix (Via)', cost: 'USD 40-80K', pub: '❌', xop: '❌', ob: '1-2 semanas (planning)' },
                { name: 'Trapeze', cost: 'USD 100-300K', pub: '❌', xop: '❌', ob: '6-18 meses' },
                { name: 'Cittati (Brasil)', cost: 'USD 30-90K', pub: '❌', xop: '❌', ob: '1-3 meses' },
              ].map((row, i) => (
                <tr
                  key={i}
                  className={
                    row.highlight
                      ? 'bg-amber-950/20 font-bold'
                      : 'hover:bg-slate-900/40'
                  }
                >
                  <td className="px-4 py-3 text-white">{row.name}</td>
                  <td className="px-4 py-3 text-right font-mono">{row.cost}</td>
                  <td className="px-4 py-3 text-center">{row.pub}</td>
                  <td className="px-4 py-3 text-center">{row.xop}</td>
                  <td className="px-4 py-3 text-slate-300">{row.ob}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="text-center text-xs text-slate-500 mt-4 max-w-2xl mx-auto">
          Costos de líderes mundiales son estimaciones de licitaciones públicas
          y reviews G2/Capterra (los líderes no publican pricing oficial).
        </p>
      </section>

      {/* FAQ corto */}
      <section className="bg-slate-900/40 border-y border-slate-800/60 py-14 lg:py-20">
        <div className="max-w-3xl mx-auto px-4 lg:px-8">
          <h2 className="text-3xl font-black text-center mb-10">
            Preguntas frecuentes
          </h2>

          {[
            {
              q: '¿Por qué publicar pricing si los líderes mundiales no lo hacen?',
              a: 'Porque queremos eliminar la fricción de evaluación. Operadores chicos y medianos hoy no piden cotización a Optibus o Trapeze porque saben que el pricing está fuera de su alcance. Publicar precios elimina esa barrera y permite que cualquier operador evalúe con datos reales.',
            },
            {
              q: '¿Qué pasa si mi operador tiene 800 buses, fuera de los rangos publicados?',
              a: 'El pricing del Tier Enterprise es punto de partida; sobre 1.000 buses negociamos según volumen y compromiso. Reservá una reunión de descubrimiento — la respuesta directa del fundador es parte de la propuesta.',
            },
            {
              q: '¿El pricing incluye soporte y mantenimiento?',
              a: 'Sí. Soporte, mantenimiento, actualizaciones, hosting, infra y cuentas Firebase están todas incluidas. El operador no paga extra por nada de eso.',
            },
            {
              q: '¿Qué incluye exactamente "todos los módulos"?',
              a: 'Planning, scheduling, rostering, operaciones diarias, control en tiempo real, AVL, OTP Dashboard, ShadowRadar cross-operador, MarketPenetration, EAM (asset management), driver app APK, dashboards ejecutivos, reportes regulatorios y todo lo demás. La diferencia entre tiers es volumen y nivel de soporte, no acceso a features.',
            },
            {
              q: '¿Qué moneda?',
              a: 'USD por predictibilidad cambiaria. La conversión a moneda local se hace al contratar y se ajusta anualmente por IPC USA (máximo 7% anual). Operadores en países con tipo de cambio adverso pueden negociar caso por caso.',
            },
            {
              q: '¿Hay descuento si pago anual?',
              a: 'Sí: 10% de descuento por pago anual. Compromiso 3 años suma otro 10% (total 20% off). Cooperativas asociadas que contraten en conjunto: 15% adicional.',
            },
          ].map((faq) => (
            <div
              key={faq.q}
              className="border-b border-slate-800 last:border-b-0"
            >
              <button
                onClick={() =>
                  setShowFAQ(showFAQ === faq.q ? null : faq.q)
                }
                className="w-full text-left flex items-center justify-between gap-4 py-4 hover:text-amber-300 transition"
              >
                <span className="font-bold">{faq.q}</span>
                <span
                  className={`transition-transform text-xl text-amber-400 ${
                    showFAQ === faq.q ? 'rotate-45' : ''
                  }`}
                >
                  +
                </span>
              </button>
              {showFAQ === faq.q && (
                <p className="pb-4 text-sm text-slate-400 leading-relaxed">
                  {faq.a}
                </p>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* CTA final */}
      <section className="max-w-4xl mx-auto px-4 lg:px-8 py-14 lg:py-20 text-center">
        <h2 className="text-3xl lg:text-4xl font-black mb-4">
          ¿Te interesa? Empezamos por una conversación de 60 minutos.
        </h2>
        <p className="text-slate-400 mb-8 max-w-2xl mx-auto">
          Sin compromiso. Sin SOW. Sin lock-in. Solo entender tu situación,
          encaje con SkillRoute y plan tentativo.
        </p>
        <a
          href="mailto:jonathanlaluz@gmail.com?subject=SkillRoute%20-%20Reuni%C3%B3n%20de%20descubrimiento"
          className="inline-flex items-center gap-2 rounded-lg bg-amber-400 hover:bg-amber-300 px-6 py-3.5 font-bold text-slate-950 transition"
        >
          <Mail className="w-4 h-4" />
          jonathanlaluz@gmail.com
          <ArrowRight className="w-4 h-4" />
        </a>
        <p className="text-xs text-slate-500 mt-6">
          La respuesta directa del fundador es parte de la propuesta.
        </p>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-800/60 bg-slate-900/40 py-8">
        <div className="max-w-7xl mx-auto px-4 lg:px-8 text-center text-xs text-slate-500">
          <p>
            © 2026 SkillRoute · Inteligencia de transporte público para sistemas
            metropolitanos completos.
          </p>
          <p className="mt-2">
            Pricing v1.0 publicado 2026-04-25 · Próxima revisión: octubre 2026.
          </p>
        </div>
      </footer>
    </div>
  );
}
