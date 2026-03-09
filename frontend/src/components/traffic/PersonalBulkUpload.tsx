/**
 * Carga masiva de personal: legajo, apellido, internalNumber_coche_fijo.
 * Listo para importar cuando el usuario proporcione el archivo (CSV o JSON).
 * Sin tablas tipo Excel: lista de tarjetas.
 */
import { useState, useCallback } from 'react';
import { Upload, FileText, Loader2, CheckCircle } from 'lucide-react';
import { UserService } from '../../services/firestore';

export interface PersonalRow {
  legajo: string;
  apellido: string;
  internalNumber_coche_fijo?: string;
  email?: string;
  nombre?: string;
}

function parseCSV(text: string): PersonalRow[] {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const header = lines[0].split(',').map((s) => s.trim().toLowerCase().replace(/\s+/g, '_'));
  const rows: PersonalRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map((s) => s.trim());
    const obj: Record<string, string> = {};
    header.forEach((h, j) => {
      obj[h] = values[j] ?? '';
    });
    rows.push({
      legajo: obj.legajo ?? obj.internalnumber ?? '',
      apellido: obj.apellido ?? obj.lastname ?? '',
      internalNumber_coche_fijo: obj.internalnumber_coche_fijo ?? obj.coche_fijo ?? undefined,
      nombre: obj.nombre ?? obj.firstname,
      email: obj.email,
    });
  }
  return rows.filter((r) => r.legajo || r.apellido);
}

function parseJSON(text: string): PersonalRow[] {
  const data = JSON.parse(text);
  const arr = Array.isArray(data) ? data : [data];
  return arr
    .map((row: Record<string, unknown>) => ({
      legajo: String(row.legajo ?? row.internalNumber ?? ''),
      apellido: String(row.apellido ?? row.lastName ?? ''),
      internalNumber_coche_fijo:
        row.internalNumber_coche_fijo != null ? String(row.internalNumber_coche_fijo) : undefined,
      nombre:
        row.nombre != null
          ? String(row.nombre)
          : row.firstName != null
            ? String(row.firstName)
            : undefined,
      email: row.email != null ? String(row.email) : undefined,
    }))
    .filter((r: PersonalRow) => r.legajo || r.apellido);
}

export default function PersonalBulkUpload() {
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<PersonalRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ ok: number; skip: number; errors: string[] } | null>(null);

  const handleFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setResult(null);
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? '');
      try {
        if (f.name.toLowerCase().endsWith('.json')) {
          setRows(parseJSON(text));
        } else {
          setRows(parseCSV(text));
        }
      } catch (err) {
        setRows([]);
        setResult({
          ok: 0,
          skip: 0,
          errors: [
            'Error al leer el archivo. Use CSV (legajo,apellido,internalNumber_coche_fijo) o JSON.',
          ],
        });
      }
    };
    reader.readAsText(f, 'UTF-8');
  }, []);

  const handleImport = useCallback(async () => {
    if (rows.length === 0) return;
    setLoading(true);
    setResult(null);
    const errors: string[] = [];
    let ok = 0;
    let skip = 0;
    try {
      const users = await UserService.getAll();
      for (const row of rows) {
        const match = users.find(
          (u) =>
            String(u.legajo ?? u.internalNumber ?? '').trim() === String(row.legajo).trim() ||
            String(u.internalNumber ?? u.legajo ?? '').trim() === String(row.legajo).trim(),
        );
        if (!match) {
          skip++;
          errors.push(`Legajo ${row.legajo} no encontrado en users.`);
          continue;
        }
        const id = String(match.id ?? match.uid ?? '');
        if (!id) {
          skip++;
          continue;
        }
        await UserService.update(id, {
          legajo: row.legajo || undefined,
          apellido: row.apellido || undefined,
          internalNumber_coche_fijo: row.internalNumber_coche_fijo,
        });
        ok++;
      }
      setResult({ ok, skip, errors: errors.slice(0, 20) });
    } catch (err) {
      setResult({
        ok: 0,
        skip: 0,
        errors: [err instanceof Error ? err.message : 'Error al importar'],
      });
    } finally {
      setLoading(false);
    }
  }, [rows]);

  return (
    <div className="rounded-2xl bg-slate-800/80 border border-slate-700 p-4 space-y-4">
      <h3 className="font-bold text-white flex items-center gap-2">
        <FileText className="w-5 h-5 text-emerald-400" />
        Carga masiva de personal
      </h3>
      <p className="text-slate-400 text-sm">
        Archivo CSV o JSON con columnas: <code className="text-slate-300">legajo</code>,{' '}
        <code className="text-slate-300">apellido</code>,{' '}
        <code className="text-slate-300">internalNumber_coche_fijo</code>. Se actualizarán los
        usuarios existentes por legajo.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-700 hover:bg-slate-600 text-white text-sm cursor-pointer">
          <Upload className="w-4 h-4" />
          Seleccionar archivo
          <input
            type="file"
            accept=".csv,.json,text/csv,application/json"
            onChange={handleFile}
            className="hidden"
          />
        </label>
        {file && <span className="text-slate-400 text-sm">{file.name}</span>}
      </div>
      {rows.length > 0 && (
        <>
          <p className="text-slate-400 text-sm">{rows.length} fila(s) listas para importar.</p>
          <div className="max-h-48 overflow-y-auto space-y-2">
            {rows.slice(0, 15).map((r, i) => (
              <div
                key={i}
                className="flex flex-wrap gap-2 p-2 rounded-lg bg-slate-900/50 border border-slate-700 text-sm"
              >
                <span className="text-emerald-400 font-mono">{r.legajo}</span>
                <span className="text-slate-300">{r.apellido}</span>
                {r.internalNumber_coche_fijo && (
                  <span className="text-slate-500">Coche {r.internalNumber_coche_fijo}</span>
                )}
              </div>
            ))}
            {rows.length > 15 && (
              <p className="text-slate-500 text-xs">… y {rows.length - 15} más</p>
            )}
          </div>
          <button
            type="button"
            onClick={handleImport}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-medium disabled:opacity-50"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <CheckCircle className="w-4 h-4" />
            )}
            Importar a users
          </button>
        </>
      )}
      {result && (
        <div
          className={`p-3 rounded-xl text-sm ${result.errors.length > 0 ? 'bg-amber-950/40 border border-amber-600/50 text-amber-200' : 'bg-emerald-950/40 border border-emerald-600/50 text-emerald-200'}`}
        >
          <p>
            Actualizados: {result.ok}. Omitidos: {result.skip}.
          </p>
          {result.errors.length > 0 && (
            <ul className="mt-2 list-disc list-inside text-xs">
              {result.errors.slice(0, 5).map((e, i) => (
                <li key={i}>{e}</li>
              ))}
              {result.errors.length > 5 && <li>… y {result.errors.length - 5} más</li>}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
