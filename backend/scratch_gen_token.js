const jwt = require('jsonwebtoken');
const payload = {
  id: '1000',
  internalNumber: '1000',
  fullName: 'Tester',
  role: 'SUPERADMIN',
  agencyId: '70'
};
const secret = 'dev-secret-key-change-in-production';
const token = jwt.sign(payload, secret, { expiresIn: '1h' });
console.log(token);
process.exit(0);
