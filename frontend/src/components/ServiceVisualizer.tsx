import { useState, useEffect } from 'react';
// @ts-ignore
import { FixedSizeList as List } from 'react-window';
import { db } from '../config/firebase'; // Assuming Direct Firestore for Massive Read or via API?
// User requested "Virtualization". Direct Firestore allows query, but loading ALL for virtualization suggests a large dataset in memory or paginated.
// However, "Ingestor" output is structural data.
// A single Line/Service has modest size, but "All Lines" is huge.
// Let's implement virtualization for a specific Line/Service view or a aggregated view.
// Given "Matriz de Horarios", usually means viewing a full Day or Line schedule.
import { doc, getDoc, collection, getDocs, query, where, limit } from 'firebase/firestore';

const ServiceVisualizer = () => {
  const [lines, setLines] = useState<any[]>([]);
  const [selectedLine, setSelectedLine] = useState('');
  const [services, setServices] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  // Load Lines from API/DB
  useEffect(() => {
    // Fetch Only Line IDs for selector
    const loadLines = async () => {
      const qs = await getDocs(query(collection(db, 'lines'))); // Optimizable via API
      setLines(qs.docs.map((d) => ({ id: d.id, ...d.data() })));
    };
    loadLines();
  }, []);

  const loadServices = async () => {
    if (!selectedLine) return;
    setLoading(true);
    try {
      // Fetch ALL services for the line (Heavy Operation -> Virtualized)
      // Path: lineas/{id}/servicios
      const ref = collection(db, 'lineas', selectedLine, 'servicios');
      const snap = await getDocs(ref);
      const data = snap.docs.map((d) => d.data());

      // Flatten matrix for Visualization: Each Row = A Stop Time entry ? Or specific structure.
      // Usually "Carton" view is: Columns = Stops, Rows = Trips.
      // Let's format it as such.
      setServices(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadServices();
  }, [selectedLine]);

  // Validation
  if (!lines.length && !loading)
    return <div className="text-slate-400 p-10">Cargando Estructura de Red...</div>;

  // Helper to render a Row in Virtual List
  const Row = ({ index, style, data }: any) => {
    const service = data[index];
    const horarios = service.horarios || []; // Array of { StopName: "HH:mm" }
    // We render just the summary or first 5 stops for the list view
    // Ideally this is a detailed grid.

    return (
      <div
        style={style}
        className="flex items-center border-b border-slate-700 hover:bg-slate-800 transition-colors px-4 text-sm text-slate-300"
      >
        <div className="w-24 font-bold text-indigo-400">{service.numero_servicio}</div>
        <div className="flex-1 flex gap-4 overflow-hidden">
          {/* Render first few stops as preview */}
          {Object.entries(horarios[0] || {})
            .slice(0, 5)
            .map(([stop, time]: any) => (
              <div key={stop} className="flex flex-col">
                <span className="text-[10px] text-slate-500 uppercase">
                  {stop.substring(0, 10)}
                </span>
                <span className="font-mono text-white">{time}</span>
              </div>
            ))}
          <span className="text-xs text-slate-600 self-end">({horarios.length} viajes)</span>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4 h-[80vh] flex flex-col">
      {/* Controls */}
      <div className="bg-slate-800 p-4 rounded-xl border border-slate-700 flex gap-4 items-center">
        <select
          value={selectedLine}
          onChange={(e) => setSelectedLine(e.target.value)}
          className="bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-white"
        >
          <option value="">Seleccione Línea</option>
          {lines.map((l) => (
            <option key={l.id} value={l.id}>
              Línea {l.id}
            </option>
          ))}
        </select>

        <div className="text-slate-400 text-sm">{services.length} Servicios Cargados</div>
      </div>

      {/* Matrix */}
      <div className="flex-1 bg-slate-900 rounded-xl border border-slate-700 overflow-hidden relative">
        {loading ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-500"></div>
          </div>
        ) : services.length > 0 ? (
          <List
            height={600} // Dynamic height in real app
            itemCount={services.length}
            itemSize={60}
            width={'100%'}
            itemData={services}
          >
            {Row}
          </List>
        ) : (
          <div className="flex items-center justify-center h-full text-slate-500">
            Seleccione una línea para ver la Matriz de Horarios
          </div>
        )}
      </div>
    </div>
  );
};

export default ServiceVisualizer;
