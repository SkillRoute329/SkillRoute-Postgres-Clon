
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
    importerTemplate?: string;
}

export const ENTITY_REGISTRY: Record<string, EntityConfig> = {
    'USERS': {
        labels: {
            title: 'Gestión de Personal (RRHH)',
            singular: 'Empleado',
            plural: 'Personal'
        },
        apiPath: 'users',
        importerTemplate: "/templates/plantilla_personal.xlsx",
        actions: { import: true, export: true, edit: true, delete: true, create: true },
        columns: [
            { key: 'internalNumber', label: 'Legajo', type: 'text', required: true, editable: true },
            { key: 'fullName', label: 'Nombre Completo', type: 'text', required: true, editable: true },
            { key: 'role', label: 'Rol', type: 'enum', options: ['User', 'Admin', 'SuperAdmin', 'Inspector'], required: true, editable: true },
            { key: 'assignedVehicleId', label: 'Coche Fijo (ID)', type: 'number', editable: true },
            { key: 'licenseExpirationDate', label: 'Vencimiento Libreta', type: 'date', editable: true } // Placeholder, will fail if not in DB but requested
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
    'ROTATION': {
        labels: {
            title: 'Matriz de Rotación',
            singular: 'Asignación',
            plural: 'Asignaciones'
        },
        apiPath: 'rotation',
        actions: { import: true, export: true, edit: true, delete: true, create: true },
        columns: [
            { key: 'line', label: 'Línea', type: 'text', required: true, editable: true },
            { key: 'serviceNumber', label: 'Turno', type: 'text', required: true, editable: true },
            { key: 'startTime', label: 'Hora Salida', type: 'text', required: true, editable: true },
            { key: 'assignedVehicleId', label: 'Coche (ID)', type: 'number', editable: true },
            // Chofer not directly supported in flat ServiceDefinition import without relation logic
        ]
    },
    'BULLETINS': {
        labels: {
            title: 'Boletines y Horarios',
            singular: 'Boletín',
            plural: 'Boletines'
        },
        apiPath: 'bulletins',
        actions: { import: true, export: true, edit: true, delete: true, create: true },
        columns: [
            { key: 'line', label: 'Línea', type: 'text', required: true, editable: true },
            { key: 'dayType', label: 'Tipo Día', type: 'enum', options: ['HABIL', 'SABADO', 'DOMINGO'], required: true, editable: true },
            { key: 'serviceCode', label: 'Frecuencia (Ref)', type: 'text', editable: true },
            { key: 'startTime', label: 'Hora Inicio', type: 'text', required: true, editable: true }
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
    },
    'PLANNED_DETOURS': {
        labels: {
            title: 'Desvíos Programados',
            singular: 'Desvío',
            plural: 'Desvíos'
        },
        apiPath: 'plannedDetours',
        actions: { import: false, export: true, edit: true, delete: true, create: true },
        columns: [
            { key: 'name', label: 'Nombre', type: 'text', required: true, editable: true },
            { key: 'affectedLines', label: 'Líneas', type: 'text', required: true, editable: true },
            { key: 'days', label: 'Días', type: 'text', required: true, editable: true },
            { key: 'startTime', label: 'Inicio', type: 'text', editable: true },
            { key: 'endTime', label: 'Fin', type: 'text', editable: true },
            { key: 'geometry', label: 'Geometría JSON', type: 'json', editable: true },
            { key: 'isActive', label: 'Activo', type: 'boolean', editable: true }
        ]
    },
    'MASTER_ROUTES': {
        labels: {
            title: 'Rutas y Recorridos',
            singular: 'Recorrido',
            plural: 'Recorridos'
        },
        apiPath: 'masterRoutes',
        actions: { import: false, export: true, edit: true, delete: true, create: true },
        columns: [
            { key: 'line', label: 'Línea', type: 'text', required: true, editable: true },
            { key: 'variant', label: 'Variante', type: 'text', required: true, editable: true },
            { key: 'origin', label: 'Origen', type: 'text', editable: true },
            { key: 'destination', label: 'Destino', type: 'text', editable: true },
            { key: 'geometry', label: 'Geometría (JSON)', type: 'json', editable: true },
            { key: 'isActive', label: 'Activo', type: 'boolean', editable: true }
        ]
    },
    'RADARS': {
        labels: {
            title: 'Cámaras y Radares',
            singular: 'Radar',
            plural: 'Radares'
        },
        apiPath: 'radars',
        actions: { import: true, export: true, edit: true, delete: true, create: true },
        columns: [
            { key: 'name', label: 'Nombre', type: 'text', required: true, editable: true },
            { key: 'latitude', label: 'Latitud', type: 'number', required: true, editable: true },
            { key: 'longitude', label: 'Longitud', type: 'number', required: true, editable: true },
            { key: 'speedLimit', label: 'Límite (km/h)', type: 'number', required: true, editable: true },
            { key: 'type', label: 'Tipo', type: 'enum', options: ['CAMERA', 'RADAR', 'DANGEROUS_CURVE'], required: true, editable: true }
        ]
    }
};
