/**
 * Skeleton — Componente de loading state unificado para toda la app.
 *
 * Uso:
 *   <Skeleton />                          → línea de texto
 *   <Skeleton variant="card" />           → tarjeta completa
 *   <Skeleton variant="table" rows={5} /> → tabla con N filas
 *   <Skeleton variant="stat" />           → widget de estadística
 *   <Skeleton variant="list" rows={4} />  → lista de elementos
 */

function pulse(className: string) {
  return `animate-pulse bg-slate-800 rounded ${className}`;
}

function SkeletonBase({ className = '' }: { className?: string }) {
  return <div className={pulse(className)} />;
}

function SkeletonCard() {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3 animate-pulse">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-slate-800 rounded-lg" />
        <div className="flex-1 space-y-2">
          <div className="h-4 bg-slate-800 rounded w-3/4" />
          <div className="h-3 bg-slate-800 rounded w-1/2" />
        </div>
      </div>
      <div className="space-y-2">
        <div className="h-3 bg-slate-800 rounded w-full" />
        <div className="h-3 bg-slate-800 rounded w-5/6" />
        <div className="h-3 bg-slate-800 rounded w-4/6" />
      </div>
    </div>
  );
}

function SkeletonTable({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-1 animate-pulse">
      {/* Header */}
      <div className="flex gap-3 px-3 py-2 border-b border-slate-800">
        {[40, 100, 80, 120, 80].map((w, i) => (
          <div key={i} className="h-3 bg-slate-700 rounded" style={{ width: w }} />
        ))}
      </div>
      {/* Rows */}
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-3 px-3 py-2.5">
          {[40, 100, 80, 120, 80].map((w, j) => (
            <div key={j} className="h-3 bg-slate-800 rounded" style={{ width: w }} />
          ))}
        </div>
      ))}
    </div>
  );
}

function SkeletonStat() {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 animate-pulse">
      <div className="flex items-center justify-between mb-3">
        <div className="h-3 bg-slate-800 rounded w-24" />
        <div className="w-8 h-8 bg-slate-800 rounded-lg" />
      </div>
      <div className="h-8 bg-slate-800 rounded w-20 mb-1" />
      <div className="h-3 bg-slate-800 rounded w-32" />
    </div>
  );
}

function SkeletonList({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-2 animate-pulse">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 bg-slate-900 border border-slate-800 rounded-xl px-4 py-3">
          <div className="w-9 h-9 bg-slate-800 rounded-full shrink-0" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3.5 bg-slate-800 rounded w-3/4" />
            <div className="h-3 bg-slate-800 rounded w-1/2" />
          </div>
          <div className="w-16 h-5 bg-slate-800 rounded-full" />
        </div>
      ))}
    </div>
  );
}

function SkeletonPage() {
  return (
    <div className="space-y-4 p-4 animate-pulse">
      {/* Title */}
      <div className="h-6 bg-slate-800 rounded w-48" />
      <div className="h-3 bg-slate-800 rounded w-72" />
      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonStat key={i} />
        ))}
      </div>
      {/* Content */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SkeletonCard />
        <SkeletonCard />
      </div>
      <SkeletonTable rows={6} />
    </div>
  );
}

// ─── Public API ───────────────────────────────────────────────────────────────

type SkeletonVariant = 'line' | 'card' | 'table' | 'stat' | 'list' | 'page';

interface SkeletonProps {
  variant?: SkeletonVariant;
  rows?: number;
  className?: string;
}

export function Skeleton({ variant = 'line', rows, className }: SkeletonProps) {
  switch (variant) {
    case 'card':  return <SkeletonCard />;
    case 'table': return <SkeletonTable rows={rows} />;
    case 'stat':  return <SkeletonStat />;
    case 'list':  return <SkeletonList rows={rows} />;
    case 'page':  return <SkeletonPage />;
    default:      return <SkeletonBase className={className || 'h-4 w-full'} />;
  }
}

export default Skeleton;
