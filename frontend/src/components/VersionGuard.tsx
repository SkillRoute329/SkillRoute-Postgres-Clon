
import React, { useEffect, useState } from 'react';
import { API_URL } from '../services/api';

const CHECK_INTERVAL = 30 * 1000; // 30 seconds

export const VersionGuard = () => {
    const [bootId, setBootId] = useState<string | null>(null);

    useEffect(() => {
        const checkVersion = async () => {
            try {
                // Use fetch directly to bypass potential axios interceptors or just to be raw
                const res = await fetch(`${API_URL}/health?_t=${Date.now()}`);
                if (!res.ok) return;

                const data = await res.json();
                const serverBootId = data.bootId;

                if (!serverBootId) return;

                setBootId(prev => {
                    if (prev && prev !== serverBootId) {
                        console.log(`[UPDATE] New Server Boot ID detected: ${serverBootId}. Refreshing...`);

                        // Force aggressive reload to clear cache
                        if ('serviceWorker' in navigator) {
                            navigator.serviceWorker.getRegistrations().then(registrations => {
                                for (let registration of registrations) {
                                    registration.unregister();
                                }
                            });
                        }

                        // Show brief toast if possible, then reload
                        // Just reload for "Ley nunca fallar" speed
                        window.location.reload();
                    }
                    return serverBootId;
                });
            } catch (error) {
                // Ignore network errors (maybe offline)
            }
        };

        // Initial check
        checkVersion();

        // Interval
        const interval = setInterval(checkVersion, CHECK_INTERVAL);
        return () => clearInterval(interval);
    }, []);

    return null; // Invisible sentinel
};
