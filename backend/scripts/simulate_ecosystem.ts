
import axios from 'axios';

const API_URL = 'http://localhost:4000/api';

async function simulate() {
    try {
        console.log('--- 🚀 Starting Ecosystem Simulation (API Only) ---');

        const rand = Math.floor(Math.random() * 10000);
        // 1. Setup Users
        const ownerInternal = `OWNER${rand}`;
        const driverInternal = `DRIVER${rand}`;

        console.log(`Creating Owner (${ownerInternal}) and Driver (${driverInternal})...`);

        // Create Owner
        try {
            await axios.post(`${API_URL}/users`, {
                internalNumber: ownerInternal, firstName: 'Owner', lastName: `User${rand}`, password: 'user123', role: 'User'
            });
        } catch (e: any) { console.log('Owner creation note:', e.response?.data?.message || e.message); }

        // Create Driver
        try {
            await axios.post(`${API_URL}/users`, {
                internalNumber: driverInternal, firstName: 'Driver', lastName: `User${rand}`, password: 'user123', role: 'User'
            });
        } catch (e: any) { console.log('Driver creation note:', e.response?.data?.message || e.message); }

        // Login to get tokens and IDs
        console.log('Logging in...');
        const ownerLogin = await axios.post(`${API_URL}/auth/login`, { internalNumber: ownerInternal, password: 'user123' });
        const ownerToken = ownerLogin.data.token;
        const ownerId = ownerLogin.data.user.id;
        console.log(`Owner ID: ${ownerId}`);

        const driverLogin = await axios.post(`${API_URL}/auth/login`, { internalNumber: driverInternal, password: 'user123' });
        const driverToken = driverLogin.data.token;
        const driverId = driverLogin.data.user.id;
        console.log(`Driver ID: ${driverId}`);

        const adminLogin = await axios.post(`${API_URL}/auth/login`, { internalNumber: '0000', password: 'admin123' });
        const adminToken = adminLogin.data.token;

        // 2. Owner Creates Shift
        console.log('\n--- 📅 Phase 1: Shift Creation ---');
        const shiftData = {
            categoryId: 1, serviceNumber: `SIM-${rand}`, date: new Date().toISOString(), time: '08:00', endTime: '16:00',
            line: '1', carNumber: '100', extraHours: 0, tip: false, totalValue: 5000, transformaFacil: false
        };

        const createRes = await axios.post(`${API_URL}/shifts`, shiftData, { headers: { Authorization: `Bearer ${ownerToken}` } });
        const shiftId = createRes.data.id;
        console.log(`✅ Shift Created by Owner (ID: ${shiftId})`);

        // 3. Admin Approves Shift
        console.log('\n--- 👮 Phase 2: Admin Approval ---');
        await axios.patch(`${API_URL}/shifts/${shiftId}/status`, { status: 'Public', assignedTo: undefined }, { headers: { Authorization: `Bearer ${adminToken}` } });
        console.log('✅ Shift Approved by Admin (Status: Public)');

        // Verify Notification for Owner
        const ownerNotifs1 = await axios.get(`${API_URL}/notifications`, { headers: { Authorization: `Bearer ${ownerToken}` } });
        const approvedNotif = ownerNotifs1.data.find((n: any) => n.message.includes('aprobado'));
        if (approvedNotif) console.log('🔔 Notification verified for Owner: "Turno Aprobado"');
        else console.error('❌ Fail: Owner notification missing or read');

        // 4. Driver Takes Shift
        console.log('\n--- 🤝 Phase 3: Driver Takes Shift ---');
        const takeRes = await axios.patch(`${API_URL}/shifts/${shiftId}/status`, { status: 'Assigned', assignedTo: driverId }, { headers: { Authorization: `Bearer ${driverToken}` } });
        const takenShift = takeRes.data;
        console.log('✅ Shift Taken by Driver');

        // Verify Notifications
        const driverNotifs = await axios.get(`${API_URL}/notifications`, { headers: { Authorization: `Bearer ${driverToken}` } });
        const assignedNotif = driverNotifs.data.find((n: any) => n.message.includes('asignado'));
        if (assignedNotif) console.log('🔔 Notification verified for Driver: "Nuevo Turno Asignado"');

        const ownerNotifs2 = await axios.get(`${API_URL}/notifications`, { headers: { Authorization: `Bearer ${ownerToken}` } });
        const takenNotif = ownerNotifs2.data.find((n: any) => n.message.includes('tomado'));
        if (takenNotif) console.log('🔔 Notification verified for Owner: "Turno Tomado"');

        // 5. Verification via Object State
        console.log('\n--- 💰 Phase 4: State Verification ---');

        console.log('Shift State returned by API:', {
            status: takenShift.status,
            createdBy: takenShift.createdBy,
            assignedTo: takenShift.assignedTo,
            totalValue: takenShift.totalValue
        });

        if (takenShift.status === 'Assigned' && takenShift.assignedTo == driverId) {
            console.log('✅ SYSTEM VERIFIED: Shift cycle completed correctly.');
        } else {
            console.error('❌ Verification Failed: Shift state mismatch.');
        }

        console.log('\n🎉 SIMULATION SUCCESSFUL');

    } catch (error: any) {
        console.error('❌ Simulation Failed:', error.message);
        if (error.response) console.error('API Response:', error.response.data);
    }
}

simulate();
