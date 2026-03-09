import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, QueryConstraint } from 'firebase/firestore';
import { db } from '../config/firebase';

/**
 * useFirestoreCollection - Real-time subscription hook
 * @param collectionName Firestore collection path
 * @param constraints Optional query constraints (where, limit, etc.)
 * @param sortBy Optional sort field (default: createdAt desc if field exists)
 */
export const useFirestoreCollection = <T = any>(
  collectionName: string,
  constraints: QueryConstraint[] = [],
) => {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<any>(null);

  useEffect(() => {
    setLoading(true);
    const ref = collection(db, collectionName);
    const q = query(ref, ...constraints);

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const items = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as T[];
        setData(items);
        setLoading(false);
      },
      (err) => {
        console.error(`[useFirestoreCollection] Error in ${collectionName}:`, err);
        setError(err);
        setLoading(false);
      },
    );

    return () => unsubscribe();
  }, [collectionName]); // Dependencies? Constraints might need deep equal check or memoization by user

  return { data, loading, error };
};
