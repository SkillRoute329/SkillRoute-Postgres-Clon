export interface EntityColumn {
  key: string; // Database field name
  label: string; // Header title
  type: 'text' | 'number' | 'date' | 'boolean' | 'enum';
  editable?: boolean;
  required?: boolean;
  options?: string[]; // For enums
  width?: number;
}

export interface EntityMetadata {
  title: string;
  endpoint: string; // usually same as key, but can be overridden
  columns: EntityColumn[];
  pdfTitle?: string;
  importerTemplate?: string;
  canImport?: boolean;
  canExport?: boolean;
  canDelete?: boolean;
  canEdit?: boolean;
}

export const ENTITY_CONFIG: Record<string, EntityMetadata> = {
  USERS: {
    title: 'Gestión de Usuarios',
    endpoint: 'users', // Calls /api/universal/users
    pdfTitle: 'LISTADO DE PERSONAL',
    canImport: true,
    canExport: true,
    canEdit: true,
    canDelete: true,
    columns: [
      { key: 'internalNumber', label: 'Interno', type: 'text', required: true, width: 100 },
      { key: 'firstName', label: 'Nombre', type: 'text', required: true },
      { key: 'lastName', label: 'Apellido', type: 'text', required: true },
      {
        key: 'role',
        label: 'Rol',
        type: 'enum',
        options: ['Driver', 'Admin', 'Inspector'],
        required: true,
      },
      { key: 'phone', label: 'Teléfono', type: 'text' },
    ],
  },
  VEHICLES: {
    title: 'Gestión de Flota',
    endpoint: 'vehicles',
    pdfTitle: 'INVENTARIO DE FLOTA',
    canImport: true,
    canExport: true,
    canDelete: true,
    columns: [
      { key: 'internalNumber', label: 'Coche', type: 'text', required: true, width: 80 },
      { key: 'plate', label: 'Matrícula', type: 'text', required: true },
      {
        key: 'status',
        label: 'Estado',
        type: 'enum',
        options: ['OPERATIONAL', 'MAINTENANCE', 'RESERVE'],
      },
      { key: 'brand', label: 'Marca', type: 'text' },
      { key: 'model', label: 'Modelo', type: 'text' },
    ],
  },
  DEPARTMENTS: {
    title: 'Departamentos',
    endpoint: 'departments',
    canImport: false, // Just CRUD for now
    canExport: true,
    columns: [
      { key: 'name', label: 'Nombre', type: 'text', required: true },
      { key: 'description', label: 'Descripción', type: 'text' },
    ],
  },
};
