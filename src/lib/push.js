import { doc, arrayUnion, updateDoc } from "firebase/firestore";
import { getToken, onMessage } from "firebase/messaging";
import { db, getMessagingSafe, VAPID_KEY } from "../firebase";

// État de la permission de notification côté navigateur, en tenant compte
// des navigateurs qui ne supportent pas du tout l'API (ex: anciens Safari,
// ou contexte non sécurisé). Utilisé pour savoir si on propose le bouton
// "Activer les notifications push".
export function etatPermissionPush() {
  if (typeof Notification === "undefined") return "indisponible";
  return Notification.permission; // "default" | "granted" | "denied"
}

// Demande la permission navigateur, récupère le jeton FCM de cet appareil
// et l'enregistre sur le profil Firestore de l'utilisateur (un utilisateur
// peut avoir plusieurs appareils, donc un tableau plutôt qu'un seul champ).
// Retourne true si l'activation a réussi.
export async function activerNotificationsPush(uid) {
  if (!uid) return false;
  try {
    if (typeof Notification === "undefined") return false;
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return false;

    const messaging = await getMessagingSafe();
    if (!messaging) return false;

    if (!VAPID_KEY || VAPID_KEY === "REMPLACER_PAR_VOTRE_CLE_VAPID") {
      console.error(
        "Clé VAPID non configurée (src/firebase.js) : impossible de récupérer un jeton FCM."
      );
      return false;
    }

    const token = await getToken(messaging, { vapidKey: VAPID_KEY });
    if (!token) return false;

    await updateDoc(doc(db, "users", uid), { fcmTokens: arrayUnion(token) });
    return true;
  } catch (err) {
    console.error("Erreur activation des notifications push:", err);
    return false;
  }
}

// Notifications reçues pendant que l'onglet est au premier plan : Firebase
// Messaging ne les affiche pas tout seul dans ce cas (contrairement au
// service worker en arrière-plan), donc on le fait nous-mêmes avec l'API
// Notification native. Appelé une fois au démarrage de l'appli.
export async function ecouterNotificationsPremierPlan() {
  const messaging = await getMessagingSafe();
  if (!messaging) return;
  onMessage(messaging, (payload) => {
    if (etatPermissionPush() !== "granted") return;
    const titre = payload.notification?.title || payload.data?.titre || "Pilotage de projets";
    const corps = payload.notification?.body || payload.data?.message || "";
    const lien = payload.data?.lien || "/";
    const notif = new Notification(titre, { body: corps, icon: "/icon-192.png" });
    notif.onclick = () => {
      window.focus();
      if (lien && window.location.pathname !== lien) {
        window.location.href = lien;
      }
    };
  });
}
