/**
 * Servicio Firestore: Asignación de Servicios ↔ Categorías de Vehículos.
 * Colección: service_category_assignments
 *
 * Cada documento establece una regla de rotación:
 *  - Un servicio (serviceNumber) pertenece a una categoría de vehículo (categoryId)
 *    para una temporada y tipo de día específicos.
 *
 * Esto permite que los coches de la categoría "Híbrido" solo roten entre los
 * servicios asignados a esa categoría en la programación diaria.
 */
import {
  collection,
  doc,
  getDocs,
  addDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../../config/firebase';

export interface ServiceCategoryAssignment {
  id?: string;
  /** Número de servicio (ej: "1001", "2290") */
  serviceNumber: string;
  /** Línea a la que pertenece (ej: "300", "370") */
  linea?: string;
  /** ID de la categoría de vehículo en vehicle_categories */
  categoryId: string;
  /** Nombre de la categoría (desnormalizado para consultas rápidas) */
  categoryName?: string;
  /** Temporada: VERANO_2026, INVIERNO_2026 */
  temporada: string;
  /** Tipo de día: HABIL, SABADO, DOMINGO_FESTIVO */
  tipoDia: string;
  /** Timestamp de creación */
  createdAt?: string;
  /** Usuario que creó la asignación */
  createdBy?: string;
}

const COL = 'service_category_assignments';

export const ServiceCategoryAssignmentService = {
  /** Obtener todas las asignaciones */
  async getAll(): Promise<ServiceCategoryAssignment[]> {
    const snap = await getDocs(collection(db, COL));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as ServiceCategoryAssignment);
  },

  /** Obtener asignaciones filtradas por temporada y tipo de día */
  async getBySeasonAndDay(
    temporada: string,
    tipoDia: string,
  ): Promise<ServiceCategoryAssignment[]> {
    const q = query(
      collection(db, COL),
      where('temporada', '==', temporada),
      where('tipoDia', '==', tipoDia),
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as ServiceCategoryAssignment);
  },

  /** Obtener asignaciones de una categoría específica */
  async getByCategory(categoryId: string): Promise<ServiceCategoryAssignment[]> {
    const q = query(collection(db, COL), where('categoryId', '==', categoryId));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as ServiceCategoryAssignment);
  },

  /** Suscripción en tiempo real con filtro */
  subscribe(
    temporada: string,
    tipoDia: string,
    callback: (assignments: ServiceCategoryAssignment[]) => void,
  ) {
    const q = query(
      collection(db, COL),
      where('temporada', '==', temporada),
      where('tipoDia', '==', tipoDia),
    );
    return onSnapshot(q, (snap) => {
      callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as ServiceCategoryAssignment));
    });
  },

  /** Suscripción global sin filtros */
  subscribeAll(callback: (assignments: ServiceCategoryAssignment[]) => void) {
    return onSnapshot(collection(db, COL), (snap) => {
      callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as ServiceCategoryAssignment));
    });
  },

  /** Crear una sola asignación */
  async create(data: Omit<ServiceCategoryAssignment, 'id'>): Promise<ServiceCategoryAssignment> {
    const docRef = await addDoc(collection(db, COL), {
      ...data,
      createdAt: new Date().toISOString(),
    });
    return { id: docRef.id, ...data };
  },

  /** Asignar múltiples servicios a una categoría en lote (batch) */
  async bulkAssign(
    serviceNumbers: string[],
    categoryId: string,
    categoryName: string,
    temporada: string,
    tipoDia: string,
    linea?: string,
    createdBy?: string,
  ): Promise<number> {
    const batch = writeBatch(db);
    let count = 0;

    for (const serviceNumber of serviceNumbers) {
      const docId = `${serviceNumber}_${categoryId}_${temporada}_${tipoDia}`;
      const ref = doc(db, COL, docId);
      batch.set(ref, {
        serviceNumber,
        categoryId,
        categoryName: categoryName || '',
        temporada,
        tipoDia,
        linea: linea || '',
        createdAt: new Date().toISOString(),
        createdBy: createdBy || '',
      });
      count++;

      // Firestore batch limit = 500
      if (count % 490 === 0) {
        await batch.commit();
      }
    }

    await batch.commit();
    return count;
  },

  /** Eliminar una asignación */
  async delete(id: string): Promise<void> {
    await deleteDoc(doc(db, COL, id));
  },

  /** Eliminar todas las asignaciones de una categoría para una temporada/día */
  async deleteByCategory(categoryId: string, temporada: string, tipoDia: string): Promise<number> {
    const q = query(
      collection(db, COL),
      where('categoryId', '==', categoryId),
      where('temporada', '==', temporada),
      where('tipoDia', '==', tipoDia),
    );
    const snap = await getDocs(q);
    const batch = writeBatch(db);
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    return snap.size;
  },

  /** Obtener resumen: cuántos servicios tiene cada categoría */
  async getSummary(
    temporada: string,
    tipoDia: string,
  ): Promise<Record<string, { categoryName: string; count: number; services: string[] }>> {
    const assignments = await this.getBySeasonAndDay(temporada, tipoDia);
    const summary: Record<string, { categoryName: string; count: number; services: string[] }> = {};

    for (const a of assignments) {
      if (!summary[a.categoryId]) {
        summary[a.categoryId] = { categoryName: a.categoryName || '', count: 0, services: [] };
      }
      summary[a.categoryId].count++;
      summary[a.categoryId].services.push(a.serviceNumber);
    }

    return summary;
  },
};
