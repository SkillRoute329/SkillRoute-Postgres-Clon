"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.whatsAppService = void 0;
const whatsapp_web_js_1 = require("whatsapp-web.js");
const qrcode_1 = __importDefault(require("qrcode"));
class WhatsAppService {
    constructor() {
        this.qrCodeUrl = null;
        this.status = 'DISCONNECTED';
        this.status = 'INITIALIZING';
        // More robust args for Windows/Server environments
        this.client = new whatsapp_web_js_1.Client({
            authStrategy: new whatsapp_web_js_1.LocalAuth({
                clientId: 'admin-bot'
            }),
            puppeteer: {
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-accelerated-2d-canvas',
                    '--no-first-run',
                    '--no-zygote',
                    '--disable-gpu'
                ],
                headless: true,
                executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined
            }
        });
        this.initialize();
    }
    initialize() {
        this.client.on('qr', async (qr) => {
            try {
                this.qrCodeUrl = await qrcode_1.default.toDataURL(qr);
            }
            catch (err) {
                console.error('Error generating QR code', err);
            }
        });
        this.client.on('ready', () => {
            this.status = 'READY';
            this.qrCodeUrl = null;
        });
        this.client.on('authenticated', () => {
        });
        this.client.on('auth_failure', (msg) => {
            console.error('WhatsApp Auth Failure', msg);
            this.status = 'DISCONNECTED';
        });
        this.client.on('disconnected', (reason) => {
            this.status = 'DISCONNECTED';
            // Do not auto-reinitialize immediately to avoid loops. User can restart.
        });
        this.client.initialize().catch(err => {
            console.error('Failed to initialize WhatsApp client:', err);
            this.status = 'DISCONNECTED';
        });
    }
    async restart() {
        this.status = 'INITIALIZING';
        this.qrCodeUrl = null;
        try {
            await this.client.destroy();
        }
        catch (e) {
            console.error('Error destroying client during restart:', e);
        }
        this.initialize();
    }
    getStatus() {
        return {
            status: this.status,
            qrCode: this.qrCodeUrl
        };
    }
    async sendMessage(phoneNumber, message) {
        if (this.status !== 'READY') {
            console.warn('Cannot send message: WhatsApp client is not ready');
            return false;
        }
        try {
            // Format phone number: remove non-digits, ensure suffix
            let cleanPhone = phoneNumber.replace(/\D/g, '');
            // Standardize format: Argentina example +549...
            // WhatsApp Web usually expects '549112345678@c.us' for Argentina
            // Just basic sanity check: must include country code.
            // If user provides 011..., we might need to adjust, but let's assume they provide valid format or we append @c.us
            if (!cleanPhone.includes('@c.us')) {
                cleanPhone = `${cleanPhone}@c.us`;
            }
            const isRegistered = await this.client.getNumberId(cleanPhone);
            if (!isRegistered) {
                console.warn(`[WA] Number not registered on WhatsApp: ${cleanPhone}`);
                return false;
            }
            const targetId = isRegistered._serialized;
            await this.client.sendMessage(targetId, message);
            return true;
        }
        catch (error) {
            console.error('!!! WA ERROR DETAIL !!!');
            console.error(error);
            // Verify if error is due to session
            if (String(error).includes('Session closed') || String(error).includes('disconnection')) {
                this.status = 'DISCONNECTED';
            }
            return false;
        }
    }
}
// Singleton instance
exports.whatsAppService = new WhatsAppService();
