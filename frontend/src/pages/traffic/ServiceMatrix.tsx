import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Upload, FileSpreadsheet, Loader2, History, Trash2, Building2 } from 'lucide-react';
import { useEmpresaPropia } from '../../hooks/useEmpresaPropia';
import * as XLSX from 'xlsx';
import { toast } from 'react-hot-toast';
import { ServiceMatrixService } from '../../services/firestore/serviceMatrix';
import { useAuth } from '../../context/AuthContext';

export default function ServiceMatrix() {
  const { empresaPropia, setEmpresaPropia, empresaCfg } = useEmpresaPropia();
  const { user } = useAuth();
  const isSuperAdmin = user?.role === 'SuperAdmin' || user?.rol === 'SuperAdmin';
  const canUpload = isSuperAdmin;

  const [file, setFile] = useState<File | null>(null);
  const [workbook, setWorkbook] = useState<XLSX.WorkBook | null>(null);
  const [sheets, setSheets] = useState<string[]>([]);

  // Cloud History State (persistente vía onSnapshot en serviceMatrix.ts)
  const [matrixHistory, setMatrixHistory] = useState<any[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [selectedCloudId, setSelectedCloudId] = useState<string | null>(null);

  // Filter/View State
  const [selectedSheet, setSelectedSheet] = useState<string>('');
  const [currentData, setCurrentData] = useState<any[]>([]);

  const [isParsing, setIsParsing] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const selectedCloudIdRef = useRef<string | null>(null);
  const fileRef = useRef<File | null>(null);
  selectedCloudIdRef.current = selectedCloudId;
  fileRef.current = file;

  const loadMatrixByItem = useCallback(async (matrixData: any) => {
    setSelectedCloudId(matrixData.id);
    setFile(null);
    setLoadingMessage(`Descargando ${matrixData.fileName}...`);
    setIsParsing(true);
    try {
      const response = await fetch(matrixData.fileUrl);
      if (!response.ok) throw new Error('Error de descarga');
      const blob = await response.blob();
      await parseExcelFile(blob);
      toast.success(`Matriz cargada: ${matrixData.fileName}`);
    } catch (e) {
      console.error(e);
      toast.error('Error al descargar archivo desde la nube.');
    } finally {
      setIsParsing(false);
      setLoadingMessage('');
    }
  }, []);

  const loadMatrixByItemRef = useRef(loadMatrixByItem);
  loadMatrixByItemRef.current = loadMatrixByItem;

  // Suscripción al historial Firestore. Auto-selección: si hay historial y nada seleccionado ni archivo local, se asigna matrixHistory[0] (más reciente).
  useEffect(() => {
    setIsLoadingHistory(true);
    const unsubscribe = ServiceMatrixService.subscribeToHistory((history) => {
      setMatrixHistory(history);
      setIsLoadingHistory(false);
      if (history.length > 0 && !selectedCloudIdRef.current && !fileRef.current) {
        loadMatrixByItemRef.current?.(history[0]);
      }
    });
    return () => unsubscribe();
  }, []);

  const handleDeleteMatrix = async (
    e: React.MouseEvent,
    item: { id: string; fileName?: string },
  ) => {
    e.stopPropagation();
    if (!isSuperAdmin) return;
    if (
      !window.confirm(
        `¿Eliminar "${item.fileName ?? item.id}" de la nube? Esta acción no se puede deshacer.`,
      )
    )
      return;
    try {
      await ServiceMatrixService.deleteMatrix(item.id);
      if (selectedCloudId === item.id) setSelectedCloudId(null);
      toast.success('Matriz eliminada.');
    } catch (err) {
      console.error(err);
      toast.error('Error al eliminar la matriz.');
    }
  };

  const handleCloudSelect = async (matrixData: any) => {
    if (selectedCloudId === matrixData.id) return;
    await loadMatrixByItem(matrixData);
  };

  const handleLocalUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;

    if (!canUpload) {
      toast.error('Solo usuarios SuperAdmin pueden subir matrices a la nube.');
      return;
    }

    setSelectedCloudId(null);
    setLoadingMessage('Subiendo a la nube...');
    setIsParsing(true);

    try {
      await ServiceMatrixService.uploadMatrix(selected, {
        uploadedBy: String(user?.id ?? user?.internalNumber ?? ''),
        area: 'Gral',
      });
      toast.success('Matriz guardada en la nube. Persistente al refrescar.');
      setFile(selected);
      await parseExcelFile(selected);
    } catch (err) {
      console.error(err);
      toast.error('Error al subir la matriz.');
    } finally {
      setIsParsing(false);
      setLoadingMessage('');
    }
  };

  const parseExcelFile = async (blob: Blob) => {
    setIsParsing(true);
    setLoadingMessage('Analizando estructura Excel...');

    try {
      const data = await blob.arrayBuffer();
      const wb = XLSX.read(data, { type: 'array' });
      setWorkbook(wb);
      setSheets(wb.SheetNames);

      // Smart Auto-Select logic
      if (wb.SheetNames.length > 0) {
        // Prefer Numeric Sheets (Lines) over "Sheet1"
        const numericSheet = wb.SheetNames.find((n) => /^\d/.test(n));
        const target = numericSheet || wb.SheetNames[0];
        selectSheet(target, wb);
      }
    } catch (error) {
      console.error(error);
      toast.error('El archivo está corrupto o protegido.');
    } finally {
      setIsParsing(false);
    }
  };

  const selectSheet = (sheetName: string, activeWorkbook = workbook) => {
    if (!activeWorkbook) return;
    setSelectedSheet(sheetName);

    const worksheet = activeWorkbook.Sheets[sheetName];
    // raw: false -> Formatted strings (08:00 instead of 0.33)
    const jsonData = XLSX.utils.sheet_to_json(worksheet, {
      header: 1,
      raw: false,
      defval: '',
    }) as any[][];
    setCurrentData(jsonData);
  };

  return (
    <div className="flex h-[calc(100vh-64px)] bg-slate-950">
      {/* SIDEBAR: History List */}
      <div className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col shrink-0">
        <div className="p-4 border-b border-slate-800">
          <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
            <History className="w-4 h-4" />
            Historial Cloud
          </h2>
          <div className="flex items-center gap-1.5 mt-2"><Building2 className="w-3.5 h-3.5 text-slate-500" /><select value={empresaPropia} onChange={(e) => setEmpresaPropia(Number(e.target.value))} className="bg-slate-800 border border-slate-700 rounded-md px-1.5 py-1 text-[10px] text-white w-full" title="Operador propio"><option value={70}>UCOT</option><option value={50}>CUTCSA</option><option value={20}>COME</option><option value={10}>COETC</option></select></div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-2">
          {isLoadingHistory ? (
            <div className="flex justify-center p-4">
              <Loader2 className="w-5 h-5 animate-spin text-slate-500" />
            </div>
          ) : (
            matrixHistory.map((item) => (
              <div
                key={item.id}
                className={`w-full rounded-lg text-xs transition-all border flex items-start gap-2 ${
                  selectedCloudId === item.id
                    ? 'bg-blue-600/20 border-blue-500/50 text-white'
                    : 'bg-slate-800/50 border-transparent text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                }`}
              >
                <button
                  onClick={() => handleCloudSelect(item)}
                  className="flex-1 min-w-0 text-left p-3"
                >
                  <div className="font-bold truncate">{item.fileName}</div>
                  <div className="flex items-center justify-between mt-1 text-[10px] opacity-70">
                    <span>{new Date(item.uploadedAt?.seconds * 1000).toLocaleDateString()}</span>
                    <span className="uppercase">{item.area || 'Gral'}</span>
                  </div>
                </button>
                {isSuperAdmin && (
                  <button
                    type="button"
                    onClick={(e) => handleDeleteMatrix(e, item)}
                    title="Eliminar matriz (solo SuperAdmin)"
                    className="p-2 shrink-0 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
                    aria-label="Eliminar"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))
          )}

          <div className="pt-4 mt-4 border-t border-slate-800">
            <button
              onClick={() => canUpload && fileInputRef.current?.click()}
              disabled={!canUpload}
              title={
                canUpload
                  ? 'Subir planificación a Firebase Storage y guardar en Firestore'
                  : 'Solo SuperAdmin puede subir matrices'
              }
              className={`w-full flex items-center justify-center gap-2 p-3 rounded-lg border border-dashed transition-all font-bold text-xs ${canUpload ? 'bg-slate-800 hover:bg-slate-700 text-emerald-400 border-slate-600' : 'bg-slate-800/50 text-slate-500 border-slate-700 cursor-not-allowed'}`}
            >
              <Upload className="w-4 h-4" />
              Subir a la nube (XLSX)
            </button>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleLocalUpload}
              accept=".xlsx, .xls"
              className="hidden"
            />
          </div>
        </div>
      </div>

      {/* MAIN CONTENT */}
      <div className="flex-1 flex flex-col min-w-0 bg-slate-950 relative">
        {/* 1. TOP BAR: Sheet Tabs */}
        {workbook && (
          <div className="bg-slate-900 border-b border-slate-800 flex shrink-0 overflow-x-auto custom-scrollbar">
            {sheets.map((sheet) => (
              <button
                key={sheet}
                onClick={() => selectSheet(sheet)}
                className={`
                                    px-4 py-3 text-xs font-bold whitespace-nowrap border-r border-slate-800 focus:outline-none transition-colors
                                    ${
                                      selectedSheet === sheet
                                        ? 'bg-slate-800 text-blue-400 border-b-2 border-b-blue-500'
                                        : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/50 border-b-2 border-b-transparent'
                                    }
                                `}
              >
                {sheet}
              </button>
            ))}
          </div>
        )}

        {/* 2. DATA GRID */}
        <div className="flex-1 overflow-hidden relative">
          {isParsing ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/80 z-20">
              <Loader2 className="w-10 h-10 text-blue-500 animate-spin mb-4" />
              <p className="text-slate-300 font-mono animate-pulse">{loadingMessage}</p>
            </div>
          ) : currentData.length > 0 ? (
            <div className="h-full w-full overflow-auto custom-scrollbar">
              <div className="w-full overflow-x-auto shadow-sm rounded-lg">
                <table className="w-full text-left border-collapse">
                  <thead className="bg-slate-900 sticky top-0 z-10 shadow-lg">
                    <tr>
                      <th className="w-10 p-2 text-[10px] text-center text-slate-600 border-b border-slate-800 bg-slate-900 select-none">
                        #
                      </th>
                      {currentData[0]?.map((_: any, i: number) => (
                        <th
                          key={i}
                          className="px-3 py-2 text-[10px] font-bold text-slate-500 border-b border-slate-800 uppercase tracking-wider bg-slate-900 min-w-[80px]"
                        >
                          {String.fromCharCode(65 + (i % 26))}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {currentData.map((row, rIdx) => {
                      // Highlight Headers logic
                      const isHeader = row.some((c: any) =>
                        String(c).match(/(destin|hora|salida|coche|turno|servicio)/i),
                      );
                      return (
                        <tr
                          key={rIdx}
                          className={`border-b border-slate-800/30 ${isHeader ? 'bg-blue-900/20' : 'hover:bg-slate-900/50'}`}
                        >
                          <td className="p-2 text-[9px] text-slate-700 text-center font-mono select-none border-r border-slate-800/50 bg-slate-900/30">
                            {rIdx + 1}
                          </td>
                          {row.map((cell: any, cIdx: number) => (
                            <td
                              key={cIdx}
                              className={`p-2 text-xs border-r border-slate-800/30 whitespace-nowrap ${isHeader ? 'text-blue-300 font-bold' : 'text-slate-300'}`}
                            >
                              {cell}
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {currentData.length > 2000 && (
                <div className="p-4 text-center text-xs text-orange-400 bg-orange-900/20">
                  Vista previa truncada por rendimiento. El archivo completo se procesó
                  correctamente.
                </div>
              )}
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-slate-700">
              <FileSpreadsheet className="w-16 h-16 mb-4 opacity-20" />
              <p>Selecciona una Matriz del historial o sube un archivo local</p>
            </div>
          )}
        </div>

        {/* STATUS FOOTER */}
        <div className="h-8 bg-slate-900 border-t border-slate-800 flex items-center justify-between px-4 text-[10px] text-slate-500">
          <span>{workbook ? `${sheets.length} Hojas detectadas` : 'Sin libro activo'}</span>
          <span>Vista: {selectedSheet || '-'}</span>
        </div>
      </div>
    </div>
  );
}
