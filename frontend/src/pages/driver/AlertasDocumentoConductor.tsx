/**
 * AlertasDocumentoConductor.tsx
 *
 * Banner compacto que alerta al conductor sobre vencimientos próximos
 * de documentación habilitante (carnet de salud, libreta).
 *
 * Lee: fichas_medicas donde uid == currentUser.uid
 * Criterios:
 *   - Carnet de salud vencido       → banner rojo
 *   - Carnet vence en < 30 días     → banner ámbar
 *   - Libreta habilitante vencida   → banner rojo
 *   - Libreta vence en < 60 días    → banner ámbar
 *   - Todo vigente                  → badge verde "Documentos al día"
 */

import { useState, useEffect } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { useAuth } from '../../context/AuthContext';
import { AlertTriangle, CheckCircle, FileText } from 'lucide-react';

interface Alerta {
  tipo: 'rojo' | 'ambar';
  mensaje: string;
}

export default function AlertasDocumentoConductor() {
  const { user } = useAuth();
  const [alertas, setAlertas] = useState<Alerta[]>([]);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    if (!user?.uid) return;
    let cancelado = false;

    (async () => {
      try {
        const q = query(
          collection(db, 'fichas_medicas'),
          where('uid', '==', user.uid)
        );
        const snap = await getDocs(q);
        if (cancelado) return;

        if (snap.empty) {
          setAlertas([]);
          setCargando(false);
          return;
        }

        const ficha = snap.docs[0].data();
        const hoy = new Date();
        const resultado: Alerta[] = [];

        // Evalúa una fecha de vencimiento y agrega alerta si corresponde
        function evalVencimiento(
          campoFecha: unknown,
          nombreDoc: string,
          diasUmbral: number
        ) {
          if (!campoFecha) return;
          const fechaVenc = campoFecha instanceof Date
            ? campoFecha
            : (campoFecha as { toDate?: () => Date }).toDate?.()
              ?? new Date(campoFecha as string);

          const diasRestantes = Math.ceil(
            (fechaVenc.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24)
          );
          const fechaStr = fechaVenc.toLocaleDateString('es-UY', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
          });

          if (diasRestantes < 0) {
            resultado.push({
              tipo: 'rojo',
              mensaje: `Tu ${nombreDoc} venció el ${fechaStr} — renovalo antes de manejar`,
            });
          } else if (diasRestantes <= diasUmbral) {
            resultado.push({
              tipo: 'ambar',
              mensaje: `Tu ${nombreDoc} vence en ${diasRestantes} día${diasRestantes !== 1 ? 's' : ''} (${fechaStr}) — renovar pronto`,
            });
          }
        }

        evalVencimiento(
          ficha.carnet_salud_vencimiento ?? ficha.carnetSaludVencimiento,
          'carnet de salud',
          30
        );
        evalVencimiento(
          ficha.libreta_vencimiento ?? ficha.libreraVencimiento ?? ficha.libreHabVencimiento,
          'libreta habilitante',
          60
        );

        setAlertas(resultado);
      } catch {
        // No bloquear la pantalla si falla — es complementario
        setAlertas([]);
      } finally {
        if (!cancelado) setCargando(false);
      }
    })();

    return () => { cancelado = true; };
  }, [user?.uid]);

  if (cargando || !user?.uid) return null;

  // Todo al día
  if (alertas.length === 0) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 w-fit">
        <CheckCircle className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
        <span className="text-xs font-semibold text-emerald-300">
          Documentos al día
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {alertas.map((alerta, i) => (
        <div
          key={i}
          className={`flex items-start gap-2.5 px-4 py-3 rounded-xl border text-sm ${
            alerta.tipo === 'rojo'
              ? 'bg-red-500/10 border-red-500/30 text-red-300'
              : 'bg-yellow-500/10 border-yellow-500/30 text-yellow-300'
          }`}
        >
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <div className="flex items-start gap-1.5 flex-wrap">
            <FileText className="w-3.5 h-3.5 shrink-0 mt-0.5 opacity-70" />
            <span>{alerta.mensaje}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
