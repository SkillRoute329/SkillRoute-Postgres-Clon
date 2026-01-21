
import { useState, useEffect } from 'react';
import { ENTITY_CONFIG } from '../config/EntityManager';
import { UniversalService } from '../services/api';
import { Plus, Trash2, Edit, Download, Upload, FileText, Search } from 'lucide-react';
import clsx from 'clsx';
import * as XLSX from 'xlsx';

interface Props {
    entityKey: string;
}

const UniversalResourceManager = ({ entityKey }: Props) => {
    const config = ENTITY_CONFIG[entityKey];
    const [data, setData] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [page, setPage] = useState(1);
    const [total, setTotal] = useState(0);
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        if (config) {
            loadData();
        }
    }, [entityKey, page]);

    const loadData = async () => {
        setLoading(true);
        try {
            const res = await UniversalService.list(config.endpoint, page, 50);
            setData(res.data);
            setTotal(res.meta.total);
        } catch (error) {
            console.error(error);
            alert('Error cargando datos');
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (id: number) => {
        if (!window.confirm('¿Seguro que desea eliminar este registro?')) return;
        try {
            await UniversalService.delete(config.endpoint, id);
            loadData();
        } catch (error) {
            alert('Error al eliminar');
        }
    };

    const handleExportExcel = () => {
        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Datos");
        XLSX.writeFile(wb, `${config.pdfTitle || entityKey}.xlsx`);
    };

    if (!config) {
        return <div className="p-10 text-center text-red-500">Configuración no encontrada para la entidad: {entityKey}</div>;
    }

    // Filter by Search Term (Client side for now, can be server side later)
    const filteredData = data.filter(item =>
        Object.values(item).some(val =>
            String(val).toLowerCase().includes(searchTerm.toLowerCase())
        )
    );

    return (
        <div className="space-y-6 animate-fade-in-up">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-800/50 p-6 rounded-2xl border border-slate-700">
                <div>
                    <h1 className="text-2xl font-bold text-white mb-2 flex items-center gap-3">
                        {config.title}
                        <span className="text-xs px-2 py-1 bg-indigo-500/20 text-indigo-400 rounded-full border border-indigo-500/20">
                            Total: {total}
                        </span>
                    </h1>
                    <p className="text-slate-400 text-sm">Administración centralizada de {config.title.toLowerCase()}</p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                    {/* Search */}
                    <div className="relative">
                        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                        <input
                            type="text"
                            placeholder="Buscar..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="bg-slate-900 border border-slate-700 rounded-xl pl-9 pr-4 py-2 text-sm text-white focus:ring-2 focus:ring-indigo-500 outline-none w-48"
                        />
                    </div>

                    {config.canExport && (
                        <div className="flex gap-2">
                            <button onClick={handleExportExcel} className="p-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 rounded-xl border border-emerald-500/20 transition-colors" title="Exportar Excel">
                                <FileText className="w-5 h-5" />
                            </button>
                            <button className="p-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-xl border border-red-500/20 transition-colors" title="Exportar PDF (Próximamente)">
                                <Download className="w-5 h-5" />
                            </button>
                        </div>
                    )}

                    {config.canImport && (
                        <button className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-xl transition-colors font-medium text-sm">
                            <Upload className="w-4 h-4" />
                            Importar
                        </button>
                    )}

                    <button className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl transition-all shadow-lg shadow-indigo-900/20 font-bold">
                        <Plus className="w-5 h-5" />
                        Nuevo
                    </button>
                </div>
            </div>

            {/* Content Table */}
            <div className="bg-slate-800 rounded-2xl border border-slate-700 overflow-hidden shadow-xl">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead className="bg-slate-900/50 text-slate-400 text-xs uppercase tracking-wider font-semibold">
                            <tr>
                                {config.columns.map(col => (
                                    <th key={col.key} className="p-4 border-b border-slate-700" style={{ width: col.width }}>
                                        {col.label}
                                    </th>
                                ))}
                                <th className="p-4 border-b border-slate-700 text-right">Acciones</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-700/50">
                            {loading ? (
                                <tr>
                                    <td colSpan={config.columns.length + 1} className="p-8 text-center">
                                        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500"></div>
                                    </td>
                                </tr>
                            ) : filteredData.length === 0 ? (
                                <tr>
                                    <td colSpan={config.columns.length + 1} className="p-8 text-center text-slate-500">
                                        No hay registros disponibles.
                                    </td>
                                </tr>
                            ) : (
                                filteredData.map((row) => (
                                    <tr key={row.id} className="hover:bg-slate-700/30 transition-colors group">
                                        {config.columns.map(col => (
                                            <td key={col.key} className="p-4 text-slate-300 text-sm whitespace-nowrap">
                                                {/* Simple Type Rendering Logic */}
                                                {col.type === 'boolean' ? (
                                                    row[col.key] ? <span className="text-emerald-400">Sí</span> : <span className="text-slate-500">No</span>
                                                ) : col.key === 'role' ? (
                                                    <span className={clsx("px-2 py-0.5 rounded text-xs font-bold bg-slate-700",
                                                        row[col.key] === 'Admin' && "bg-purple-500/20 text-purple-300",
                                                        row[col.key] === 'Driver' && "bg-blue-500/20 text-blue-300",
                                                    )}>
                                                        {row[col.key]}
                                                    </span>
                                                ) : (
                                                    row[col.key] || <span className="text-slate-600 italic">-</span>
                                                )}
                                            </td>
                                        ))}
                                        <td className="p-4 text-right">
                                            <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                {config.canEdit && (
                                                    <button className="p-1.5 hover:bg-blue-500/20 text-slate-400 hover:text-blue-400 rounded-lg transition-colors">
                                                        <Edit className="w-4 h-4" />
                                                    </button>
                                                )}
                                                {config.canDelete && (
                                                    <button
                                                        onClick={() => handleDelete(row.id)}
                                                        className="p-1.5 hover:bg-red-500/20 text-slate-400 hover:text-red-400 rounded-lg transition-colors"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Footer / Pagination Placeholder */}
                <div className="p-4 border-t border-slate-700 bg-slate-900/30 flex justify-between items-center text-sm text-slate-400">
                    <span>Mostrando {filteredData.length} registros</span>
                    <div className="flex gap-2">
                        <button
                            disabled={page === 1}
                            onClick={() => setPage(page - 1)}
                            className="px-3 py-1 bg-slate-800 hover:bg-slate-700 rounded border border-slate-700 disabled:opacity-50"
                        >
                            Anterior
                        </button>
                        <button
                            onClick={() => setPage(page + 1)}
                            className="px-3 py-1 bg-slate-800 hover:bg-slate-700 rounded border border-slate-700"
                        >
                            Siguiente
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default UniversalResourceManager;
