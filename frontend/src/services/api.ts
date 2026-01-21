import { getAuthToken, clearAuthData } from '../utils/auth';

// 1. If VITE_API_URL is set (Production/Cloud), use it.
// 2. Otherwise, use relative path '/api' (relying on Vite Proxy or Nginx).
const API_URL = import.meta.env.VITE_API_URL || '/api';

// Helper function to get auth headers
const getAuthHeaders = () => {
    const token = getAuthToken();
    return {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
};

const handleResponse = async (res: Response) => {
    if (res.status === 401) {
        clearAuthData();
        window.location.href = '/login';
        throw new Error('Sesión expirada');
    }
    if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error(error.message || 'Error en la petición');
    }
    return res;
};

export interface Shift {
    id: number | string;
    category?: any;
    categoryId?: number;
    serviceNumber: string;
    date: string;
    time: string;
    endTime?: string;
    line: string;
    relief?: string;
    carNumber: string;
    extraHours: number;
    tip: boolean;
    tipValue: number;
    totalValue: number;
    transformaFacil: boolean;
    transformaFacilDiscount: number;
    status: 'Created' | 'Public' | 'Assigned' | 'Completed' | 'Cancelled';
    createdBy: number;
    assignedTo?: number;
    assigneeName?: string;
    assigneePhone?: string;
    assigneeInternalNumber?: string;
    creatorName?: string;
}

export const ShiftService = {
    getAll: async (dateOrPage?: string | number, limit?: number): Promise<Shift[]> => {
        let url = `${API_URL}/shifts`;
        if (typeof dateOrPage === 'number') {
            url += `?page=${dateOrPage}&limit=${limit || 20}`;
        } else if (typeof dateOrPage === 'string') {
            url += `?date=${dateOrPage}`;
        }

        const res = await fetch(url, {
            headers: getAuthHeaders(),
        }).then(res => handleResponse(res));

        const responseData = await res.json();

        // Handle pagination structure { data: [], meta: {} } OR legacy array []
        const data = Array.isArray(responseData) ? responseData : (responseData.data || []);

        if (!Array.isArray(data)) return [];

        return data.map((s: any) => ({
            ...s,
            category: (typeof s.category === 'object' ? s.category?.name : s.category) || s.categoryName || 'Desconocido',
        }));
    },

    getBalances: async () => {
        const res = await fetch(`${API_URL}/shifts/balances?_t=${Date.now()}`, {
            headers: getAuthHeaders(),
        }).then(res => handleResponse(res));
        return res.json();
    },

    create: async (data: any): Promise<Shift> => {
        const res = await fetch(`${API_URL}/shifts`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify(data),
        }).then(res => handleResponse(res));
        return res.json();
    },

    update: async (id: number, data: any): Promise<Shift> => {
        const res = await fetch(`${API_URL}/shifts/${id}`, {
            method: 'PUT',
            headers: getAuthHeaders(),
            body: JSON.stringify(data),
        }).then(res => handleResponse(res));
        return res.json();
    },

    delete: async (id: number): Promise<void> => {
        await fetch(`${API_URL}/shifts/${id}`, {
            method: 'DELETE',
            headers: getAuthHeaders(),
        }).then(res => handleResponse(res));
    },

    updateStatus: async (id: number, status: string, assignedTo?: number, discount?: number) => {
        const res = await fetch(`${API_URL}/shifts/${id}/status`, {
            method: 'PATCH',
            headers: getAuthHeaders(),
            body: JSON.stringify({ status, assignedTo, transformaFacilDiscount: discount }),
        });
        return res.json();
    },

    publish: async (id: number) => {
        return ShiftService.updateStatus(id, 'Public');
    },

    assign: async (id: number, userId: number) => {
        return ShiftService.updateStatus(id, 'Assigned', userId);
    },

    getCategories: async (date?: string) => {
        let url = `${API_URL}/categories`;
        if (date) {
            url += `?date=${date}`;
        }
        const res = await fetch(url, {
            headers: getAuthHeaders()
        }).then(res => handleResponse(res));
        return res.json();
    },

    createCategory: async (data: { name: string, baseValue: number, extraHourValue: number }) => {
        const res = await fetch(`${API_URL}/categories`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify(data),
        }).then(res => handleResponse(res));
        return res.json();
    },

    updateCategory: async (id: number, data: { name?: string, baseValue?: string, extraHourValue?: string }) => {
        const res = await fetch(`${API_URL}/categories/${id}`, {
            method: 'PUT', // or PATCH
            headers: getAuthHeaders(),
            body: JSON.stringify(data),
        }).then(res => handleResponse(res));
        return res.json();
    },

    deleteCategory: async (id: number) => {
        await fetch(`${API_URL}/categories/${id}`, {
            method: 'DELETE',
            headers: getAuthHeaders(),
        }).then(res => handleResponse(res));
    },

    getSystemConfig: async () => {
        const res = await fetch(`${API_URL}/system-config`, {
            headers: getAuthHeaders(),
        }).then(res => handleResponse(res));
        return res.json();
    },

    getCategoryHistory: async (id: number) => {
        const res = await fetch(`${API_URL}/categories/${id}/history`, {
            headers: getAuthHeaders(),
        }).then(res => handleResponse(res));
        return res.json();
    },

    addCategoryPriceHistory: async (id: number, data: { baseValue: number, extraHourValue: number, effectiveDate: string }) => {
        const res = await fetch(`${API_URL}/categories/${id}/history`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify(data),
        }).then(res => handleResponse(res));
        return res.json();
    },
};

export const UserService = {
    login: async (internalNumber: string, password: string, companySlug?: string) => {
        const res = await fetch(`${API_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ internalNumber, password, companySlug }),
        });
        if (!res.ok) throw new Error('Credenciales inválidas');
        return res.json();
    },

    getAll: async () => {
        return api.get('/users').then(res => res.data);
    },

    create: async (data: any) => {
        return api.post('/users', data).then(res => res.data);
    },

    update: async (id: number, data: any) => {
        return api.put(`/users/${id}`, data).then(res => res.data);
    },

    delete: async (id: number) => {
        return api.delete(`/users/${id}`).then(res => res.data);
    }
};

export const FleetService = {
    getVehicles: async () => {
        return api.get('/fleet/vehicles').then(res => res.data);
    },
    createVehicle: async (data: any) => {
        return api.post('/fleet/vehicles', data).then(res => res.data);
    },
    getLastInspection: async (vehicleId: number) => {
        return api.get(`/fleet/vehicles/${vehicleId}/last-inspection`).then(res => res.data);
    },
    createInspection: async (data: any) => {
        return api.post('/fleet/inspections', data).then(res => res.data);
    },
    getRotationSchemes: async () => {
        return api.get('/fleet/rotation-schemes').then(res => res.data);
    }
};

export const WhatsAppService = {
    getStatus: async () => {
        return api.get('/whatsapp/status').then(res => res.data);
    },
    restart: async (clean = false) => {
        return api.post('/whatsapp/restart', { clean }).then(res => res.data);
    }
};

export const DepartmentService = {
    getAll: async () => {
        return api.get('/departments').then(res => res.data);
    },
    create: async (data: { name: string, description?: string }) => {
        return api.post('/departments', data).then(res => res.data);
    },
    update: async (id: number, data: { name?: string, description?: string }) => {
        return api.put(`/departments/${id}`, data).then(res => res.data);
    },
    delete: async (id: number) => {
        return api.delete(`/departments/${id}`).then(res => res.data);
    },
    addRole: async (deptId: number, data: { name: string, description?: string, baseSalary?: number, extraHourValue?: number }) => {
        return api.post(`/departments/${deptId}/roles`, data).then(res => res.data);
    },
    deleteRole: async (roleId: number) => {
        return api.delete(`/departments/roles/${roleId}`).then(res => res.data);
    }
};

export const MaintenanceService = {
    create: async (data: any) => {
        return api.post('/maintenance', data).then(res => res.data);
    },
    getAll: async (filters: any = {}) => {
        const params = new URLSearchParams(filters);
        return api.get(`/maintenance?${params.toString()}`).then(res => res.data);
    },
    getDetails: async (id: number) => {
        return api.get(`/maintenance/${id}`).then(res => res.data);
    },
    update: async (id: number, data: any) => {
        return api.put(`/maintenance/${id}`, data).then(res => res.data);
    }
};

export const DiscountService = {
    getAll: async () => {
        return api.get('/discounts').then(res => res.data);
    },
    create: async (data: any) => {
        return api.post('/discounts', data).then(res => res.data);
    },
    update: async (id: number, data: any) => {
        return api.put(`/discounts/${id}`, data).then(res => res.data);
    },
    delete: async (id: number) => {
        return api.delete(`/discounts/${id}`).then(res => res.data);
    }
};

export const CartonService = {
    save: async (data: any) => {
        return api.post('/service-definitions', data).then(res => res.data);
    },
    getAll: async (seasonId?: number, dayType?: 'HABIL' | 'SABADO' | 'DOMINGO') => {
        let query = seasonId ? `?seasonId=${seasonId}` : '?';
        if (dayType) query += `&dayType=${dayType}`;
        return api.get(`/service-definitions${query}`).then(res => res.data);
    },
    delete: async (id: number) => {
        return api.delete(`/service-definitions/${id}`).then(res => res.data);
    },
    getSuggestions: async (seasonId?: number) => {
        const query = seasonId ? `?seasonId=${seasonId}` : '';
        return api.get(`/service-definitions/optimize${query}`).then(res => res.data);
    },
    swapVehicle: async (id: number, vehicleId: number | null) => {
        return fetch(`${API_URL}/service-definitions/${id}/swap`, {
            method: 'PATCH',
            headers: getAuthHeaders(),
            body: JSON.stringify({ vehicleId })
        }).then(res => handleResponse(res)).then(res => res.json());
    }
};

export const BulletinService = {
    save: async (data: { date: string, entries: any[] }) => {
        return api.post('/bulletins', data).then(res => res.data);
    },
    getMyStats: async () => {
        return api.get('/bulletins/my-stats').then(res => res.data);
    },
    getVehicleStats: async (carNumber: string) => {
        return api.get(`/bulletins/vehicle-stats?carNumber=${carNumber}`).then(res => res.data);
    },
    generateCarton: async (data: { serviceNumber: string, date: string }) => {
        return api.post('/bulletins/generate-carton', data).then(res => res.data);
    },
    getTemplate: async (serviceNumber: string, seasonId?: number) => {
        const query = seasonId ? `&seasonId=${seasonId}` : '';
        return api.get(`/bulletins/template?serviceNumber=${serviceNumber}${query}`).then(res => res.data);
    }
};

export const PenaltyService = {
    getRules: async () => {
        return api.get('/penalties/rules').then(res => res.data);
    },
    saveRule: async (data: any) => {
        return api.post('/penalties/rules', data).then(res => res.data);
    },
    deleteRule: async (id: number) => {
        return api.delete(`/penalties/rules/${id}`).then(res => res.data);
    },
    // Get active penalties (global or user specific)
    getPenalties: async (filters: { userId?: number, type?: string, activeOnly?: boolean } = {}) => {
        const query = new URLSearchParams(filters as any).toString();
        return api.get(`/penalties?${query}`).then(res => res.data);
    },
    // Create manual penalty
    createPenalty: async (data: any) => {
        return api.post('/penalties', data).then(res => res.data);
    },
    // Get red numbers (users exceeding thresholds)
    getRedNumbers: async () => {
        return api.get('/penalties/red-numbers').then(res => res.data);
    }
};

export const RoadAlertService = {
    getAll: async () => {
        return api.get('/road-alerts').then(res => res.data);
    },
    create: async (data: any) => {
        return api.post('/road-alerts', data).then(res => res.data);
    },
    resolve: async (id: number) => {
        return api.put(`/road-alerts/${id}/resolve`, {}).then(res => res.data);
    }
};

export const DataImportService = {
    upload: async (formData: FormData) => {
        const res = await fetch(`${API_URL}/data-import/upload/data`, {
            method: 'POST',
            // headers: getAuthHeaders(), // Do not set Content-Type manually with FormData!
            // Need to merge auth header but exclude Content-Type
            headers: {
                ...(getAuthToken() ? { Authorization: `Bearer ${getAuthToken()}` } : {})
            },
            body: formData,
        }).then(handleResponse);
        return res.json();
    },
    downloadTemplate: async () => {
        const token = getAuthToken();
        const response = await fetch(`${API_URL}/data-import/template/download`, {
            headers: {
                ...(token ? { Authorization: `Bearer ${token}` } : {})
            }
        });
        if (!response.ok) throw new Error('Error descargando plantilla');
        return response.blob();
    }
};

export const DriverService = {
    getSchedule: async (month?: number, year?: number, viewMode: 'month' | 'week' = 'month') => {
        let query = `?viewMode=${viewMode}`;
        if (month) query += `&month=${month}`;
        if (year) query += `&year=${year}`;
        return api.get(`/driver/schedule${query}`).then(res => res.data);
    }
};

const api = {
    get: async (endpoint: string) => {
        const res = await fetch(`${API_URL}${endpoint}`, { headers: getAuthHeaders() }).then(handleResponse);
        return { data: await res.json() };
    },
    post: async (endpoint: string, body: any) => {
        const res = await fetch(`${API_URL}${endpoint}`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify(body)
        }).then(handleResponse);
        return { data: await res.json() };
    },
    put: async (endpoint: string, body: any) => {
        const res = await fetch(`${API_URL}${endpoint}`, {
            method: 'PUT',
            headers: getAuthHeaders(),
            body: JSON.stringify(body)
        }).then(handleResponse);
        return { data: await res.json() };
    },
    delete: async (endpoint: string) => {
        const res = await fetch(`${API_URL}${endpoint}`, {
            method: 'DELETE',
            headers: getAuthHeaders()
        }).then(handleResponse);
        return { data: await res.json() };
    }
};

export default api;
