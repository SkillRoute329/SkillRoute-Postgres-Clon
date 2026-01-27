import fetch from 'node-fetch';
import fs from 'fs';

const BASE_URL = 'https://ucot-gestor-cloud.web.app/api';
const LOG_FILE = 'live-test.log';

// Clear log
fs.writeFileSync(LOG_FILE, '--- START TEST ---\n');

const log = (msg: string) => {
    console.log(msg);
    fs.appendFileSync(LOG_FILE, msg + '\n');
};

const login = async (internal, password) => {
    const res = await fetch(`${BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ internalNumber: internal, password })
    });
    if (!res.ok) {
        const text = await res.text(); // Get error details
        throw new Error(`Login failed for ${internal}: ${res.status} ${res.statusText} - ${text}`);
    }
    return res.json();
};

const authHeader = (token) => ({
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
});

const runTest = async () => {
    log('🚀 INICIANDO TEST DE PRODUCCIÓN E2E...');

    try {
        // 1. SUPERADMIN LOGIN
        log('\n🔐 [1] Logueando SuperAdmin (329)...');
        const adminAuth = await login('329', '123456');
        log('✅ SuperAdmin Logueado.');

        // 2. CREATE CATEGORY
        log('\n📂 [2] Verificando/Creando Categoría de Prueba...');
        const catRes = await fetch(`${BASE_URL}/categories`, { headers: authHeader(adminAuth.token) });
        const categories = await catRes.json();
        let testCat = categories.find(c => c.name === 'TestAuto');

        if (!testCat) {
            const createRes = await fetch(`${BASE_URL}/categories`, {
                method: 'POST',
                headers: authHeader(adminAuth.token),
                body: JSON.stringify({ name: 'TestAuto', baseValue: 1000, extraHourValue: 100 })
            });
            testCat = await createRes.json();
            log(`✅ Categoría Created: ${testCat.name}`);
        } else {
            log(`ℹ️ Categoría Existed: ${testCat.name}`);
        }

        // 3. CREATE USERS
        const rnd = Math.floor(Math.random() * 10000);
        const internal1 = `test_u1_${rnd}`;
        const internal2 = `test_u2_${rnd}`;

        log(`\n👥 [3] Creando Usuarios de Prueba: ${internal1}, ${internal2}...`);
        const usersToCreate = [
            { internalNumber: internal1, firstName: 'Juan', lastName: 'Vendedor', password: '123', role: 'User' },
            { internalNumber: internal2, firstName: 'Pedro', lastName: 'Comprador', password: '123', role: 'User' }
        ];

        for (const u of usersToCreate) {
            const res = await fetch(`${BASE_URL}/users`, {
                method: 'POST',
                headers: authHeader(adminAuth.token),
                body: JSON.stringify({ ...u, fullName: `${u.firstName} ${u.lastName}` })
            });

            if (!res.ok) {
                const text = await res.text();
                log(`⚠️ User ${u.internalNumber} create result: ${res.status} ${text.substring(0, 200)}`);
            } else {
                log(`✅ User ${u.internalNumber} created.`);
            }
        }
        log('✅ Usuarios Asegurados.');

        // 4. USER 1 CREATES SHIFT
        log(`\n👤 [4] User 1 (${internal1}) Crea Turno...`);
        const user1Auth = await login(internal1, '123');
        const date = new Date().toISOString().split('T')[0];

        const shiftRes = await fetch(`${BASE_URL}/shifts`, {
            method: 'POST',
            headers: authHeader(user1Auth.token),
            body: JSON.stringify({
                categoryId: testCat.id,
                date: date,
                time: '10:00',
                endTime: '18:00',
                serviceNumber: 'TEST-' + rnd,
                carNumber: '999',
                totalValue: 1200
            })
        });

        if (!shiftRes.ok) {
            const text = await shiftRes.text();
            throw new Error(`Create Shift Failed: ${shiftRes.status} ${text.substring(0, 200)}`);
        }

        const shift = await shiftRes.json();
        log(`✅ Turno Creado ID: ${shift.id} - Status: ${shift.status}`);

        // 5. USER 1 PUBLISHES SHIFT
        log('\n📢 [5] User 1 Publica Turno...');
        await fetch(`${BASE_URL}/shifts/${shift.id}/status`, {
            method: 'PATCH',
            headers: authHeader(user1Auth.token),
            body: JSON.stringify({ status: 'Public' })
        });
        log('✅ Turno Publicado.');

        // 6. USER 2 TAKES SHIFT
        log(`\n🤝 [6] User 2 (${internal2}) Toma el Turno...`);
        const user2Auth = await login(internal2, '123');
        const takeRes = await fetch(`${BASE_URL}/shifts/${shift.id}/status`, {
            method: 'PATCH',
            headers: authHeader(user2Auth.token),
            body: JSON.stringify({ status: 'Assigned', assignedTo: user2Auth.user.id })
        });
        const takenShift = await takeRes.json();
        log(`✅ Turno Asignado a: ${takenShift.assigneeName}`);

        // 7. VERIFY BALANCES (ADMIN)
        log('\n⚖️ [7] Admin Verifica Balances...');
        const balRes = await fetch(`${BASE_URL}/shifts/balances`, { headers: authHeader(adminAuth.token) });
        const balances = await balRes.json();

        const juan = balances.users.find(u => u.internalNumber === internal1);
        const pedro = balances.users.find(u => u.internalNumber === internal2);

        log('--- RESULTADOS DE BALANCE ---');
        log(`Juan (Vendedor) Cedidos: $${juan?.cedidos} (Debería tener saldo a favor)`);
        log(`Pedro (Comprador) Tomados: $${pedro?.tomados} (Debería deber)`);

        if (Number(juan?.cedidos) > 0 && Number(pedro?.tomados) > 0) {
            log('\n🎉 PRUEBA EXITOSA: El ciclo completo de Negocio Funciona.');
        } else {
            log('\n❌ ERROR: Los balances no reflejan la transacción.');
            process.exit(1);
        }

    } catch (e: any) {
        log(`❌ FALLO EL TEST: ${e.message}`);
        process.exit(1);
    }
};

runTest();
