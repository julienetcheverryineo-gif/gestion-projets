// Cloud Function — envoie une notification push (Firebase Cloud Messaging)
// à chaque fois qu'un document est créé dans la collection "notifications".
// C'est la seule chose que cette fonction fait : la décision de notifier
// (qui, pourquoi, avec quel texte) est prise côté client (voir
// src/lib/notifications.js), qui écrit directement dans Firestore — cette
// fonction ne fait que relayer ça en push vers les appareils du
// destinataire.
//
// Déploiement (à faire soi-même, voir README du dépôt) :
//   1. Avoir le plan "Blaze" (pay-as-you-go) activé sur le projet Firebase
//      — gratuit aux volumes d'une petite équipe, obligatoire pour les
//      Cloud Functions.
//   2. cd functions && npm install
//   3. firebase deploy --only functions
//
// Ne PAS déployer sans avoir d'abord vérifié que la clé VAPID est bien
// configurée dans src/firebase.js (sinon les appareils n'auront jamais de
// jeton à qui envoyer le push, et cette fonction n'aura simplement rien à
// faire — elle ne plantera pas, mais ne servira à rien).

const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { getMessaging } = require("firebase-admin/messaging");

initializeApp();

const REGION = "europe-west1";

exports.envoyerPushSurNotification = onDocumentCreated(
  { document: "notifications/{notifId}", region: REGION },
  async (event) => {
    const notif = event.data?.data();
    if (!notif?.destinataireId) return;

    const db = getFirestore();
    const refUtilisateur = db.collection("users").doc(notif.destinataireId);
    const snapUtilisateur = await refUtilisateur.get();
    const tokens = snapUtilisateur.data()?.fcmTokens || [];
    if (tokens.length === 0) return;

    // Nombre de non-lues à ce moment précis : transmis dans le push pour que
    // le service worker puisse mettre à jour la pastille de l'icône même
    // appli fermée (le compteur en direct ne tourne que quand l'appli est
    // ouverte). Best-effort : une erreur ici ne doit pas empêcher l'envoi.
    let nonLues = 0;
    try {
      const snapNonLues = await db
        .collection("notifications")
        .where("destinataireId", "==", notif.destinataireId)
        .where("lu", "==", false)
        .count()
        .get();
      nonLues = snapNonLues.data().count;
    } catch (err) {
      console.error("Erreur comptage des notifications non lues:", err);
    }

    // Volontairement PAS de champ `notification` ici : quand il est présent,
    // Firebase Messaging affiche la notification tout seul côté navigateur
    // ET continue d'invoquer onBackgroundMessage dans le service worker, qui
    // l'affiche une seconde fois (bug connu du SDK) — d'où les doublons
    // observés. En envoyant uniquement des données, seul notre propre code
    // (onBackgroundMessage / onMessage) affiche la notification, une fois.
    const message = {
      tokens,
      data: {
        lien: notif.lien || "/",
        titre: notif.titre || "Pilotage de projets",
        message: notif.message || "",
        badge: String(nonLues),
      },
      webpush: {
        fcmOptions: { link: notif.lien || "/" },
      },
    };

    const reponse = await getMessaging().sendEachForMulticast(message);

    // Nettoyage des jetons devenus invalides (appli désinstallée,
    // permission révoquée, etc.) pour ne pas retenter indéfiniment un
    // envoi voué à échouer.
    const tokensInvalides = [];
    reponse.responses.forEach((resultat, index) => {
      const codeErreur = resultat.error?.code;
      if (
        !resultat.success &&
        (codeErreur === "messaging/invalid-registration-token" ||
          codeErreur === "messaging/registration-token-not-registered")
      ) {
        tokensInvalides.push(tokens[index]);
      }
    });
    if (tokensInvalides.length > 0) {
      await refUtilisateur.update({
        fcmTokens: FieldValue.arrayRemove(...tokensInvalides),
      });
    }
  }
);
