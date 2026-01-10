import { Client, LocalAuth } from 'whatsapp-web.js';
import qrcode from 'qrcode';

class WhatsAppService {
    private client: Client;
    private qrCodeUrl: string | null = null;
    private status: 'DISCONNECTED' | 'INITIALIZING' | 'READY' = 'DISCONNECTED';

    constructor() {

        this.status = 'INITIALIZING';

        // More robust args for Windows/Server environments
        this.client = new Client({
            authStrategy: new LocalAuth({
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

    private initialize() {
        this.client.on('qr', async (qr) => {

            try {
                this.qrCodeUrl = await qrcode.toDataURL(qr);
            } catch (err) {
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

    public async restart() {

        this.status = 'INITIALIZING';
        this.qrCodeUrl = null;
        try {
            await this.client.destroy();
        } catch (e) {
            console.error('Error destroying client during restart:', e);
        }

        this.initialize();
    }

    public getStatus() {
        return {
            status: this.status,
            qrCode: this.qrCodeUrl
        };
    }

    public async sendMessage(phoneNumber: string, message: string): Promise<boolean> {
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
        } catch (error) {
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
export const whatsAppService = new WhatsAppService();
