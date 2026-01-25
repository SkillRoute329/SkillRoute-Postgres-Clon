
import { useState, useEffect } from 'react';
import versionData from '../version.json';
import { API_URL } from '../services/api';

const BuildTag = () => {
    const [serverInfo, setServerInfo] = useState<{ version: string, buildTime: string } | null>(null);

    useEffect(() => {
        fetch(`${API_URL}/version`)
            .then(res => res.json())
            .then(data => setServerInfo(data))
            .catch(() => setServerInfo({ version: 'Offline', buildTime: '-' }));
    }, []);

    return (
        <div className="fixed bottom-0 left-0 right-0 bg-black text-green-500 text-[10px] font-mono py-1 px-4 flex justify-between items-center z-[9999] opacity-80 hover:opacity-100 transition-opacity">
            <div className="flex gap-4">
                <span>🟢 CLIENT: {versionData.commit}</span>
                <span className={serverInfo?.version !== versionData.commit ? 'text-amber-500' : ''}>
                    📡 SERVER: {serverInfo ? serverInfo.version : 'Connecting...'}
                </span>
            </div>
            <div>
                Build: {serverInfo ? new Date(serverInfo.buildTime).toLocaleString() : versionData.timestamp}
            </div>
        </div>
    );
};

export default BuildTag;
