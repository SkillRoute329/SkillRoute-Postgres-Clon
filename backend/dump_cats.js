
const http = require('http');

http.get('http://localhost:4000/api/categories', (res) => {
    let data = '';
    res.on('data', (chunk) => data += chunk);
    res.on('end', () => {
        try {
            const json = JSON.parse(data);
            console.log('Categories Dump:');
            json.forEach(c => {
                console.log(`ID: ${c.id} (${typeof c.id}) | Name: ${c.name} | Base: ${c.baseValue} (${typeof c.baseValue})`);
            });
        } catch (e) {
            console.error(e);
        }
    });
});
