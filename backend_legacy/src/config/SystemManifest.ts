
export const SYSTEM_MODULES = [
    {
        key: 'TRAFFIC',
        label: 'Departamento de Tránsito',
        icon: 'Bus',
        roles: ['ADMIN', 'SUPER_ADMIN'],
        subItems: [
            { label: 'Boletines (Inspectores)', path: '/admin/boletines' },
            { label: 'Rotación de Servicios', path: '/admin/rotacion' },
            { label: 'Mapas / Navegación', path: '/admin/navegador' },
            { label: 'Sugerencias de Horarios', path: '/admin/transito/sugerencias' },
            { label: 'Optimización de Cartones', path: '/admin/transito/optimizacion' }
        ]
    },
    {
        key: 'FLEET',
        label: 'Flota & Mantenimiento',
        icon: 'Wrenches',
        roles: ['MAINTENANCE_MANAGER', 'SUPER_ADMIN'],
        subItems: [
            { label: 'Estado de Coches', path: '/admin/flota/estado' },
            { label: 'Reportes Técnicos', path: '/admin/mantenimiento' }
        ]
    },
    {
        key: 'HR',
        label: 'Recursos Humanos',
        icon: 'Users',
        roles: ['HR_MANAGER', 'SUPER_ADMIN'],
        subItems: [
            { label: 'Legajos', path: '/admin/rrhh/legajos' },
            { label: 'Solicitudes', path: '/admin/rrhh/solicitudes' },
            { label: 'Ranking de Choferes', path: '/admin/rrhh/ranking' },
            { label: 'Evaluaciones', path: '/admin/rrhh/evaluaciones' }
        ]
    },
    {
        key: 'INTELLIGENCE',
        label: 'Inteligencia Competitiva',
        icon: 'Spy',
        roles: ['SUPER_ADMIN'],
        subItems: [
            { label: 'Radar de Competencia', path: '/admin/competencia' },
            { label: 'Mapas de Calor', path: '/admin/heatmaps' }
        ]
    },
    {
        key: 'OPERATIONS',
        label: 'Control en Vía (Inspector)',
        icon: 'StopSign',
        roles: ['INSPECTOR', 'SUPER_ADMIN', 'ADMIN'],
        subItems: [
            {
                label: 'Puesto de Control',
                path: '/ops/control-point',
                // action: 'manage_traffic', // Keeping simple structure
                // features: ['COMPETITOR_OVERLAY', 'AUTHORIZE_ADJUSTMENT'] 
            }
        ]
    }
];
