import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  collection,
  query,
  orderBy,
  limit,
  where,
  onSnapshot,
  doc,
  updateDoc,
  addDoc,
  serverTimestamp,
} from '../config/firestoreShim';
import { db } from '../config/firebase';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';

export interface FirestoreIncidencia {
  id: string;
  vehicleId?: string;
  lineaNombre?: string;
  lineaCodigo?: string;
  type?: string;
  status: 'ABIERTO' | 'EN_PROCESO' | 'CERRADO' | 'ANULADO';
  priority?: 'ALTA' | 'MEDIA' | 'BAJA' | 'CRITICA';
  description?: string;
  reportedBy?: { uid: string; name: string };
  createdAt?: { seconds: number; nanoseconds: number };
  closedAt?: { seconds: number; nanoseconds: number };
  source?: string;
  lat?: number;
  lng?: number;
  agency_id?: string;
  is_simulated?: boolean;
}

export function useIncidencias(docLimit: number = 20) {
  const { user } = useAuth();
  const [firestoreInc, setFirestoreInc] = useState<FirestoreIncidencia[]>([]);
  const [loading, setLoading] = useState(true);

  // Agency ID fallback: user.agencyId -> localStorage -> default '70' (UCOT)
  const agencyId = useMemo(() => {
    if (!user) return '70';
    const u = user as any;
    return String(u.agencyId || localStorage.getItem('skillroute.empresaPropia') || '70');
  }, [user]);

  useEffect(() => {
    let isMounted = true;
    
    // Filtro estricto por agency_id para multi-tenant (Arquitecto Escalabilidad)
    const q = query(
      collection(db, 'incidencias'),
      where('agency_id', '==', agencyId),
      orderBy('createdAt', 'desc'),
      limit(docLimit)
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        if (!isMounted) return;
        setFirestoreInc((prev) => {
          const prevMap = new Map(prev.map(p => [p.id, p]));
          return snap.docs.map((d) => {
            const serverData = { id: d.id, ...(d.data() as Omit<FirestoreIncidencia, 'id'>) };
            const localData = prevMap.get(d.id);
            if (localData && (localData.status === 'ANULADO' || localData.status === 'CERRADO') && serverData.status === 'ABIERTO') {
               return localData;
            }
            return { ...serverData, ...localData };
          });
        });
        setLoading(false);
      },
      (error) => {
        console.error("Error fetching incidencias:", error);
        if (isMounted) setLoading(false);
      }
    );
    return () => {
      isMounted = false;
      unsub();
    };
  }, [docLimit, agencyId]);

  // Auditoría: Registra acción en audit_logs (Auditor Transparencia Datos)
  const logAudit = async (action: string, entityId: string, details: any) => {
    if (!user) return;
    try {
      await addDoc(collection(db, 'audit_logs'), {
        action,
        entity: 'incidencia',
        entityId,
        details,
        user_id: user.uid || user.id,
        user_name: user.fullName || user.firstName,
        agency_id: agencyId,
        source_system: 'WEB_DESPACHO',
        timestamp_utc: serverTimestamp(), // Ensures server time (UTC by db)
      });
    } catch (e) {
      console.error("Error registrando auditoría:", e);
    }
  };

  const createIncidencia = useCallback(async (data: Partial<FirestoreIncidencia>, isSimulated: boolean = false) => {
    if (!user) {
      toast.error('No autenticado');
      return;
    }
    try {
      const payload = {
        ...data,
        status: 'ABIERTO',
        reportedBy: { uid: user.uid || user.id, name: user.fullName || user.firstName },
        source: 'DESPACHO',
        agency_id: agencyId,
        createdAt: serverTimestamp(),
        is_simulated: isSimulated,
      };
      const docRef = await addDoc(collection(db, 'incidencias'), payload);
      await logAudit('CREATE', docRef.id, payload);
      toast.success('Incidencia creada al instante');
      return docRef.id;
    } catch (e) {
      console.error(e);
      toast.error('Error al crear incidencia');
      throw e;
    }
  }, [user, agencyId]);

  const updateIncidencia = useCallback(async (id: string, data: Partial<FirestoreIncidencia>) => {
    setFirestoreInc((prev) =>
      prev.map((inc) => (inc.id === id ? { ...inc, ...data } : inc))
    );
    try {
      await updateDoc(doc(db, 'incidencias', id), data);
      await logAudit('UPDATE', id, data);
      toast.success('Incidencia actualizada');
    } catch (e) {
      console.error(e);
      toast.error('Error al actualizar incidencia');
      throw e;
    }
  }, [user, agencyId]);

  const anularIncidencia = useCallback(async (id: string) => {
    setFirestoreInc((prev) =>
      prev.map((inc) => (inc.id === id ? { ...inc, status: 'ANULADO' } : inc))
    );
    try {
      await updateDoc(doc(db, 'incidencias', id), {
        status: 'ANULADO',
        closedAt: serverTimestamp(),
      });
      await logAudit('SOFT_DELETE', id, { status: 'ANULADO' });
      toast.success('Incidencia anulada');
    } catch (e) {
      console.error(e);
      toast.error('Error al anular incidencia');
      throw e;
    }
  }, [user, agencyId]);

  const resolverIncidencia = useCallback(async (id: string) => {
    setFirestoreInc((prev) =>
      prev.map((inc) => (inc.id === id ? { ...inc, status: 'CERRADO' } : inc))
    );
    try {
      await updateDoc(doc(db, 'incidencias', id), {
        status: 'CERRADO',
        closedAt: serverTimestamp(),
      });
      await logAudit('RESOLVE', id, { status: 'CERRADO' });
      toast.success('Incidencia resuelta exitosamente');
    } catch (e) {
      console.error(e);
      toast.error('Error al resolver incidencia');
      throw e;
    }
  }, [user, agencyId]);

  return {
    incidencias: firestoreInc,
    loading,
    createIncidencia,
    updateIncidencia,
    anularIncidencia,
    resolverIncidencia,
  };
}
