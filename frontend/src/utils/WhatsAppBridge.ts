
// Utility to generate WhatsApp deep links for operational standardization.

type MessageType = 'REPORT_DELAY' | 'CONTACT_BASE' | 'MECHANICAL_ISSUE' | 'EMERGENCY';

interface MessageData {
    carNumber?: string;
    location?: string; // Could be a google maps link
    reason?: string;
    description?: string;
}

// Configurable Base Number (Jefe de Tráfico / Central)
const BASE_PHONE_NUMBER = '59899123456'; // Example number, should be in SystemConfig

export const WhatsAppBridge = {

    sendOperationalMessage: (type: MessageType, data: MessageData) => {
        let message = '';

        switch (type) {
            case 'REPORT_DELAY':
                message = `⚠️ *REPORTE DE RETRASO*\nCoche: ${data.carNumber || 'N/A'}\nMotivo: ${data.reason || 'Tráfico'}\nUbicación: ${data.location || 'No disponible'}`;
                break;

            case 'MECHANICAL_ISSUE':
                message = `🔧 *PROBLEMA MECÁNICO*\nCoche: ${data.carNumber}\nDescripción: ${data.description}\nSolicito asistencia técnica.`;
                break;

            case 'EMERGENCY':
                message = `🚨 *EMERGENCIA*\nCoche: ${data.carNumber}\nUbicación: ${data.location}\nNECESITO AYUDA INMEDIATA.`;
                break;

            case 'CONTACT_BASE':
            default:
                message = `Hola Base, habla el coche ${data.carNumber}. Solicito comunicación.`;
                break;
        }

        const encodedMessage = encodeURIComponent(message);
        const url = `whatsapp://send?phone=${BASE_PHONE_NUMBER}&text=${encodedMessage}`;

        // Deep Link Trigger
        window.location.href = url;
    }
};
