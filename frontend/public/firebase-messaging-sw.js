importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js');

const firebaseConfig = {
  apiKey: "AIzaSyDPviXHSMncZQ_l3oMwIRoPWAOXOHeVeL4",
  authDomain: "ucot-gestor-cloud.firebaseapp.com",
  projectId: "ucot-gestor-cloud",
  storageBucket: "ucot-gestor-cloud.firebasestorage.app",
  messagingSenderId: "231108889084",
  appId: "1:231108889084:web:45f28a7a143a19995f0a79",
  measurementId: "G-SBF5S0ZG2D"
};

firebase.initializeApp(firebaseConfig);

const messaging = firebase.messaging();

messaging.onBackgroundMessage(function (payload) {
  console.log('[firebase-messaging-sw.js] Received background message ', payload);
  const notificationTitle = payload.notification.title;
  const notificationOptions = {
    body: payload.notification.body,
    icon: '/pwa-192x192.png'
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});
