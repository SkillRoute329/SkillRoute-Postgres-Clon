
export const SYSTEM_MODULES = [
    {
        key: 'TRAFFIC',
        label: 'Departamento de Tránsito',
        icon: 'Bus',
        roles: ['ADMIN', 'SUPER_ADMIN'],
        subItems: [
            { label: 'Boletines (Inspectores)', path: '/admin/boletines' },
            { label: 'Rotación de Servicios', path: '/admin/rotacion' },
            { label: 'Mapas / Navegación', path: '/admin/navegador' }
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
            { label: 'Solicitudes', path: '/admin/rrhh/solicitudes' }
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
    }
];
