import React, { createContext, useContext, useState, useEffect } from 'react';
import { getCurrentUser, getAuthToken, setAuthData, clearAuthData } from '../utils/auth';

interface User {
    id: number;
    internalNumber: string;
    firstName: string;
    lastName: string;
    fullName: string;
    role: string;
    [key: string]: any;
}

interface AuthContextType {
    user: User | null;
    token: string | null;
    isAuthenticated: boolean;
    isLoading: boolean;
    login: (token: string, user: User) => void;
    logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<User | null>(null);
    const [token, setToken] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const storedUser = getCurrentUser();
        const storedToken = getAuthToken();

        if (storedUser && storedToken) {
            setUser(storedUser);
            setToken(storedToken);
        }
        setIsLoading(false);
    }, []);

    const login = (newToken: string, newUser: User) => {
        setAuthData(newToken, newUser);
        setToken(newToken);
        setUser(newUser);
    };

    const logout = () => {
        clearAuthData();
        setToken(null);
        setUser(null);
        window.location.href = '/login';
    };

    return (
        <AuthContext.Provider value={{
            user,
            token,
            isAuthenticated: !!user && !!token,
            isLoading,
            login,
            logout
        }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};
