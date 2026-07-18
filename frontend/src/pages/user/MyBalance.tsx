import { useState, useEffect } from 'react';
import {
  Wallet,
  CircleArrowUp,
  CircleArrowDown,
  Download,
  Calendar,
  AlertCircle,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { apiClient } from '../../clients/apiClient';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const MyBalance = () => {
  const { user: currentUser } = useAuth();
  const [balanceData, setBalanceData] = useState<{
    totalIngresos: number;
    totalTaller: number;
    totalSanciones: number;
    totalDeducciones: number;
    saldoNeto: number;
    hashVerificacion: string;
  } | null>(null);
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (currentUser) {
      loadOfficialBalance();
    }
  }, [currentUser]);

  const loadOfficialBalance = async () => {
    try {
      setLoading(true);
      const res = await apiClient.get<{ balance: any }>('/api/shifts/balance-oficial');
      setBalanceData((res.data as any)?.balance || (res as any)?.balance);
    } catch (err) {
      console.error('Error al cargar balance oficial:', err);
      setError('Error al calcular el balance oficial');
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadPDF = () => {
    if (!balanceData) return;
    try {
      const doc = new jsPDF();
      const nombre = (currentUser as any)?.fullName ?? (currentUser as any)?.internalNumber ?? 'Usuario';
      
      doc.setFontSize(16);
      doc.text(`Balance Oficial — ${nombre}`, 14, 18);
      
      doc.setFontSize(10);
      doc.setTextColor(120);
      doc.text(`Fecha de emisión: ${new Date().toLocaleString()}`, 14, 25);
      
      doc.setTextColor(0);
      doc.setFontSize(12);
      
      autoTable(doc, {
        startY: 35,
        head: [['Concepto', 'Monto']],
        body: [
          ['Ingresos por Turnos (M1)', `$${balanceData.totalIngresos}`],
          ['Deducciones Taller (M7)', `-$${balanceData.totalTaller}`],
          ['Deducciones Sanciones (M8)', `-$${balanceData.totalSanciones}`],
          ['Saldo Neto a Cobrar', `$${balanceData.saldoNeto}`]
        ],
        theme: 'striped',
        styles: { fontSize: 11 }
      });

      // Insertar Hash de Verificación (Inmutabilidad)
      const finalY = (doc as any).lastAutoTable.finalY || 80;
      doc.setFontSize(8);
      doc.setTextColor(150);
      doc.text(`Firma Criptográfica (SHA-256): ${balanceData.hashVerificacion}`, 14, finalY + 15);
      
      doc.save('balance_oficial.pdf');
    } catch (err) {
      console.error('Error generando PDF:', err);
      alert('Hubo un error al generar el PDF.');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full min-h-[400px]">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-slate-400 font-medium">Calculando Balance Oficial...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8">
        <div className="bg-red-500/10 border border-red-500/50 rounded-lg p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
          <div>
            <h3 className="text-red-500 font-medium">Error de cálculo</h3>
            <p className="text-red-400 text-sm mt-1">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-6 pb-24">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Wallet className="w-6 h-6 text-emerald-400" />
            Balance Oficial
          </h1>
          <p className="text-slate-400 mt-1">Liquidación consolidada (M1, M7, M8)</p>
        </div>
        
        <button
          onClick={handleDownloadPDF}
          className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg transition-colors border border-slate-700 w-full md:w-auto justify-center"
        >
          <Download className="w-4 h-4" />
          Exportar PDF Certificado
        </button>
      </div>

      {balanceData && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <div className="bg-slate-900 border border-slate-700 p-5 rounded-xl">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-slate-400 text-sm font-medium">Total Ingresos</p>
                <p className="text-2xl font-bold text-emerald-400 mt-1">
                  ${balanceData.totalIngresos}
                </p>
              </div>
              <div className="p-2 bg-emerald-500/10 rounded-lg">
                <CircleArrowUp className="w-5 h-5 text-emerald-500" />
              </div>
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-700 p-5 rounded-xl">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-slate-400 text-sm font-medium">Costos Taller (M7)</p>
                <p className="text-2xl font-bold text-red-400 mt-1">
                  ${balanceData.totalTaller}
                </p>
              </div>
              <div className="p-2 bg-red-500/10 rounded-lg">
                <CircleArrowDown className="w-5 h-5 text-red-500" />
              </div>
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-700 p-5 rounded-xl">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-slate-400 text-sm font-medium">Sanciones (M8)</p>
                <p className="text-2xl font-bold text-red-400 mt-1">
                  ${balanceData.totalSanciones}
                </p>
              </div>
              <div className="p-2 bg-red-500/10 rounded-lg">
                <CircleArrowDown className="w-5 h-5 text-red-500" />
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-br from-emerald-900/50 to-slate-900 border border-emerald-500/30 p-5 rounded-xl">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-emerald-200/70 text-sm font-medium">Saldo Neto a Cobrar</p>
                <p className="text-3xl font-bold text-emerald-400 mt-1">
                  ${balanceData.saldoNeto}
                </p>
              </div>
              <div className="p-2 bg-emerald-500/20 rounded-lg">
                <Wallet className="w-6 h-6 text-emerald-400" />
              </div>
            </div>
          </div>
        </div>
      )}

      {balanceData && (
        <div className="bg-slate-900 border border-slate-700 rounded-xl p-4">
          <p className="text-xs text-slate-500 break-all font-mono">
            HASH VALIDACIÓN: {balanceData.hashVerificacion}
          </p>
        </div>
      )}
    </div>
  );
};

export default MyBalance;
