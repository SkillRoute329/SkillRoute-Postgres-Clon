import { useEffect, useState } from 'react';
import { getLoadedVersion, type AppVersion } from '../utils/appVersion';

/**
 * Badge minúsculo fijo en la esquina inferior-izquierda que muestra el
 * buildId actualmente cargado en el navegador. Permite verificar de un
 * vistazo si el cliente está corriendo la última versión desplegada.
 */
export default function BuildBadge() {
  const [version, setVersion] = useState<AppVersion | null>(getLoadedVersion());

  useEffect(() => {
    if (version) return;
    const t = window.setInterval(() => {
      const v = getLoadedVersion();
      if (v) {
        setVersion(v);
        window.clearInterval(t);
      }
    }, 500);
    return () => window.clearInterval(t);
  }, [version]);

  if (!version) return null;

  const fechaCorta = version.builtAt?.slice(0, 16).replace('T', ' ') ?? '';

  return (
    <div
      title={`build ${version.buildId}\ncommit ${version.commit}\nbuilt ${version.builtAt}`}
      style={{
        position: 'fixed',
        bottom: 6,
        left: 6,
        zIndex: 9999,
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        fontSize: 9,
        lineHeight: 1.2,
        color: '#64748b',
        background: 'rgba(15,23,42,0.55)',
        border: '1px solid rgba(148,163,184,0.18)',
        borderRadius: 6,
        padding: '2px 6px',
        pointerEvents: 'none',
        letterSpacing: 0.2,
      }}
    >
      build {version.commit} · {fechaCorta}
    </div>
  );
}
