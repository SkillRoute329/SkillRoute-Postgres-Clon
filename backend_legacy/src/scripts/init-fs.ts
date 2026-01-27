
import fs from 'fs';
import path from 'path';

// Define the critical paths to create
// These must be absolute paths when running on server, or relative to CWD in dev.
// Our StorageService determines 'root' dynamically, but let's be explicit here.

const IS_RAILWAY = fs.existsSync('/app');
const STORAGE_ROOT = IS_RAILWAY ? '/app/uploads' : path.join(process.cwd(), 'uploads');

const REQUIRED_FOLDERS = [
    'avatars',
    'incidents',
    'docs',
    'misc'
];

async function main() {
    console.log(`🛠️ [INIT-FS] Initializing FileSystem at ${STORAGE_ROOT}`);

    if (!fs.existsSync(STORAGE_ROOT)) {
        console.log(`   -> Creating Root: ${STORAGE_ROOT}`);
        fs.mkdirSync(STORAGE_ROOT, { recursive: true });
    }

    REQUIRED_FOLDERS.forEach(folder => {
        const fullPath = path.join(STORAGE_ROOT, folder);
        if (!fs.existsSync(fullPath)) {
            console.log(`   -> Creating Subfolder: ${folder}`);
            fs.mkdirSync(fullPath, { recursive: true });
        } else {
            console.log(`   -> OK: ${folder}`);
        }
    });

    // Create a .keep file to verify persistence if needed
    fs.writeFileSync(path.join(STORAGE_ROOT, 'init_check.txt'), `Initialized at ${new Date().toISOString()}`);

    console.log('✅ [INIT-FS] FileSystem Ready.');
}

main().catch(console.error);
