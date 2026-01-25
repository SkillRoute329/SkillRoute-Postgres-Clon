
import { useEffect, useState, useRef } from 'react';
import { API_URL } from '../services/api';

const POLLING_INTERVAL = 60 * 1000; // 60 seconds

export const useVersionCheck = () => {
    const [isUpdating, setIsUpdating] = useState(false);
    const [serverVersion, setServerVersion] = useState<string | null>(null);
    const initialBootId = useRef<string | null>(null);

    const checkVersion = async () => {
        try {
            // Use fetch to bypass axios interceptors that might redirect to login
            const res = await fetch(`${API_URL}/health?_t=${Date.now()}`);
            if (!res.ok) return;

            const data = await res.json();
            const { bootId, version } = data;

            // Initialize on first successful check
            if (!initialBootId.current) {
                initialBootId.current = bootId;
                setServerVersion(version);
                return;
            }

            // DETECT CHANGE
            if (bootId && initialBootId.current !== bootId) {
                console.log(`🚨 [VERSION GUARD] Mismatch detected! Local: ${initialBootId.current} vs Server: ${bootId}`);
                triggerUpdate();
            }

        } catch (error) {
            console.warn('[VERSION GUARD] Check failed (offline?)', error);
        }
    };

    const triggerUpdate = () => {
        setIsUpdating(true);

        // 1. Nuke Service Workers
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.getRegistrations().then(registrations => {
                for (let registration of registrations) {
                    registration.unregister();
                }
            });
        }

        // 2. Clear Caches
        if ('caches' in window) {
            caches.keys().then((names) => {
                names.forEach(name => caches.delete(name));
            });
        }

        // 3. Clear Storage
        // We preserve 'auth' token if possible? No, Prompt says "Force immediately void cache".
        // Use prudent clearing. Maybe keep token to avoid re-login if token is valid?
        // But if backend changed significantly, token format might differ.
        // Let's keep it safe: Nuke everything.
        localStorage.clear();
        sessionStorage.clear();

        // 4. Force Reload with visual delay
        setTimeout(() => {
            window.location.reload();
        }, 2000);
    };

    useEffect(() => {
        // Check on Mount
        checkVersion();

        // Check on Interval
        const intervalId = setInterval(checkVersion, POLLING_INTERVAL);

        // Check on Window Focus
        const handleFocus = () => {
            checkVersion();
        };
        window.addEventListener('focus', handleFocus);

        return () => {
            clearInterval(intervalId);
            window.removeEventListener('focus', handleFocus);
        };
    }, []);

    return { isUpdating, serverVersion };
};
