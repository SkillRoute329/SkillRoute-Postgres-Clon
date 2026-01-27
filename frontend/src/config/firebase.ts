import { initializeApp } from "firebase/app";
import { getStorage } from "firebase/storage";
import { getAuth, setPersistence, browserLocalPersistence } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
    apiKey: 'AIzaSyDPviXHSMncZQ_l3oMwIRoPWAOXOHeVeL4',
    authDomain: 'ucot-gestor-cloud.firebaseapp.com',
    projectId: 'ucot-gestor-cloud',
    storageBucket: 'ucot-gestor-cloud.firebasestorage.app',
    messagingSenderId: '231108889084',
    appId: '1:231108889084:web:45f28a7a143a19995f0a79',
    measurementId: 'G-SBF5S0ZG2D'
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Export Services
export const storage = getStorage(app);
export const auth = getAuth(app);
// Force persistence
setPersistence(auth, browserLocalPersistence).catch((error) => {
    console.error("Firebase persistence error:", error);
});
export const db = getFirestore(app);

export default app;
