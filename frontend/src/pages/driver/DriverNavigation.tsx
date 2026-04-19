/**
 * DriverNavigation — Redirección permanente a BusNavigation (versión canónica).
 * BusNavigation tiene fleet broadcast, modal de desvíos y todas las funciones.
 * Esta versión se mantiene para compatibilidad de ruta /driver/navigation.
 */
import { Navigate } from 'react-router-dom';

const DriverNavigation = () => <Navigate to="/dashboard/driver/bus-navigation" replace />;

export default DriverNavigation;
