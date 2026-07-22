import ExcelUploader from '../../components/ExcelUploader';

export default function DashboardGodMode() {
  return (
    <div className="animate-fade-in space-y-6">
      <div className="bg-white p-6 rounded-lg shadow-xl border-l-4 border-blue-600">
        <h2 className="text-xl font-bold mb-4 text-slate-800">🛠️ PANEL DE CONTROL DE DATOS</h2>

        <div className="mb-6 p-4 bg-blue-50 rounded-lg">
          <p className="text-slate-700 font-semibold mb-2">1. Descarga el formato correcto:</p>
          <a
            href="/plantilla_oficial.xlsx"
            download="Plantilla_Oficial_2026.xlsx"
            className="inline-flex items-center gap-2 text-blue-600 font-bold hover:underline"
          >
            <span>📥</span> Bajar Plantilla Excel (Oficial)
          </a>
          <p className="text-xs text-slate-500 mt-1">Sistema listo para Cartones UCOT.</p>
        </div>

        <div>
          <p className="text-slate-700 font-semibold mb-2">2. Sube tu archivo (Validación Automática):</p>
          <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
            <ExcelUploader onSuccess={() => window.location.reload()} />
          </div>
        </div>

        <div className="mt-6 pt-6 border-t border-slate-200">
          <h3 className="font-bold text-slate-800 mb-3">🛠️ Módulos de Gestión (God Mode)</h3>
          <div className="flex flex-wrap gap-4">
            {[
              { label: '👥 Gestión de Usuarios', href: '/dashboard/admin/users', color: 'bg-purple-600 hover:bg-purple-700' },
              { label: '📡 Radar Anti-Barrido', href: '/dashboard/traffic/shadow-radar', color: 'bg-orange-600 hover:bg-orange-700' },
              { label: '🌐 Monitor Ingesta STM', href: '/dashboard/admin/stm-scraper', color: 'bg-indigo-600 hover:bg-indigo-700' },
              { label: '🧾 Terminal Listero', href: '/dashboard/traffic/listero', color: 'bg-emerald-600 hover:bg-emerald-700' },
            ].map(({ label, href, color }) => (
              <button
                key={href}
                onClick={() => (window.location.href = href)}
                className={`px-4 py-2 ${color} text-white rounded-lg font-bold flex items-center gap-2 transition-colors`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
