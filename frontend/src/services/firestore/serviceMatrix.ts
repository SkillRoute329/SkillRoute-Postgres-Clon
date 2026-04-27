import {
  collection,
  query,
  orderBy,
  where,
  onSnapshot,
  addDoc,
  serverTimestamp,
  doc,
  getDoc,
  deleteDoc,
} from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import { db, storage } from '../../config/firebase';

const COL = 'service_matrices';
const STORAGE_PREFIX = 'matrices';

export const ServiceMatrixService = {
  /**
   * Suscribe al historial de matrices filtrando por empresa.
   * Si empresaId es null/undefined, trae todas (comportamiento legacy para SuperAdmin sin empresa seleccionada).
   */
  subscribeToHistory(
    callback: (history: unknown[]) => void,
    empresaId?: number | null,
  ) {
    const base = collection(db, COL);
    const q =
      empresaId != null
        ? query(base, where('empresaId', '==', empresaId), orderBy('createdAt', 'desc'))
        : query(base, orderBy('createdAt', 'desc'));
    return onSnapshot(q, (snap) => {
      callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
  },

  /**
   * Sube el archivo a Firebase Storage (matrices/) con uploadBytesResumable y registra el documento en Firestore (service_matrices).
   * Solo debe invocarse para usuarios SuperAdmin (validación en UI o reglas).
   */
  async uploadMatrix(
    file: File,
    opts?: { uploadedBy?: string; area?: string; empresaId?: number },
  ): Promise<{ id: string; fileUrl: string; fileName: string; storagePath: string }> {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const storagePath = `${STORAGE_PREFIX}/${Date.now()}_${safeName}`;
    const storageRef = ref(storage, storagePath);

    await new Promise<void>((resolve, reject) => {
      const task = uploadBytesResumable(storageRef, file);
      task.on(
        'state_changed',
        () => {},
        (err) => reject(err),
        () => resolve(),
      );
    });
    const fileUrl = await getDownloadURL(storageRef);

    const docRef = await addDoc(collection(db, COL), {
      fileUrl,
      fileName: file.name,
      storagePath,
      uploadedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
      version: 1,
      uploadedBy: opts?.uploadedBy ?? null,
      area: opts?.area ?? 'Gral',
      empresaId: opts?.empresaId ?? null,
    });

    return { id: docRef.id, fileUrl, fileName: file.name, storagePath };
  },

  /**
   * Elimina el documento en Firestore y el archivo físico en Storage.
   * Solo debe invocarse para usuarios SuperAdmin (validación en UI).
   */
  async deleteMatrix(id: string): Promise<void> {
    const docRef = doc(db, COL, id);
    const snap = await getDoc(docRef);
    if (!snap.exists()) return;
    const data = snap.data();
    const storagePath = data?.storagePath as string | undefined;
    await deleteDoc(docRef);
    if (storagePath) {
      try {
        await deleteObject(ref(storage, storagePath));
      } catch (e) {
        console.warn('Storage delete failed (file may already be gone):', e);
      }
    }
  },
};
