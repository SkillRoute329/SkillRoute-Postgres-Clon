import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { CartonService } from '../../services/api';
import { FileText, Search, Eye, Pencil, Loader2 } from 'lucide-react';

type CartonItem = { id: string; linea: string; [key: string]: unknown };

export default function CartonManager() {
  const navigate = useNavigate();
  const [list, setList] = useState<CartonItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    setLoading(true);
    const fromMaster = CartonService.getServiciosFromMaster();
    const fromMasterItems: CartonItem[] = (fromMaster ?? []).map((s) => ({
      id: s.id,
      linea: s.linea,
      serviceNumber: s.serviceNumber,
      source: 'maestro',
    }));
    setList(fromMasterItems);

    Promise.all([CartonService.getAll(), CartonService.getCartonesFisicos()])
      .then(([matrizData, fisicosData]) => {
        const fromMatriz = ((matrizData || []) as CartonItem[])
          .filter((x) => x && x.id && x.linea)
          .map((x) => ({
            ...x,
            source: (x as CartonItem & { source?: string }).source ?? 'matriz',
          }));
        const fromFisicos = ((fisicosData || []) as CartonItem[])
          .filter((x) => x && x.id && (x.linea || (x as { linea?: string }).linea))
          .map((x) => ({
            ...x,
            linea: x.linea ?? (x as { linea?: string }).linea ?? '',
            source: 'fisico',
          }));
        const seen = new Set<string>();
        const merged: CartonItem[] = [];
        for (const item of [...fromMasterItems, ...fromMatriz, ...fromFisicos]) {
          const key = `${item.linea}-${item.id}`;
          if (seen.has(key)) continue;
          seen.add(key);
          merged.push(item);
        }
        merged.sort(
          (a, b) =>
            String(a.linea).localeCompare(String(b.linea), undefined, { numeric: true }) ||
            String(a.id).localeCompare(String(b.id), undefined, { numeric: true }),
        );
        setList(merged);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const filtered = list.filter((item) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      String(item.id).toLowerCase().includes(q) || String(item.linea).toLowerCase().includes(q)
    );
  });

  const handleVer = (item: CartonItem) => {
    const q = (item as CartonItem & { source?: string }).source === 'fisico' ? '?fisico=1' : '';
    navigate(
      `/dashboard/traffic/cartons/detail/${encodeURIComponent(item.linea)}/${encodeURIComponent(item.id)}${q}`,
    );
  };

  const handleEditar = (item: CartonItem) => {
    const q =
      (item as CartonItem & { source?: string }).source === 'fisico'
        ? '?fisico=1&mode=edit'
        : '?mode=edit';
    navigate(
      `/dashboard/traffic/cartons/detail/${encodeURIComponent(item.linea)}/${encodeURIComponent(item.id)}${q}`,
    );
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      <header className="p-4 border-b border-slate-800 bg-slate-900/50 shrink-0">
        <h1 className="text-xl font-bold flex items-center gap-2">
          <FileText className="w-6 h-6 text-primary-500" />
          Gestor de Cartones
        </h1>
        <p className="text-slate-400 text-sm mt-1">
          Cartones de servicio por línea. Ver detalle o editar.
        </p>
        <div className="mt-4 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
          <input
            type="text"
            placeholder="Buscar por número de servicio o línea..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-3 rounded-xl bg-slate-800 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>
      </header>

      <main className="flex-1 overflow-auto p-4">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-slate-500">
            {list.length === 0 ? 'No hay cartones cargados.' : 'Ningún resultado para la búsqueda.'}
          </div>
        ) : (
          <ul className="space-y-2 max-w-2xl mx-auto" data-testid="carton-list">
            {filtered.map((item) => (
              <li
                key={`${item.linea}-${item.id}`}
                className="flex items-center justify-between gap-4 p-4 rounded-xl bg-slate-800/80 border border-slate-700"
              >
                <div className="min-w-0">
                  <span className="font-bold text-white">Servicio #{item.id}</span>
                  <span className="text-slate-400 ml-2">Línea {item.linea}</span>
                  {(item as CartonItem & { source?: string }).source === 'fisico' && (
                    <span className="ml-2 text-xs px-2 py-0.5 rounded bg-emerald-900/50 text-emerald-300">
                      Físico
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleVer(item)}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-white font-medium"
                  >
                    <Eye className="w-4 h-4" />
                    Ver
                  </button>
                  <button
                    type="button"
                    onClick={() => handleEditar(item)}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary-600 hover:bg-primary-500 text-white font-medium"
                  >
                    <Pencil className="w-4 h-4" />
                    Editar
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
