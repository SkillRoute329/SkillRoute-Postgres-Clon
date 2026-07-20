import React from 'react';
import { Award, Star, BarChart3, Layers, CheckCircle, Building2 } from 'lucide-react';
import { PROPUESTA_ASM } from '../../data/brtData';

export default function TabPropuesta() {
  return (
    <div className="space-y-5">
      {/* Hero */}
      <div className="bg-gradient-to-r from-primary-900/40 to-slate-900 rounded-2xl border border-primary-700/40 p-6">
        <div className="flex items-start gap-4">
          <div className="w-14 h-14 rounded-2xl bg-primary-600/30 border border-primary-500/50 flex items-center justify-center shrink-0">
            <Award className="w-8 h-8 text-primary-400" />
          </div>
          <div>
            <h2 className="text-2xl font-black text-white">{PROPUESTA_ASM.titulo}</h2>
            <p className="text-primary-300 mt-1">{PROPUESTA_ASM.subtitulo}</p>
          </div>
        </div>
      </div>

      {/* Ventajas competitivas */}
      <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-800">
          <p className="font-bold text-sm flex items-center gap-2">
            <Star className="w-4 h-4 text-amber-400" /> ¿Por qué UCOT es el operador natural del BRT?
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-0 divide-y md:divide-y-0 md:divide-x divide-slate-800">
          {PROPUESTA_ASM.ventajasCompetitivas.map(v => (
            <div key={v.titulo} className="p-4 border-b border-slate-800/50">
              <p className="font-bold text-white text-sm flex items-center gap-2">
                <span className="text-xl">{v.icono}</span> {v.titulo}
              </p>
              <p className="text-slate-400 text-xs mt-1 leading-relaxed">{v.detalle}</p>
            </div>
          ))}
        </div>
      </div>

      {/* 3 opciones de negocio */}
      <div>
        <p className="text-xs text-slate-500 uppercase font-bold mb-3">3 modelos de participación posibles</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {Object.values(PROPUESTA_ASM.modeloComercial).map((op, i) => (
            <div key={op.nombre} className={`bg-slate-900 rounded-xl border overflow-hidden ${
              i === 1 ? 'border-primary-600/60' : 'border-slate-700'
            }`}>
              {i === 1 && (
                <div className="bg-primary-600 px-3 py-1 text-center">
                  <p className="text-white text-xs font-black">RECOMENDADO</p>
                </div>
              )}
              <div className="p-4">
                <p className="font-bold text-white text-sm">{op.nombre}</p>
                <p className="text-slate-400 text-xs mt-1.5 leading-relaxed">{op.descripcion}</p>
                <div className="mt-4 space-y-2">
                  {[
                    { l: 'Ingresos anuales est.', v: `US$ ${(op.ingresosAnualesEstUSD / 1_000_000).toFixed(1)}M` },
                    { l: 'Coches involucrados', v: op.cochesInvolucrados > 0 ? op.cochesInvolucrados : 'N/A' },
                    { l: 'Conductores', v: op.conductores },
                    { l: 'Plazo contrato', v: op.plazo },
                  ].map(({ l, v }) => (
                    <div key={l} className="flex justify-between text-xs">
                      <span className="text-slate-500">{l}</span>
                      <span className="text-white font-medium">{v}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* KPIs a alcanzar */}
      <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-800">
          <p className="font-bold text-sm flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-primary-400" /> Brecha UCOT vs estándares internacionales BRT
          </p>
        </div>
        <div className="divide-y divide-slate-800/50">
          {PROPUESTA_ASM.kpisInternacionales.map(k => (
            <div key={k.kpi} className="px-4 py-3 grid grid-cols-1 md:grid-cols-4 gap-2 items-start">
              <p className="text-white text-sm font-medium">{k.kpi}</p>
              <div>
                <p className="text-[10px] text-slate-500 uppercase">Meta BRT</p>
                <p className="text-emerald-400 font-bold text-sm">{k.meta}</p>
              </div>
              <div>
                <p className="text-[10px] text-slate-500 uppercase">UCOT actual</p>
                <p className="text-amber-400 font-bold text-sm">{k.ucotActual}</p>
              </div>
              <div>
                <p className="text-[10px] text-slate-500 uppercase">Plan de cierre</p>
                <p className="text-slate-300 text-xs leading-relaxed">{k.brecha}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Multi-tenant / SaaS para ASM */}
      <div className="bg-slate-900 rounded-2xl border border-primary-700/40 overflow-hidden">
        <div className="px-5 py-4 border-b border-primary-700/30 bg-primary-900/20">
          <p className="font-black text-white text-lg flex items-center gap-2">
            <Layers className="w-5 h-5 text-primary-400" /> Plataforma Multi-Empresa — El paso natural al sistema completo
          </p>
          <p className="text-primary-300/80 text-sm mt-1">
            SkillRoute está diseñado como plataforma multi-tenant. UCOT es el primer cliente, la ASM puede ser el administrador global.
          </p>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              {
                rol: 'Empresa Operadora', ejemplo: 'UCOT, COETC, COME, CUTCSA',
                icono: '🚌', color: 'border-blue-700/40 bg-blue-900/10',
                capacidades: [
                  'Su propia flota, conductores y líneas',
                  'KPIs operativos en tiempo real',
                  'Gestión de turnos y cartones',
                  'Módulo de contingencias y desvíos',
                  'Dashboard CEO con proyecciones',
                ],
              },
              {
                rol: 'Administrador ASM', ejemplo: 'Agencia del Sistema Metropolitano',
                icono: '🏛️', color: 'border-primary-600/60 bg-primary-900/20',
                capacidades: [
                  'Vista global de todas las empresas',
                  'KPIs consolidados por corredor BRT',
                  'Gestión de licitaciones y contratos',
                  'Validación de km facturados por empresa',
                  'Panel de cumplimiento MTOP/IMM',
                  'Comparación de desempeño entre operadores',
                ],
              },
              {
                rol: 'Regulador / MTOP-IMM', ejemplo: 'Solo lectura y auditoría',
                icono: '⚖️', color: 'border-slate-700 bg-slate-900/40',
                capacidades: [
                  'Acceso de solo-lectura a todos los datos',
                  'Reportes de cumplimiento automáticos',
                  'Auditoría de km facturados vs operados',
                  'Alertas de incumplimiento de KPIs',
                  'Exportación a formatos MTOP',
                ],
              },
            ].map(t => (
              <div key={t.rol} className={`rounded-xl border p-4 ${t.color}`}>
                <p className="text-xl mb-2">{t.icono}</p>
                <p className="font-bold text-white text-sm">{t.rol}</p>
                <p className="text-slate-500 text-xs mb-3">{t.ejemplo}</p>
                <div className="space-y-1.5">
                  {t.capacidades.map(c => (
                    <div key={c} className="flex items-start gap-1.5">
                      <CheckCircle className="w-3 h-3 text-emerald-400 shrink-0 mt-0.5" />
                      <p className="text-slate-300 text-xs">{c}</p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="bg-amber-900/20 border border-amber-700/40 rounded-xl p-4">
            <p className="text-amber-300 text-sm font-bold mb-1">💡 Visión de negocio SaaS</p>
            <p className="text-amber-400/80 text-sm leading-relaxed">
              Con 4 empresas operadoras (UCOT, COETC, COME, CUTCSA) + la ASM como cliente,
              la plataforma genera ingresos por licencia de uso (~US$2,000-5,000/empresa/mes).
              UCOT no solo opera buses — también vende tecnología al sistema.
            </p>
          </div>
        </div>
      </div>

      {/* Llamada a acción */}
      <div className="bg-emerald-900/20 border border-emerald-700/40 rounded-2xl p-6 text-center">
        <Building2 className="w-10 h-10 text-emerald-400 mx-auto mb-3" />
        <h3 className="text-xl font-black text-white mb-2">UCOT ya tiene la plataforma. Solo falta el contrato.</h3>
        <p className="text-emerald-300/80 text-sm max-w-2xl mx-auto mb-4">
          SkillRoute monitorea GPS en tiempo real, gestiona desvíos, genera boletines, distribuye coches y conductores
          automáticamente, y genera reportes KPI para el regulador. Es exactamente lo que la ASM necesitará operar un sistema BRT.
          Ninguna otra empresa operadora en Uruguay tiene esto hoy.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          {['GPS integrado en tiempo real', 'Multi-empresa listo', 'Gestión de contingencias digital', 'KPIs automáticos para regulador', '691 empleados gestionados', '29 líneas activas'].map(item => (
            <span key={item} className="bg-emerald-900/40 border border-emerald-700/50 text-emerald-300 px-3 py-1 rounded-full text-xs font-medium">
              ✓ {item}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
