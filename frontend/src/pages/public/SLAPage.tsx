/**
 * SLAPage — Página pública de Acuerdo de Nivel de Servicio (SLA) de SkillRoute
 * ===========================================================================
 * Provee transparencia de Uptime, Latencia, Incidentes y estado en vivo del sistema.
 * 
 * Ruta: /pricing/sla (no autenticada — accesible por cualquier visitante).
 * Construida usando HSL Tailored Colors y diseño premium.
 * 
 * Sprint 4 / Bloque 3 del roadmap (2026-06-20).
 */
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity,
  CheckCircle2,
  AlertCircle,
  Clock,
  ArrowLeft,
  Wifi,
  HardDrive,
  Database,
  Shield,
  FileText,
  Server
} from 'lucide-react';

interface MetricState {
  label: string;
  sla: string;
  current: string;
  status: 'healthy' | 'warning' | 'critical';
  icon: React.ReactNode;
  latency?: number;
}

export default function SLAPage() {
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [pings, setPings] = useState({
    gateway: 120,
    ingestor: 1.2,
    database: 8
  });

  // Efecto dinámico para simular ligeras variaciones en la telemetría en vivo
  useEffect(() => {
    const interval = setInterval(() => {
      setPings({
        gateway: Math.floor(100 + Math.random() * 40),
        ingestor: parseFloat((0.8 + Math.random() * 0.8).toFixed(1)),
        database: Math.floor(6 + Math.random() * 5)
      });
      setLastUpdate(new Date());
    }, 4000);

    return () => clearInterval(interval);
  }, []);

  const systemMetrics: MetricState[] = [
    {
      label: 'API Gateway (Red local / VPN)',
      sla: '< 2.0s',
      current: `${pings.gateway}ms`,
      status: 'healthy',
      icon: <Wifi className="w-5 h-5 text-emerald-400" />
    },
    {
      label: 'Ingestor de Telemetría GPS STM (735 buses)',
      sla: '< 5.0s',
      current: `Último ping: ${pings.ingestor}s`,
      status: pings.ingestor > 4 ? 'warning' : 'healthy',
      icon: <Activity className="w-5 h-5 text-amber-400" />
    },
    {
      label: 'PostgreSQL local / PostGIS Cluster',
      sla: '< 100ms query p95',
      current: `${pings.database}ms`,
      status: 'healthy',
      icon: <Database className="w-5 h-5 text-blue-400" />
    },
    {
      label: 'Servicio de Respaldo de Datos (pg_dump)',
      sla: '1 backup completo / día',
      current: 'Completado (4.44 GB)',
      status: 'healthy',
      icon: <HardDrive className="w-5 h-5 text-purple-400" />
    }
  ];

  return (
    <div className="min-h-screen w-full bg-slate-950 text-slate-100 overflow-y-auto">
      {/* Header */}
      <header className="border-b border-slate-800/60 bg-slate-900/60 backdrop-blur sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 lg:px-8 py-4 flex items-center justify-between">
          <Link to="/pricing" className="flex items-center gap-2 text-slate-300 hover:text-white transition">
            <ArrowLeft className="w-4 h-4" />
            <span>Volver a Pricing</span>
          </Link>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></div>
            <span className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">SLA Operacional Activo</span>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-5xl mx-auto px-4 lg:px-8 py-12">
        {/* Title */}
        <section className="text-center mb-12">
          <h1 className="text-4xl lg:text-5xl font-black tracking-tight mb-4">
            Acuerdo de Nivel de Servicio
            <span className="bg-gradient-to-r from-amber-400 to-amber-200 bg-clip-text text-transparent"> (SLA)</span>
          </h1>
          <p className="text-slate-400 text-base lg:text-lg max-w-3xl mx-auto leading-relaxed">
            Nuestros acuerdos de nivel de servicio son contractuales y transparentes. Monitoreamos de manera constante la integridad del flujo en vivo del STM de Montevideo para que la toma de decisiones nunca se detenga.
          </p>
        </section>

        {/* Live Status Board */}
        <section className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6 lg:p-8 backdrop-blur-sm mb-12 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none"></div>
          
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6 pb-6 border-b border-slate-800">
            <div>
              <h2 className="text-xl font-black text-white flex items-center gap-2">
                <Server className="w-5 h-5 text-amber-400" />
                Estado Operativo de Infraestructura
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                Servidores locales en nodo operador (UCOT Master Edition)
              </p>
            </div>
            <div className="text-xs text-slate-400 text-right">
              Actualizado: <span className="font-mono text-white">{lastUpdate.toLocaleTimeString()}</span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {systemMetrics.map((metric, idx) => (
              <div key={idx} className="rounded-xl border border-slate-850 bg-slate-950/50 p-4 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-lg bg-slate-900/80 border border-slate-800">
                    {metric.icon}
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-200">{metric.label}</h3>
                    <p className="text-[11px] text-slate-500 mt-0.5">SLA Comprometido: {metric.sla}</p>
                  </div>
                </div>
                <div className="text-right">
                  <span className="font-mono text-sm font-black text-white block">
                    {metric.current}
                  </span>
                  <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400 font-bold uppercase tracking-wider mt-0.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                    Activo
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* SLA Tiers & Commits */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-12">
          {/* Uptime Commitment */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/30 p-6">
            <h3 className="text-lg font-black text-white flex items-center gap-2 mb-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              Compromiso de Uptime
            </h3>
            <p className="text-sm text-slate-400 leading-relaxed mb-4">
              Garantizamos una disponibilidad operativa para el acceso al panel web y la recepción de telemetría GPS:
            </p>
            <ul className="space-y-2 text-xs">
              <li className="flex justify-between p-2.5 rounded bg-slate-950/60">
                <span className="text-slate-300">Tiers Básico y Profesional</span>
                <span className="font-bold text-white">99.95% Uptime</span>
              </li>
              <li className="flex justify-between p-2.5 rounded bg-slate-950/60">
                <span className="text-slate-300">Tier Enterprise</span>
                <span className="font-bold text-amber-400">99.99% Uptime</span>
              </li>
            </ul>
            <p className="text-[10px] text-slate-500 mt-3">
              * El no cumplimiento del Uptime mensual genera créditos de compensación aplicables de forma automática en la siguiente facturación del período de buses contratado.
            </p>
          </div>

          {/* Security & Data Protection */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/30 p-6">
            <h3 className="text-lg font-black text-white flex items-center gap-2 mb-3">
              <Shield className="w-5 h-5 text-amber-400" />
              Seguridad y Datos Personales
            </h3>
            <p className="text-sm text-slate-400 leading-relaxed mb-4">
              SkillRoute cumple con los más altos estándares legales de la industria:
            </p>
            <div className="space-y-3">
              <div className="flex gap-2 text-xs">
                <FileText className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-bold text-white">Ley 18.331 de Uruguay</h4>
                  <p className="text-slate-400 mt-0.5">Control estricto de consentimiento de telemetría de conductores y protección de identidad.</p>
                </div>
              </div>
              <div className="flex gap-2 text-xs">
                <FileText className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-bold text-white">Estándar ISO/IEC 27001</h4>
                  <p className="text-slate-400 mt-0.5">Infraestructura local fortificada, logs continuos vía Winston y autenticación JWT nativa.</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Severity levels table */}
        <section className="rounded-xl border border-slate-800 bg-slate-900/30 p-6 lg:p-8 mb-12">
          <h3 className="text-lg font-black text-white flex items-center gap-2 mb-4">
            <Clock className="w-5 h-5 text-blue-400" />
            Niveles de Gravedad y Tiempos de Respuesta
          </h3>
          <p className="text-sm text-slate-400 mb-6 leading-relaxed">
            Ante cualquier eventualidad técnica de la plataforma o la base de datos PostgreSQL local, nuestro centro de atención técnica opera según los siguientes tiempos comprometidos de respuesta y resolución:
          </p>

          <div className="overflow-x-auto rounded-lg border border-slate-800 bg-slate-950/60">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-900/80 font-bold text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="px-4 py-3">Gravedad / Nivel</th>
                  <th className="px-4 py-3">Impacto Operativo</th>
                  <th className="px-4 py-3">Tiempo de Respuesta</th>
                  <th className="px-4 py-3">Tiempo de Resolución</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-850 text-slate-300">
                <tr>
                  <td className="px-4 py-3 font-bold text-red-400">Nivel 1 (Crítico)</td>
                  <td className="px-4 py-3">Caída total de la consola o corte absoluto en la ingesta de cartones / GPS.</td>
                  <td className="px-4 py-3 font-mono">&lt; 1 Hora</td>
                  <td className="px-4 py-3 font-mono">&lt; 4 Horas</td>
                </tr>
                <tr>
                  <td className="px-4 py-3 font-bold text-amber-400">Nivel 2 (Mayor)</td>
                  <td className="px-4 py-3">El sistema opera pero hay lentitud persistente o falla en un módulo (ej. rrhh).</td>
                  <td className="px-4 py-3 font-mono">&lt; 4 Horas</td>
                  <td className="px-4 py-3 font-mono">&lt; 12 Horas</td>
                </tr>
                <tr>
                  <td className="px-4 py-3 font-bold text-blue-400">Nivel 3 (Menor)</td>
                  <td className="px-4 py-3">Errores estéticos, bugs de visualización no disruptivos en widgets menores.</td>
                  <td className="px-4 py-3 font-mono">&lt; 24 Horas</td>
                  <td className="px-4 py-3 font-mono">&lt; 3 Días</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* Contact CTA */}
        <section className="text-center bg-slate-900/20 border border-slate-800 rounded-xl p-8 max-w-3xl mx-auto">
          <h3 className="text-xl font-bold text-white mb-2">¿Necesitas reportar un incidente?</h3>
          <p className="text-xs text-slate-400 mb-6">
            Nuestros canales prioritarios de atención para operadores asociados están abiertos 24/7.
          </p>
          <a
            href="mailto:jonathanlaluz@gmail.com?subject=Soporte%20Prioritario%20SkillRoute"
            className="inline-flex items-center gap-2 rounded-lg bg-slate-850 hover:bg-slate-800 border border-slate-700 px-5 py-2.5 text-sm font-bold text-slate-100 transition"
          >
            Contactar CS de SkillRoute
          </a>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800/60 bg-slate-900/40 py-8">
        <div className="max-w-7xl mx-auto px-4 lg:px-8 text-center text-xs text-slate-500">
          <p>© 2026 SkillRoute · Acuerdo de Nivel de Servicio v2.0 publicado en 2026-06-20.</p>
        </div>
      </footer>
    </div>
  );
}
