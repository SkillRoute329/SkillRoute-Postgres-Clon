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
    id: number;
    category: any;
    categoryId: number;
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
    getAll: async (page?: number, limit?: number): Promise<Shift[]> => {
        let url = `${API_URL}/shifts`;
        if (page) url += `?page=${page}&limit=${limit || 20}`;

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
        const res = await fetch(`${API_URL}/users`, {
            headers: getAuthHeaders(),
        }).then(res => handleResponse(res));
        return res.json();
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
