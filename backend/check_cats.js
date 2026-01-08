
const http = require('http');

http.get('http://localhost:4000/api/categories', (res) => {
    let data = '';
    res.on('data', (chunk) => data += chunk);
    res.on('end', () => {
        try {
            const json = JSON.parse(data);
            console.log('Count:', json.length);
            if (json.length > 0) {
                console.log('Example Category:', JSON.stringify(json[0], null, 2));
                console.log('ID Type:', typeof json[0].id);
                console.log('BaseValue Type:', typeof json[0].baseValue);
                console.log('ExtraHourValue Type:', typeof json[0].extraHourValue);
            }
        } catch (e) {
            console.error(e);
        }
    });
}).on('error', (err) => {
    console.log('Error: ' + err.message);
});
