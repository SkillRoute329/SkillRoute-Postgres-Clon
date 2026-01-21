
export interface EntityColumn {
    key: string;
    label: string;
    type: 'text' | 'number' | 'date' | 'boolean' | 'enum' | 'json';
    options?: string[]; // For enums
    editable?: boolean;
    required?: boolean;
    hiddenInTable?: boolean; // Para campos solo de formulario
}

export interface EntityActionPermissions {
    import: boolean;
    export: boolean;
    edit: boolean;
    delete: boolean;
    create: boolean;
}

export interface EntityLabels {
    title: string;
    singular: string;
    plural: string;
}

export interface EntityConfig {
    columns: EntityColumn[];
    apiPath: string; // Endpoint base en backend (universal/:entity) pero mapeado internamente
    actions: EntityActionPermissions;
    labels: EntityLabels;
    pdfTitle?: string;
}

export const ENTITY_REGISTRY: Record<string, EntityConfig> = {
    'USERS': {
        labels: {
            title: 'Gestión de Usuarios',
            singular: 'Usuario',
            plural: 'Usuarios'
        },
        apiPath: 'users',
        actions: { import: true, export: true, edit: true, delete: true, create: true },
        columns: [
            { key: 'internalNumber', label: 'Interno', type: 'text', required: true, editable: true },
            { key: 'firstName', label: 'Nombre', type: 'text', required: true, editable: true },
            { key: 'lastName', label: 'Apellido', type: 'text', required: true, editable: true },
            { key: 'email', label: 'Email', type: 'text', editable: true },
            { key: 'role', label: 'Rol', type: 'enum', options: ['User', 'Admin', 'SuperAdmin', 'Inspector'], required: true, editable: true },
            { key: 'driverStatus', label: 'Estado', type: 'enum', options: ['A_LA_ORDEN', 'EFECTIVO_COCHE', 'LICENCIA_MEDICA'], editable: true },
            { key: 'passwordHash', label: 'Password', type: 'text', hiddenInTable: true, editable: true } // Cuidado con esto en prod, idealmente un campo virtual
        ]
    },
    'STOCK': { // Mapped to Vehicles internally for now as Fleet Inventory
        labels: {
            title: 'Inventario de Flota',
            singular: 'Vehículo',
            plural: 'Vehículos'
        },
        apiPath: 'vehicles',
        pdfTitle: 'REPORTE DE FLOTA Y STOCK',
        actions: { import: true, export: true, edit: true, delete: true, create: true },
        columns: [
            { key: 'internalNumber', label: 'Coche', type: 'text', required: true, editable: true },
            { key: 'plate', label: 'Matrícula', type: 'text', editable: true },
            { key: 'make', label: 'Marca', type: 'text', editable: true },
            { key: 'model', label: 'Modelo', type: 'text', editable: true },
            { key: 'status', label: 'Estado', type: 'enum', options: ['OPERATIONAL', 'MAINTENANCE', 'STOPPED'], editable: true },
            { key: 'year', label: 'Año', type: 'number', editable: true }
        ]
    },
    'SERVICES': { // ServiceDefinitions
        labels: {
            title: 'Rotación de Servicios',
            singular: 'Servicio',
            plural: 'Servicios'
        },
        apiPath: 'service-definitions',
        actions: { import: true, export: true, edit: true, delete: true, create: true },
        columns: [
            { key: 'serviceNumber', label: 'Nro. Servicio', type: 'text', required: true, editable: true },
            { key: 'serviceCode', label: 'Código (ID)', type: 'text', required: true, editable: true },
            { key: 'line', label: 'Línea', type: 'text', required: true, editable: true },
            { key: 'dayType', label: 'Tipo Día', type: 'enum', options: ['HABIL', 'SABADO', 'DOMINGO'], required: true, editable: true },
            { key: 'startTime', label: 'Salida', type: 'text', required: true, editable: true },
            { key: 'endTime', label: 'Llegada', type: 'text', editable: true },
            { key: 'variant', label: 'Variante', type: 'text', editable: true }
        ]
    },
    'ROAD_ALERTS': {
        labels: {
            title: 'Alertas Viales (Waze)',
            singular: 'Alerta',
            plural: 'Alertas'
        },
        apiPath: 'roadAlerts',
        actions: { import: false, export: true, edit: true, delete: true, create: true },
        columns: [
            { key: 'type', label: 'Tipo', type: 'enum', options: ['ACCIDENTE', 'FERIA', 'DESVIO', 'MANIFESTACION', 'OBRAS'], required: true, editable: true },
            { key: 'title', label: 'Título', type: 'text', required: true, editable: true },
            { key: 'description', label: 'Descripción', type: 'text', editable: true },
            { key: 'severity', label: 'Severidad', type: 'enum', options: ['LOW', 'MEDIUM', 'HIGH'], editable: true },
            { key: 'affectedLine', label: 'Línea Afectada', type: 'text', editable: true },
            { key: 'latitude', label: 'Lat', type: 'number', editable: true },
            { key: 'longitude', label: 'Lon', type: 'number', editable: true },
        ]
    }
};
