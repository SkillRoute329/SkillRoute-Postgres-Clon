import React from 'react';
import { Link } from 'react-router-dom';
import { 
  Bus, 
  Map, 
  Activity, 
  ShieldCheck, 
  Network, 
  Sparkles, 
  ArrowRight,
  TrendingUp,
  Clock,
  Layers,
  Wrench
} from 'lucide-react';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-cyan-500/30">
      
      {/* Navbar */}
      <nav className="fixed top-0 w-full z-50 bg-slate-950/80 backdrop-blur-md border-b border-slate-800/60">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-cyan-400 to-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-cyan-500/20">
              <Bus className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-black tracking-tight text-white">
              Skill<span className="text-cyan-400">Route</span>
            </span>
          </div>
          
          <div className="hidden md:flex items-center gap-8 text-sm font-semibold text-slate-300">
            <a href="#features" className="hover:text-cyan-400 transition-colors">Plataforma</a>
            <a href="#diferenciadores" className="hover:text-cyan-400 transition-colors">Cross-Op Intelligence</a>
            <Link to="/pricing" className="hover:text-cyan-400 transition-colors">Pricing</Link>
          </div>

          <div className="flex items-center gap-4">
            <Link 
              to="/login" 
              className="text-sm font-bold text-slate-300 hover:text-white transition-colors"
            >
              Iniciar Sesión
            </Link>
            <Link 
              to="/pricing" 
              className="px-5 py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-bold rounded-lg transition-all shadow-lg shadow-cyan-500/20 flex items-center gap-2"
            >
              Agenda Demo <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative pt-32 pb-20 lg:pt-48 lg:pb-32 overflow-hidden">
        {/* Glow Effects */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-cyan-500/20 blur-[120px] rounded-full pointer-events-none" />
        
        <div className="max-w-7xl mx-auto px-6 relative z-10 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-900 border border-slate-800 text-cyan-400 text-xs font-bold uppercase tracking-widest mb-8">
            <Sparkles className="w-3.5 h-3.5" />
            El estándar para el Transporte Público Metropolitano
          </div>
          
          <h1 className="text-5xl lg:text-7xl font-black tracking-tight leading-tight mb-8">
            Operativa de Flotas, <br/>
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-500">
              Elevada a la Potencia de la IA.
            </span>
          </h1>
          
          <p className="text-lg lg:text-xl text-slate-400 max-w-3xl mx-auto leading-relaxed mb-10">
            SkillRoute consolida planificación (DRO), mantenimiento (EAM), análisis en tiempo real y compliance normativo en un único cerebro digital. Diseñado específicamente para operadores de Montevideo y Latam.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link 
              to="/pricing" 
              className="w-full sm:w-auto px-8 py-4 bg-white text-slate-950 hover:bg-slate-200 text-sm font-black uppercase tracking-wider rounded-xl transition-all"
            >
              Ver Planes B2B
            </Link>
            <Link 
              to="/login" 
              className="w-full sm:w-auto px-8 py-4 bg-slate-900 border border-slate-700 hover:border-cyan-500/50 hover:bg-slate-800 text-white text-sm font-black uppercase tracking-wider rounded-xl transition-all flex items-center justify-center gap-2"
            >
              Acceso Operador <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* Logos Strip (Simulando empresas) */}
      <section className="border-y border-slate-800/60 bg-slate-900/30 py-8">
        <div className="max-w-7xl mx-auto px-6 flex flex-wrap justify-center items-center gap-12 opacity-50 grayscale">
          <span className="text-xl font-black tracking-tighter">UCOT</span>
          <span className="text-xl font-black tracking-tighter">CUTCSA</span>
          <span className="text-xl font-black tracking-tighter">COME</span>
          <span className="text-xl font-black tracking-tighter">COETC</span>
          <span className="text-xl font-black tracking-tighter">IMM (STM)</span>
        </div>
      </section>

      {/* Value Proposition / Features */}
      <section id="features" className="py-24 relative">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl lg:text-4xl font-black mb-4">¿Por qué SkillRoute?</h2>
            <p className="text-slate-400 max-w-2xl mx-auto">
              Superamos a competidores internacionales (Swiftly, Optibus) integrando las capas que realmente importan en la operativa diaria de nuestra región.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            <FeatureCard 
              icon={Network} 
              title="Inteligencia Cross-Operador"
              desc="Única plataforma capaz de detectar el impacto de líneas competidoras (Headway, Bunching) en corredores compartidos."
            />
            <FeatureCard 
              icon={Activity} 
              title="Predicciones IA en Tiempo Real"
              desc="Modelos de Machine Learning predictivos que estiman ETAs y detectan cuellos de botella antes de que afecten la rentabilidad."
            />
            <FeatureCard 
              icon={Layers} 
              title="Planificación Dinámica (DRO)"
              desc="Optimice diagramas, roles de servicio, descansos y distribución de la flota en minutos, no en horas."
            />
            <FeatureCard 
              icon={Wrench} 
              title="Mantenimiento Predictivo (EAM)"
              desc="Gestión de ciclo de vida de la flota. Control de órdenes de trabajo, MTBF y MTTR matemáticamente trazables."
            />
            <FeatureCard 
              icon={ShieldCheck} 
              title="Compliance Nativo (IMM)"
              desc="Preparado out-of-the-box para auditorías regulatorias, cumplimiento de la Ley 18.331 y estándares ISO."
            />
            <FeatureCard 
              icon={Map} 
              title="Map Hub Unificado"
              desc="Visualización geoespacial de toda la operativa. FMS, telemetría y eventos en un panel táctico global."
            />
          </div>
        </div>
      </section>

      {/* Comparativa / "SkillRoute vs The World" */}
      <section id="diferenciadores" className="py-24 bg-slate-900 border-y border-slate-800 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-1/2 h-full bg-gradient-to-l from-cyan-900/20 to-transparent pointer-events-none" />
        
        <div className="max-w-7xl mx-auto px-6 flex flex-col lg:flex-row items-center gap-16">
          <div className="flex-1 space-y-6">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded bg-blue-500/10 text-blue-400 text-[10px] font-black uppercase tracking-widest border border-blue-500/20">
              The Moat
            </div>
            <h2 className="text-4xl font-black">SkillRoute vs The World</h2>
            <p className="text-slate-400 leading-relaxed text-lg">
              Mientras soluciones de clase mundial ofrecen analítica en silos para un solo operador, SkillRoute fue diseñado desde el día cero como un <strong>Sistema Metropolitano</strong>.
            </p>
            <ul className="space-y-4 pt-4">
              <li className="flex items-center gap-3 text-slate-300">
                <CheckIcon /> Vista panorámica de competidores en tu corredor.
              </li>
              <li className="flex items-center gap-3 text-slate-300">
                <CheckIcon /> Ajuste de turnos a normativas laborales uruguayas.
              </li>
              <li className="flex items-center gap-3 text-slate-300">
                <CheckIcon /> Generación de archivo maestro y reportes regulatorios en 1 clic.
              </li>
            </ul>
          </div>
          
          <div className="flex-1 w-full bg-slate-950 border border-slate-800 rounded-2xl p-6 shadow-2xl relative">
            <div className="absolute -top-3 -right-3 w-24 h-24 bg-cyan-500/20 blur-xl rounded-full" />
            <div className="flex justify-between items-center mb-6 border-b border-slate-800 pb-4">
              <span className="text-sm font-bold text-slate-400">Puntaje Matriz Funcional</span>
              <span className="text-xs font-black text-cyan-400 bg-cyan-500/10 px-2 py-1 rounded">2026 Q2</span>
            </div>
            
            <div className="space-y-4">
              <Bar label="SkillRoute" value={80} isPrimary />
              <Bar label="Optibus" value={65} />
              <Bar label="Swiftly" value={62} />
              <Bar label="Trapeze" value={58} />
              <Bar label="Cittati" value={45} />
            </div>
          </div>
        </div>
      </section>

      {/* CTA Footer */}
      <footer className="py-24 text-center">
        <div className="max-w-3xl mx-auto px-6">
          <h2 className="text-3xl lg:text-5xl font-black mb-6">Listos para transformar la movilidad</h2>
          <p className="text-slate-400 mb-10 text-lg">
            Súmese al estándar de operaciones que unifica tecnología de punta y adaptabilidad al mercado latinoamericano.
          </p>
          <div className="flex justify-center gap-4">
            <Link to="/pricing" className="px-8 py-4 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded-xl transition-all">
              Ver Tiers B2B
            </Link>
            <a href="mailto:jonathan@skillroute.com" className="px-8 py-4 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-xl transition-all">
              Contactar Ventas
            </a>
          </div>
        </div>
        
        <div className="mt-24 pt-8 border-t border-slate-800/60 max-w-7xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-4 text-xs text-slate-500 font-semibold">
          <div className="flex items-center gap-2">
            <Bus className="w-4 h-4 text-slate-600" />
            © 2026 SkillRoute. Todos los derechos reservados.
          </div>
          <div className="flex gap-6">
            <Link to="/pricing/sla" className="hover:text-slate-300">SLA & Uptime</Link>
            <Link to="/pricing/onboarding" className="hover:text-slate-300">Onboarding</Link>
            <a href="#" className="hover:text-slate-300">Privacidad Ley 18.331</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({ icon: Icon, title, desc }: { icon: any, title: string, desc: string }) {
  return (
    <div className="bg-slate-900/50 border border-slate-800 p-8 rounded-2xl hover:bg-slate-800/50 transition-colors group">
      <div className="w-12 h-12 bg-slate-800 rounded-xl flex items-center justify-center mb-6 group-hover:bg-cyan-500/10 group-hover:text-cyan-400 transition-colors">
        <Icon className="w-6 h-6 text-slate-400 group-hover:text-cyan-400 transition-colors" />
      </div>
      <h3 className="text-xl font-bold mb-3">{title}</h3>
      <p className="text-sm text-slate-400 leading-relaxed">{desc}</p>
    </div>
  );
}

function CheckIcon() {
  return (
    <div className="w-5 h-5 rounded-full bg-cyan-500/20 flex items-center justify-center shrink-0">
      <div className="w-2 h-2 rounded-full bg-cyan-400" />
    </div>
  );
}

function Bar({ label, value, isPrimary = false }: { label: string, value: number, isPrimary?: boolean }) {
  return (
    <div>
      <div className="flex justify-between text-xs font-bold mb-1.5">
        <span className={isPrimary ? "text-cyan-400" : "text-slate-400"}>{label}</span>
        <span className={isPrimary ? "text-cyan-400" : "text-slate-500"}>{value}/100</span>
      </div>
      <div className="h-2 bg-slate-900 rounded-full overflow-hidden">
        <div 
          className={`h-full rounded-full ${isPrimary ? 'bg-gradient-to-r from-cyan-400 to-blue-500' : 'bg-slate-700'}`}
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}
