
import axios from 'axios';

const API_URL = 'http://localhost:4000/api';

async function verify() {
    try {
        console.log('--- Verifying Backend Fixes ---');

        // 1. Create User (Test Trim)
        const randomInternal = '9999' + Math.floor(Math.random() * 1000);
        console.log(`\n1. Creating User with Internal Number: " ${randomInternal} " (Testing Trim)`);

        let user;
        try {
            const createRes = await axios.post(`${API_URL}/users`, {
                internalNumber: ` ${randomInternal} `, // Spaces to test trim
                firstName: 'Test',
                lastName: 'User',
                password: 'user123',
                role: 'User'
            });
            user = createRes.data;
            console.log('✅ User Created:', user.internalNumber);
        } catch (e: any) {
            if (e.response?.status === 409) {
                console.log('User already exists, proceeding to login...');
            } else {
                throw e;
            }
        }

        // 2. Login (Test Trim)
        console.log('\n2. Logging in (Testing Trim)');
        const loginRes = await axios.post(`${API_URL}/auth/login`, {
            internalNumber: ` ${randomInternal} `, // Spaces to test trim
            password: 'user123'
        });
        const token = loginRes.data.token;
        console.log('✅ Login Successful. Token received.');

        // 3. Create Shift (Test EndTime & Date Fix)
        console.log('\n3. Creating Shift with EndTime');
        const shiftData = {
            categoryId: 1, // Assuming category 1 exists
            serviceNumber: '888',
            date: new Date().toISOString(), // Test ISO string parsing fix
            time: '08:00',
            endTime: '16:00',
            line: '1',
            carNumber: '1',
            extraHours: 0,
            tip: false,
            totalValue: 1000,
            transformaFacil: false
        };

        const createShiftRes = await axios.post(`${API_URL}/shifts`, shiftData, {
            headers: { Authorization: `Bearer ${token}` }
        });
        const shift = createShiftRes.data;
        console.log('✅ Shift Created:', shift.id, 'EndTime:', shift.endTime);

        if (shift.endTime !== '16:00') {
            throw new Error(`EndTime mismatch! Expected 16:00, got ${shift.endTime}`);
        }

        // 4. Update Shift (Test EndTime Update)
        console.log('\n4. Updating Shift EndTime');
        const updateRes = await axios.put(`${API_URL}/shifts/${shift.id}`, {
            ...shiftData,
            endTime: '17:00'
        }, {
            headers: { Authorization: `Bearer ${token}` }
        });
        console.log('✅ Shift Updated. New EndTime:', updateRes.data.endTime);

        if (updateRes.data.endTime !== '17:00') {
            throw new Error(`EndTime update failed! Expected 17:00, got ${updateRes.data.endTime}`);
        }

        console.log('\n🎉 ALL BACKEND CHECKS PASSED!');

    } catch (error: any) {
        console.error('❌ Verification Failed:', error.response?.data || error.message);
        process.exit(1);
    }
}

verify();
