
import { useState, useEffect } from 'react';
import versionData from '../version.json';

const BuildTag = () => {
    return (
        <div className="fixed bottom-0 left-0 right-0 bg-black text-green-500 text-[10px] font-mono py-1 px-4 flex justify-between items-center z-[9999] opacity-80 hover:opacity-100 transition-opacity">
            <div className="flex gap-4">
                <span>🟢 SISTEMA ONLINE</span>
                <span>Rama: {versionData.branch}</span>
                <span>Ver: {versionData.commit}</span>
                <span>Build: {versionData.buildId}</span>
            </div>
            <div>
                Actualizado: {versionData.timestamp}
            </div>
        </div>
    );
};

export default BuildTag;
