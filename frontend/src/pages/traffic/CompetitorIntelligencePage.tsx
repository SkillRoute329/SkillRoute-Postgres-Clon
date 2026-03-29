/**
 * Competitive Intelligence — Standalone Page
 * Provides direct access to the UCOT Corridor Command system
 * without needing to navigate through the CEO Dashboard tabs.
 */
import { CompetitorThreatWidget } from '../../components/CompetitorThreatWidget';
import { Signal } from 'lucide-react';

export default function CompetitorIntelligencePage() {
  return (
    <div className="space-y-6 animate-fade-in">
      {/* Page Header */}
      <header className="flex items-center gap-4">
        <div className="p-3 rounded-2xl bg-gradient-to-br from-red-500/20 to-orange-500/10 border border-red-500/20 shadow-lg shadow-red-500/5">
          <Signal className="w-7 h-7 text-red-400" />
        </div>
        <div>
          <h1 className="text-2xl font-black text-white tracking-tight">
            Inteligencia Competitiva
          </h1>
          <p className="text-sm text-slate-500">
            Sistema de monitoreo táctico de corredores — Análisis de competencia en tiempo real
          </p>
        </div>
      </header>

      {/* Main Widget */}
      <CompetitorThreatWidget />
    </div>
  );
}
