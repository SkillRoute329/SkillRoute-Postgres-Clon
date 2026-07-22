import sqlDb from './src/config/database';

async function checkUser() {
  try {
    const res = await sqlDb('users').where('id', '329').first();
    console.log('User 329:', JSON.stringify(res, null, 2));
  } catch (err) {
    console.error(err);
  } finally {
    process.exit(0);
  }
}

checkUser();
