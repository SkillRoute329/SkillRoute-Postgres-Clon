import { getAuthToken, clearAuthData } from '../utils/auth';
import { auth, db } from '../config/firebase';
import { signInWithEmailAndPassword, browserLocalPersistence } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';

// API URL apunta a Cloud Functions (via Hosting Rewrites)
export const API_URL = import.meta.env.VITE_API_URL || '/api';

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

    getMenu: async () => {
        const res = await fetch(`${API_URL}/system-config/menu`, {
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
        console.log("🔒 [Auth Strategy] Attempting Firebase Native Login...");
        try {
            // 1. Firebase Auth (Google Cloud)
            // Si el input no es email, podríamos intentar construirlo, pero para Admin es email.
            const email = internalNumber.includes('@') ? internalNumber : `${internalNumber}@ucot.net`;

            // Establecer persistencia LOCAL explícitamente
            await auth.setPersistence(browserLocalPersistence);

            const userCredential = await signInWithEmailAndPassword(auth, email, password);
            const firebaseUser = userCredential.user;
            const token = await firebaseUser.getIdToken();

            // 2. Firestore Role
            const userDocRef = doc(db, 'users', firebaseUser.uid);
            const userDoc = await getDoc(userDocRef);

            let userData = userDoc.exists() ? userDoc.data() : {};

            // Fallback de Emergencia
            if (!userDoc.exists()) {
                console.warn("⚠️ User has no Firestore Doc. Using fallback profile.");
                userData = {
                    fullName: firebaseUser.displayName || 'Usuario Recupeardo',
                    role: 'ADMIN', // Asumimos Admin en emergencia si entra
                    internalNumber: internalNumber
                };
            }

            return {
                token,
                user: {
                    id: firebaseUser.uid,
                    ...userData,
                    role: userData.role || 'User',
                    tenant: { id: 1, name: 'UCOT Cloud', slug: 'ucot' }
                }
            };
        } catch (error: any) {
            console.error("❌ Firebase Auth Failed:", error);
            // Si falla Firebase, lanzamos error (ya no intentamos Railway)
            throw new Error(error.code === 'auth/invalid-credential' ? 'Credenciales Inválidas' : 'Error de Conexión');
        }
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
    updateVehicle: async (id: number, data: any) => {
        return api.put(`/fleet/vehicles/${id}`, data).then(res => res.data);
    },
    getLastInspection: async (vehicleId: number) => {
        return api.get(`/fleet/vehicles/${vehicleId}/last-inspection`).then(res => res.data);
    },
    getVehicleHistory: async (vehicleId: number) => {
        return api.get(`/fleet/vehicles/${vehicleId}/history`).then(res => res.data);
    },
    createInspection: async (data: any) => {
        const formData = new FormData();

        Object.keys(data).forEach(key => {
            const value = data[key];
            if (value === undefined || value === null) return;

            // Serialize objects/arrays to JSON string for backend parsing
            if (typeof value === 'object' && !(value instanceof File) && !(value instanceof Blob)) {
                formData.append(key, JSON.stringify(value));
            } else {
                formData.append(key, value);
            }
        });

        // NUEVA IMPLEMENTACIÓN CON FETCH (A prueba de fallos de Axios)
        // 1. Obtener token crudo
        const token = localStorage.getItem('token');
        if (!token) throw new Error("No hay token de sesión");

        // 2. Usar FETCH nativo (Bypasseando Axios)
        // Nota: NO ponemos 'Content-Type', el navegador lo pone solo con el boundary correcto.
        const response = await fetch(`${API_URL}/fleet/inspections`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}` // <--- Inyección directa
            },
            body: formData
        });

        // 3. Manejo de respuesta manual
        if (!response.ok) {
            if (response.status === 401) throw new Error("Sesión expirada (Token rechazado por servidor)");
            const errorText = await response.text();
            throw new Error(`Error del servidor: ${response.status} - ${errorText}`);
        }

        return await response.json();
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
        const formData = new FormData();
        Object.keys(data).forEach(key => {
            if (data[key] !== undefined && data[key] !== null) {
                formData.append(key, data[key]);
            }
        });

        const token = getAuthToken();
        const headers: any = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const res = await fetch(`${API_URL}/maintenance`, {
            method: 'POST',
            headers,
            body: formData
        }).then(res => handleResponse(res));
        return res.json();
    },
    getAll: async (filters: any = {}) => {
        const params = new URLSearchParams(filters);
        return api.get(`/maintenance?${params.toString()}`).then(res => res.data);
    },
    getDetails: async (id: number) => {
        return api.get(`/maintenance/${id}`).then(res => res.data);
    },
    update: async (id: number, data: any) => {
        const formData = new FormData();
        Object.keys(data).forEach(key => {
            if (data[key] !== undefined && data[key] !== null) {
                formData.append(key, data[key]);
            }
        });

        const token = getAuthToken();
        const headers: any = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const res = await fetch(`${API_URL}/maintenance/${id}`, {
            method: 'PUT',
            headers,
            body: formData
        }).then(res => handleResponse(res));
        return res.json();
    },
    closeTicket: async (id: number, data: { solution: string, partsUsed: any[] }) => {
        return api.post(`/maintenance/${id}/close`, data).then(res => res.data);
    },
    uploadFile: async (file: File) => {
        const formData = new FormData();
        formData.append('file', file);

        const token = getAuthToken();
        const headers: any = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const res = await fetch(`${API_URL}/upload`, {
            method: 'POST',
            headers,
            body: formData
        }).then(handleResponse);
        return res.json();
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
    },

    ingestJson: async (data: any) => {
        const res = await fetch(`${API_URL}/data-import/ingest/json`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify(data),
        }).then(handleResponse);
        return res.json();
    },

    uploadEmployees: async (formData: FormData) => {
        const res = await fetch(`${API_URL}/data-import/upload/employees`, {
            method: 'POST',
            headers: {
                ...(getAuthToken() ? { Authorization: `Bearer ${getAuthToken()}` } : {})
            },
            body: formData,
        }).then(handleResponse);
        return res.json();
    },

    downloadEmployeeTemplate: async () => {
        const token = getAuthToken();
        const response = await fetch(`${API_URL}/data-import/template/download?type=employees`, {
            headers: {
                ...(token ? { Authorization: `Bearer ${token}` } : {})
            }
        });
        if (!response.ok) throw new Error('Error descargando plantilla');
        return response.blob();
    },

    exportEmployees: async () => {
        const token = getAuthToken();
        const response = await fetch(`${API_URL}/data-import/export/employees`, {
            headers: {
                ...(token ? { Authorization: `Bearer ${token}` } : {})
            }
        });
        if (!response.ok) throw new Error('Error exportando empleados');
        return response.blob();
    },

    clearData: async () => {
        const res = await fetch(`${API_URL}/data-import/ingest/clear`, {
            method: 'DELETE',
            headers: getAuthHeaders(),
        }).then(handleResponse);
        return res.json();
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

export const SystemHealthService = {
    getStatus: async () => {
        return api.get('/system-health/status').then(res => res.data);
    },
    getLogs: async () => {
        return api.get('/system-health/logs').then(res => res.data);
    },
    triggerUpdate: async () => {
        return api.post('/system-health/update', {}).then(res => res.data);
    }
};

export const UniversalService = {
    list: async (entity: string, page = 1, limit = 50) => {
        return api.get(`/universal/${entity}/list?page=${page}&limit=${limit}`).then(res => res.data);
    },
    import: async (entity: string, data: any[]) => {
        return api.post(`/universal/${entity}/import`, { data }).then(res => res.data);
    },
    create: async (entity: string, data: any) => {
        return api.post(`/universal/${entity}`, data).then(res => res.data);
    },
    update: async (entity: string, id: number | string, data: any) => {
        return api.put(`/universal/${entity}/${id}`, data).then(res => res.data);
    },
    delete: async (entity: string, id: number | string) => {
        return api.delete(`/universal/${entity}/${id}`).then(res => res.data);
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
