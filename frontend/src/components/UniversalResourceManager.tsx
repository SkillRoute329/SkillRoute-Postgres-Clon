
import { useState, useEffect, useRef } from 'react';
import { ENTITY_REGISTRY } from '../config/EntityRegistry';
import { UniversalService } from '../services/api';
import { Plus, Trash2, Edit, Upload, FileText, Search, X, Check, Loader2 } from 'lucide-react';
import * as XLSX from 'xlsx';

interface Props {
    entityKey: string;
}

const UniversalResourceManager = ({ entityKey }: Props) => {
    const config = ENTITY_REGISTRY[entityKey];
    const [data, setData] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [page, setPage] = useState(1);
    const [total, setTotal] = useState(0);
    const [searchTerm, setSearchTerm] = useState('');

    // Edit Modal State
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [editingItem, setEditingItem] = useState<any>(null); // Null = Create, Object = Edit
    const [formLoading, setFormLoading] = useState(false);

    useEffect(() => {
        if (config) {
            loadData();
        }
    }, [entityKey, page]);

    const loadData = async () => {
        setLoading(true);
        try {
            const res = await UniversalService.list(config.apiPath, page, 50);
            setData(res.data);
            setTotal(res.meta.total);
        } catch (error) {
            console.error(error);
            alert('Error cargando datos');
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (item: any) => {
        if (!config.actions.delete) return;

        const isMasterRoute = entityKey === 'MASTER_ROUTES';
        const itemName = item.line || item.name || item.id;

        // Double confirmation for critical data
        if (isMasterRoute) {
            if (!window.confirm(`⚠️ ESTA ACCIÓN ES IRREVERSIBLE. ¿Realmente desea ELIMINAR LA LÍNEA ${itemName}?`)) return;
            if (!window.confirm(`¿CONFIRMA borrar todos los trazados, paradas y alertas asociadas a la LÍNEA ${itemName}?`)) return;
        } else {
            if (!window.confirm(`¿Seguro que desea eliminar el registro "${itemName}"?`)) return;
        }

        try {
            await UniversalService.delete(config.apiPath, item.id);
            loadData();
        } catch (error) {
            alert('Error al eliminar');
        }
    };

    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (!window.confirm(`¿Confirmar importación masiva desde ${file.name}?`)) {
            e.target.value = '';
            return;
        }

        setLoading(true);
        const reader = new FileReader();
        reader.onload = async (evt) => {
            try {
                const bstr = evt.target?.result;
                const wb = XLSX.read(bstr, { type: 'binary' });
                const wsname = wb.SheetNames[0];
                const ws = wb.Sheets[wsname];
                const jsonData = XLSX.utils.sheet_to_json(ws);

                if (jsonData.length === 0) {
                    alert('El archivo está vacío');
                    return;
                }

                await UniversalService.import(config.apiPath, jsonData);
                alert(`Importación exitosa: ${jsonData.length} registros procesados.`);
                loadData();
            } catch (error) {
                console.error(error);
                alert('Error procesando el archivo: ' + String(error));
            } finally {
                setLoading(false);
                if (fileInputRef.current) fileInputRef.current.value = '';
            }
        };
        reader.readAsBinaryString(file);
    };

    const handleExportExcel = () => {
        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Datos");
        XLSX.writeFile(wb, `${config.pdfTitle || entityKey}.xlsx`);
    };

    const handleOpenEdit = (item: any = null) => {
        setEditingItem(item);
        setIsEditModalOpen(true);
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setFormLoading(true);
        // Extract form data
        const formData = new FormData(e.target as HTMLFormElement);
        const rawData: any = {};

        config.columns.forEach(col => {
            if (col.editable) {
                const val = formData.get(col.key);
                // Simple type conversion
                if (col.type === 'number') {
                    rawData[col.key] = Number(val);
                } else {
                    rawData[col.key] = val;
                }
            }
        });

        try {
            if (editingItem) {
                // Update
                await UniversalService.update(config.apiPath, editingItem.id, rawData);
            } else {
                // Create
                await UniversalService.create(config.apiPath, rawData);
            }
            setIsEditModalOpen(false);
            loadData();
        } catch (error) {
            console.error(error);
            alert('Error al guardar: ' + String(error));
        } finally {
            setFormLoading(false);
        }
    };

    if (!config) {
        return <div className="p-10 text-center text-red-500">Configuración no encontrada para la entidad: {entityKey}</div>;
    }

    const filteredData = data.filter(item =>
        Object.values(item).some(val =>
            String(val).toLowerCase().includes(searchTerm.toLowerCase())
        )
    );



    // Duplicate removed

    return (
        <div className="space-y-6 animate-fade-in-up">
            <input
                type="file"
                ref={fileInputRef}
                onChange={handleImport}
                className="hidden"
                accept=".xlsx,.xls,.csv"
            />
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-800/50 p-6 rounded-2xl border border-slate-700">
                <div>
                    <h1 className="text-2xl font-bold text-white mb-2 flex items-center gap-3">
                        {config.labels.title}
                        <span className="text-xs px-2 py-1 bg-indigo-500/20 text-indigo-400 rounded-full border border-indigo-500/20">
                            Total: {total}
                        </span>
                    </h1>
                    <p className="text-slate-400 text-sm">Administración centralizada de {config.labels.plural.toLowerCase()}</p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
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

                    {config.actions.export && (
                        <div className="flex gap-2">
                            <button onClick={handleExportExcel} className="p-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 rounded-xl border border-emerald-500/20 transition-colors" title="Exportar Excel">
                                <FileText className="w-5 h-5" />
                            </button>
                        </div>
                    )}

                    {config.actions.import && (
                        <button
                            onClick={() => fileInputRef.current?.click()}
                            className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-xl transition-colors font-medium text-sm"
                        >
                            <Upload className="w-4 h-4" />
                            Importar Excel
                        </button>
                    )}

                    {config.actions.create && (
                        <button
                            onClick={() => handleOpenEdit(null)}
                            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl transition-all shadow-lg shadow-indigo-900/20 font-bold"
                        >
                            <Plus className="w-5 h-5" />
                            Nuevo {config.labels.singular}
                        </button>
                    )}
                </div>
            </div>

            {/* Content Table */}
            <div className="bg-slate-800 rounded-2xl border border-slate-700 overflow-hidden shadow-xl">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead className="bg-slate-900/50 text-slate-400 text-xs uppercase tracking-wider font-semibold">
                            <tr>
                                {config.columns.filter(c => !c.hiddenInTable).map(col => (
                                    <th key={col.key} className="p-4 border-b border-slate-700">
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
                                        No hay {config.labels.plural.toLowerCase()} disponibles.
                                    </td>
                                </tr>
                            ) : (
                                filteredData.map((row) => (
                                    <tr key={row.id} className="hover:bg-slate-700/30 transition-colors group">
                                        {config.columns.filter(c => !c.hiddenInTable).map(col => (
                                            <td key={col.key} className="p-4 text-slate-300 text-sm whitespace-nowrap">
                                                {col.type === 'boolean' ? (
                                                    row[col.key] ? <span className="text-emerald-400">Sí</span> : <span className="text-slate-500">No</span>
                                                ) : col.type === 'enum' ? (
                                                    <span className="px-2 py-0.5 rounded text-xs font-bold bg-slate-700 border border-slate-600">
                                                        {row[col.key]}
                                                    </span>
                                                ) : (
                                                    // Safely handle nested objects or nulls if needed, though config implies flat structure for now
                                                    row[col.key] || <span className="text-slate-600">-</span>
                                                )}
                                            </td>
                                        ))}
                                        <td className="p-4 text-right">
                                            <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                {config.actions.edit && (
                                                    <button
                                                        onClick={() => handleOpenEdit(row)}
                                                        className="p-1.5 hover:bg-blue-500/20 text-slate-400 hover:text-blue-400 rounded-lg transition-colors"
                                                    >
                                                        <Edit className="w-4 h-4" />
                                                    </button>
                                                )}
                                                {config.actions.delete && (
                                                    <button
                                                        onClick={() => handleDelete(row)}
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

                {/* Footer Pagination */}
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

            {/* Dynamic Edit Modal */}
            {isEditModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
                    <div className="bg-slate-900 rounded-2xl border border-slate-700 shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
                        <div className="p-6 border-b border-slate-800 flex justify-between items-center">
                            <h2 className="text-xl font-bold text-white">
                                {editingItem ? `Editar ${config.labels.singular}` : `Nuevo ${config.labels.singular}`}
                            </h2>
                            <button onClick={() => setIsEditModalOpen(false)} className="text-slate-400 hover:text-white">
                                <X className="w-6 h-6" />
                            </button>
                        </div>

                        <form onSubmit={handleSave} className="flex-1 overflow-y-auto p-6 space-y-4">
                            {config.columns.filter(col => col.editable).map(col => (
                                <div key={col.key}>
                                    <label className="block text-xs font-semibold text-slate-400 uppercase mb-1">
                                        {col.label} {col.required && <span className="text-red-500">*</span>}
                                    </label>

                                    {col.type === 'enum' && col.options ? (
                                        <select
                                            name={col.key}
                                            required={col.required}
                                            defaultValue={editingItem?.[col.key]}
                                            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                                        >
                                            {col.options.map(opt => (
                                                <option key={opt} value={opt}>{opt}</option>
                                            ))}
                                        </select>
                                    ) : (
                                        <input
                                            type={col.type === 'number' ? 'number' : 'text'}
                                            name={col.key}
                                            required={col.required}
                                            defaultValue={editingItem?.[col.key]}
                                            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-white focus:ring-2 focus:ring-indigo-500 outline-none placeholder-slate-600"
                                            placeholder={`Ingrese ${col.label.toLowerCase()}`}
                                        />
                                    )}
                                </div>
                            ))}
                        </form>

                        <div className="p-6 border-t border-slate-800 bg-slate-800/30 flex justify-end gap-3">
                            <button
                                type="button"
                                onClick={() => setIsEditModalOpen(false)}
                                className="px-4 py-2 text-slate-300 hover:bg-slate-800 rounded-xl transition-colors font-medium"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={(e) => {
                                    // Trigger default form submit
                                    const form = e.currentTarget.closest('div')?.previousElementSibling as HTMLFormElement;
                                    form?.requestSubmit();
                                }}
                                disabled={formLoading}
                                className="px-6 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold shadow-lg shadow-indigo-900/20 flex items-center gap-2"
                            >
                                {formLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                                Guardar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default UniversalResourceManager;
