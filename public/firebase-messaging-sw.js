/* eslint-disable no-undef */
// Service worker Firebase Cloud Messaging : reçoit les notifications push
// pendant que l'appli n'est pas au premier plan (ou fermée) et les affiche
// comme des notifications système. Doit rester à la racine du site
// (https://.../firebase-messaging-sw.js) — c'est l'emplacement que le SDK
// Messaging va chercher par défaut.
//
// La config ci-dessous n'est pas secrète (même remarque que dans
// src/firebase.js) : elle doit juste rester synchronisée avec elle si le
// projet Firebase change un jour.
importScripts("https://www.gstatic.com/firebasejs/12.18.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/12.18.0/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyDuozvx5NXByHVCjVkE1lAddQj8aAcXCZw",
  authDomain: "appli-service.firebaseapp.com",
  projectId: "appli-service",
  storageBucket: "appli-service.firebasestorage.app",
  messagingSenderId: "195686796877",
  appId: "1:195686796877:web:6b8677b3748b3f485f9604",
});

const messaging = firebase.messaging();

// Message volontairement envoyé en "data-only" côté Cloud Function (voir
// functions/index.js) : pas de champ payload.notification, donc pas
// d'affichage automatique par Firebase en plus de celui-ci — un seul
// affichage, ici.
messaging.onBackgroundMessage((payload) => {
  const titre = payload.data?.titre || "Pilotage de projets";
  const options = {
    body: payload.data?.message || "",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    data: { lien: payload.data?.lien || "/" },
  };
  self.registration.showNotification(titre, options);
});

// Clic sur la notification système : ramène au premier plan un onglet déjà
// ouvert sur l'appli (et le navigue vers le lien concerné), sinon en ouvre
// un nouveau.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const lien = event.notification.data?.lien || "/";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) {
          if ("navigate" in client) client.navigate(lien);
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(lien);
      return undefined;
    })
  );
});
