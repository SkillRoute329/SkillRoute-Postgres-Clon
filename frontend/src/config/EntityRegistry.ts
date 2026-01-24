
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
            { key: 'role', label: 'Rol del Sistema', type: 'enum', options: ['User', 'Admin', 'SuperAdmin', 'Inspector'], required: true, editable: true },
            { key: 'internalNumber', label: 'Nro Interno', type: 'text', required: true, editable: true },
            { key: 'departmentId', label: 'ID Departamento', type: 'number', editable: true },
            { key: 'jobRoleId', label: 'ID Cargo', type: 'number', editable: true },
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
        actions: { import: true, export: true, edit: true, delete: true, create: true },
        columns: [
            { key: 'name', label: 'Nombre', type: 'text', required: true, editable: true },
            { key: 'street', label: 'Calle', type: 'text', editable: true },
            { key: 'startSection', label: 'Desde (Tramo)', type: 'text', editable: true },
            { key: 'endSection', label: 'Hasta (Tramo)', type: 'text', editable: true },
            { key: 'startDate', label: 'Fecha Inicio', type: 'date', editable: true },
            { key: 'endDate', label: 'Fecha Fin', type: 'date', editable: true },
            { key: 'affectedLines', label: 'Líneas', type: 'text', required: true, editable: true },
            { key: 'geometry', label: 'Geometría JSON', type: 'json', editable: true },
            { key: 'isActive', label: 'Activo', type: 'boolean', editable: true }
        ]
    },
    'TARIFFS': {
        labels: {
            title: 'Zonas Tarifarias',
            singular: 'Zona',
            plural: 'Zonas'
        },
        apiPath: 'tariffs', // Mapped to TariffZone
        actions: { import: true, export: true, edit: true, delete: true, create: true },
        columns: [
            { key: 'name', label: 'Nombre Zonal', type: 'text', required: true, editable: true },
            { key: 'price', label: 'Precio Común', type: 'number', editable: true },
            { key: 'differentialPrice', label: 'Precio Diferencial', type: 'number', editable: true },
            { key: 'type', label: 'Tipo', type: 'enum', options: ['POINT', 'POLYGON', 'CIRCLE'], editable: true },
            { key: 'latitude', label: 'Latitud', type: 'number', editable: true },
            { key: 'longitude', label: 'Longitud', type: 'number', editable: true },
            { key: 'geometry', label: 'WKT/JSON', type: 'json', editable: true }
        ]
    },
    'PARTS': {
        labels: {
            title: 'Inventario de Taller',
            singular: 'Repuesto',
            plural: 'Repuestos'
        },
        apiPath: 'parts', // Mapped to Part
        actions: { import: true, export: true, edit: true, delete: true, create: true },
        columns: [
            { key: 'sku', label: 'SKU / Código', type: 'text', required: true, editable: true },
            { key: 'description', label: 'Descripción', type: 'text', required: true, editable: true },
            { key: 'category', label: 'Categoría', type: 'enum', options: ['CONSUMIBLES', 'MOTORES', 'FRENOS', 'CARROCERIA', 'ELECTRICIDAD'], editable: true },
            { key: 'currentStock', label: 'Stock Actual', type: 'number', required: true, editable: true },
            { key: 'minStock', label: 'Stock Mínimo', type: 'number', editable: true },
            { key: 'location', label: 'Ubicación', type: 'text', editable: true },
            { key: 'unitCost', label: 'Costo Unitario ($)', type: 'number', editable: true }
        ]
    },
    'ROUTES': {
        labels: {
            title: 'Rutas y Recorridos',
            singular: 'Ruta',
            plural: 'Rutas'
        },
        apiPath: 'routes',
        actions: { import: true, export: true, edit: true, delete: true, create: true },
        columns: [
            { key: 'name', label: 'Línea', type: 'text', required: true, editable: true },
            { key: 'type', label: 'Tipo', type: 'enum', options: ['URBANA', 'SUBURBANA', 'LOCAL'], required: true, editable: true },
            { key: 'description', label: 'Descripción', type: 'text', editable: true }
        ]
    },
    'ROUTE_VARIANTS': {
        labels: {
            title: 'Variantes de Recorrido',
            singular: 'Variante',
            plural: 'Variantes'
        },
        apiPath: 'routeVariants',
        actions: { import: true, export: true, edit: true, delete: true, create: true },
        columns: [
            { key: 'routeId', label: 'ID Ruta', type: 'number', required: true, editable: true },
            { key: 'name', label: 'Nombre Variante', type: 'text', required: true, editable: true },
            { key: 'origin', label: 'Origen', type: 'text', editable: true },
            { key: 'destination', label: 'Destino', type: 'text', editable: true },
            { key: 'geometry', label: 'Geometría (JSON)', type: 'json', editable: true, hiddenInTable: true },
            { key: 'isActive', label: 'Activo', type: 'boolean', editable: true }
        ]
    },
    'RADAR': {
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
    },
    'DEPARTMENTS': {
        labels: {
            title: 'Departamentos y Áreas',
            singular: 'Área',
            plural: 'Áreas'
        },
        apiPath: 'departments',
        actions: { import: true, export: true, edit: true, delete: true, create: true },
        columns: [
            { key: 'name', label: 'Nombre del Área', type: 'text', required: true, editable: true },
            { key: 'description', label: 'Descripción', type: 'text', editable: true }
        ]
    },
    'JOB_ROLES': {
        labels: {
            title: 'Cargos y Roles',
            singular: 'Cargo',
            plural: 'Cargos'
        },
        apiPath: 'roles',
        actions: { import: true, export: true, edit: true, delete: true, create: true },
        columns: [
            { key: 'name', label: 'Nombre del Cargo', type: 'text', required: true, editable: true },
            { key: 'departmentId', label: 'ID Depto', type: 'number', required: true, editable: true },
            { key: 'baseSalary', label: 'Salario Base', type: 'number', editable: true },
            { key: 'extraHourValue', label: 'Valor Hora Extra', type: 'number', editable: true }
        ]
    },
    'PENALTY_RULES': {
        labels: {
            title: 'Reglamento de Conducta',
            singular: 'Regla',
            plural: 'Reglas'
        },
        apiPath: 'penalties',
        actions: { import: true, export: true, edit: true, delete: true, create: true },
        columns: [
            { key: 'name', label: 'Falta / Motivo', type: 'text', required: true, editable: true },
            { key: 'type', label: 'Tipo', type: 'enum', options: ['EarlyArrival', 'LateArrival', 'LowLoad', 'Behavior'], required: true, editable: true },
            { key: 'action', label: 'Sanción', type: 'enum', options: ['Suspension', 'Warning', 'Fine'], required: true, editable: true },
            { key: 'maxCount', label: 'Tolerancia (Cant)', type: 'number', editable: true }
        ]
    },
    'SHIFT_REQUESTS': {
        labels: {
            title: 'Solicitudes de Personal',
            singular: 'Solicitud',
            plural: 'Solicitudes'
        },
        apiPath: 'shiftRequests',
        actions: { import: false, export: true, edit: true, delete: true, create: false }, // Created by users mostly
        columns: [
            { key: 'requesterId', label: 'Solicitante (ID)', type: 'number', editable: false },
            { key: 'type', label: 'Tipo', type: 'text', editable: false },
            { key: 'targetDate', label: 'Fecha Solicitada', type: 'date', editable: false },
            { key: 'status', label: 'Estado', type: 'enum', options: ['PENDIENTE', 'APROBADO', 'RECHAZADO'], editable: true }
        ]
    }
};
