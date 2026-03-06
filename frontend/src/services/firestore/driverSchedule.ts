import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { db } from '../../config/firebase';

const COL = 'daily_shifts';

export const DriverService = {
  async getSchedule(month: number, year: number, _viewMode?: string): Promise<unknown[]> {
    const start = `${year}-${String(month).padStart(2, '0')}-01`;
    const end = `${year}-${String(month).padStart(2, '0')}-31`;
    const q = query(
      collection(db, COL),
      where('date', '>=', start),
      where('date', '<=', end),
      orderBy('date', 'asc'),
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  },
};
