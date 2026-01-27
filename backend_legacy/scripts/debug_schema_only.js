const axios = require('axios');
const BASE_URL = 'https://transformafacil-20-production.up.railway.app/api';

async function run() {
    try {
        const ver = await axios.get(`${BASE_URL}/version`);
        console.log("Remote Version:", ver.data.desc || ver.data);

        console.log("Fetching Schema...");
        const res = await axios.get(`${BASE_URL}/debug-schema`);
        console.log(JSON.stringify(res.data, null, 2));
    } catch (e) {
        console.error(e.message);
        if (e.response) console.error(JSON.stringify(e.response.data));
    }
}
run();
