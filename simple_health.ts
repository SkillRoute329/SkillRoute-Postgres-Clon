

const URL = 'https://ucot-gestor-cloud.web.app/api/health';

console.log('Checking ' + URL);

fetch(URL)
    .then(res => {
        console.log('Status:', res.status);
        return res.text();
    })
    .then(text => console.log('Body:', text))
    .catch(err => console.error('Error:', err));
