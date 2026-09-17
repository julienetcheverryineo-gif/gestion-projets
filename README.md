# Pilotage de projets — Automatisme & GTB

Application de gestion de projet/équipe : projets, tâches (Kanban), suivi de
temps, rôles utilisateurs. React + Firebase, déployée automatiquement via
GitHub Actions vers Firebase Hosting. Fonctionne dans un navigateur sur PC et
s'installe comme une app sur iPhone (PWA).

## 1. Créer le projet Firebase

1. Aller sur https://console.firebase.google.com → **Ajouter un projet**.
2. Une fois créé, dans **Paramètres du projet > Vos applications**, ajouter
   une application **Web**. Copier les valeurs de configuration affichées
   (`apiKey`, `authDomain`, etc.).
3. Activer **Authentication > Sign-in method > E-mail/Mot de passe**.
4. Activer **Firestore Database** (mode production).
5. Une fois Firestore créé, aller dans l'onglet **Règles** et coller le
   contenu du fichier `firestore.rules` de ce projet, puis publier.

## 2. Configuration Firebase

La configuration Firebase du projet "appli-service" est déjà écrite en dur
dans `src/firebase.js`. Ce n'est pas un secret à protéger : ces valeurs sont
conçues pour être publiques (elles sont de toute façon visibles dans le code
envoyé au navigateur). La sécurité des données est assurée par les règles
Firestore (`firestore.rules`), pas par cette config. Si un jour vous changez
de projet Firebase, il suffit de mettre à jour les valeurs dans ce fichier.

## 3. Créer votre premier compte admin

1. La page de connexion n'a pas d'inscription libre (pour garder le contrôle
   sur qui a accès à l'outil) : il faut d'abord créer le compte côté Firebase.
2. Dans la console Firebase : **Authentication > Users > Ajouter un
   utilisateur**, saisir votre e-mail et un mot de passe.
3. Se connecter dans l'application avec ces identifiants : un profil
   Firestore est créé automatiquement avec le rôle `technicien`.
4. Dans la console Firebase, ouvrir **Firestore Database > users >
   (votre document)** et changer manuellement le champ `role` en `admin`.
5. Recharger l'application : le menu **Utilisateurs** apparaît, vous pouvez
   désormais changer les rôles de toute l'équipe depuis l'interface.

## 4. Déploiement automatique via GitHub

Le fichier `.github/workflows/deploy.yml` déploie automatiquement
l'application sur Firebase Hosting à chaque `push` sur `main`.

1. Pousser ce projet sur un dépôt GitHub.
2. Dans Firebase : générer un compte de service pour le déploiement.
   Le plus simple est d'utiliser la CLI Firebase :
   ```bash
   npm install -g firebase-tools
   firebase login
   firebase init hosting:github
   ```
   Cette commande crée automatiquement les secrets GitHub nécessaires
   (`FIREBASE_SERVICE_ACCOUNT`) sur votre dépôt.
   Cette commande crée automatiquement le secret GitHub nécessaire
   (`FIREBASE_SERVICE_ACCOUNT`) sur votre dépôt. C'est le seul secret requis :
   il sert uniquement à autoriser le déploiement, pas à configurer l'app.
3. Prochain `push` sur `main` → déploiement automatique. L'URL est
   `https://appli-service.web.app`.

## 5. Installer l'app sur iPhone

Une fois déployée, ouvrir l'URL dans Safari sur iPhone → bouton
**Partager** → **Sur l'écran d'accueil**. L'app s'ouvre alors en plein écran,
sans barre d'adresse, comme une app native.

## Structure des données Firestore

- `users` : `nom`, `email`, `role` (`admin` / `chef_de_projet` / `technicien`)
- `sites` (chantiers) : `nom`, `client`, `adresse`, `statut`
- `regequipements` (équipements régulés — notre périmètre, ex "LOCAL RCU",
  "CTA RDJ") : `nom`, `chantierId`, `code` (facultatif, code du poste
  d'origine si importé)
- `regitems` (matériel ou tâche d'un équipement régulé) : `type`
  (`materiel` / `tache`), `designation`, `remarque`, `unite`, `quantite`,
  `regEquipementId`, `statut` (`a_faire` / `installe` / `configure` /
  `teste` pour du matériel ; `a_faire` / `fait` pour une tâche)
- `lots` ("Autres lots techniques" — les corps d'état gérés par d'autres
  entreprises, ex CVC/Électricité, pour information) : `nom`, `chantierId`
- `equipments` (équipements par lot, même logique que `regitems` mais côté
  "Autres lots techniques") : `designation`, `remarque`, `unite`,
  `quantite`, `lotId`, `statut`
- `tasks` : `titre`, `chantierId`, `assigneA`, `echeance`, `statut`
  (`a_faire` / `en_cours` / `termine`)
- `timeEntries` : `userId`, `userNom`, `chantierId`, `lotId`, `duree`, `date`

Le compte-rendu client (bouton "Générer un compte-rendu" sur la page d'un
chantier) est calculé à la volée à partir des équipements régulés et des
autres lots — rien n'est stocké séparément pour ça.

## Import d'une minute de devis

Sur la page d'un chantier, section "Équipements régulés", le bouton
**"Importer une minute de devis"** permet de charger un fichier Excel
(.xlsx) et de créer automatiquement les équipements régulés avec leur
matériel et leurs tâches.

Le parseur (`src/lib/parseDevis.js`) reconnaît le modèle de minute de devis
suivant :
- une colonne **n°** contenant soit un code hiérarchique (ex : `A`, `A.1`,
  `A.1.1`), soit un numéro de ligne simple
- si le fichier n'a qu'un seul niveau de code (ex : uniquement `A.1`, `A.2`…),
  l'import passe directement à l'aperçu
- si le fichier a plusieurs niveaux (ex : `A` → `A.1` → `A.1.1`, comme un
  devis avec bâtiment / équipement / sous-groupe), un écran demande de
  choisir le niveau qui correspond au nom de l'équipement — les niveaux plus
  profonds (sous-groupes comme "Fourniture et programmation") sont alors
  simplement ignorés comme titres, et leur contenu rattaché à l'équipement
  choisi juste au-dessus
- **si le fichier n'a aucun code lettré du tout** (juste des numéros de
  ligne simples), les équipements sont détectés autrement : chaque poste est
  délimité par une ligne "Totaux pour le poste :", et nommé par la ou les
  lignes-titres (sans numéro) qui le précèdent directement. Comme le nombre
  de niveaux de titre peut varier d'un poste à l'autre dans un même fichier
  (parfois 1, parfois 2), chaque poste est construit directement à partir de
  ses propres titres plutôt que par un niveau unique choisi globalement —
  ça évite de mélanger le matériel de deux postes voisins de profondeurs
  différentes. Dans ce cas, l'écran de choix de niveau est sauté
  automatiquement.
- le nom proposé pour chaque équipement combine tous les niveaux parents
  jusqu'au niveau choisi (ex : "B3600 - Sous-station" si le niveau choisi est
  le 2ᵉ) — modifiable avant import
- si la ligne du poste porte elle-même une quantité supérieure à 1 dans le
  devis (ex : "CTA" × 4, plusieurs unités identiques), un bandeau propose de
  **multiplier les quantités du matériel** par ce facteur, ou de **dupliquer
  le poste** en autant d'équipements séparés (numérotés)
- sous le niveau choisi, chaque ligne est classée automatiquement :
  - un code renseigné en colonne **Type de FO** → ligne de **matériel**
  - un code en colonne **Type MO** → ligne de **tâche**
  - les deux codes présents sur une même ligne → une ligne de matériel ET
    une ligne de tâche sont créées
  - une ligne sans Référence/Unité/Quantité/Type de FO/Type MO est un
    sous-titre indicatif et n'est pas importée
  - pour le matériel, si une **Référence** est renseignée dans le devis,
    elle devient la désignation principale (plus lisible/exploitable qu'une
    description générique, ex : "ECY-16DI") — la description d'origine du
    devis part alors en remarque. Sans référence, la description reste la
    désignation.
- les lignes "Totaux pour le poste :" sont ignorées

Avant l'import, chaque équipement détecté peut être renommé, désélectionné,
et chaque ligne de matériel/tâche peut être modifiée, supprimée ou ajoutée
manuellement dans l'aperçu.

Si un autre modèle de devis est utilisé (colonnes dans un ordre différent),
le parseur détecte les colonnes par leur intitulé et devrait s'adapter tant
que les en-têtes gardent des noms proches (n°, Référence, Description,
Unité, Qté, Type de FO, Type MO). Si la détection échoue, un message
d'erreur explicite s'affiche plutôt qu'un import silencieusement faux.

## Export du matériel pour les achats

Sur la page **Chantiers**, le bouton **"Exporter le matériel (achats)"**
(visible pour les chefs de projet/admins) télécharge un fichier Excel
(`materiel-achats-AAAA-MM-JJ.xlsx`) avec deux onglets :

- **Récapitulatif achats** : le matériel de tous les chantiers regroupé par
  désignation, avec les quantités additionnées et la liste des chantiers
  concernés — directement utilisable pour commander en une fois.
- **Détail par chantier** : une ligne par matériel avec le chantier et
  l'équipement d'origine, pour la traçabilité.

La case à cocher "Uniquement le matériel non installé" (cochée par défaut)
exclut le matériel déjà configuré/testé, pour ne lister que ce qui reste
réellement à acheter.

## Équipe par chantier

Sur la page d'un chantier, bouton **"Modifier l'équipe"** : vous assignez un
RA (responsable d'affaire, "Julien ETCHEVERRY" par défaut), un responsable
de chantier, une liste d'automaticiens et une liste d'électriciens (cases à
cocher parmi les utilisateurs de l'application). Champs stockés sur le
document `sites` : `ra`, `responsableChantier`, `automaticiens` (tableau de
noms), `electriciens` (tableau de noms).

## Création d'utilisateurs et mots de passe

Sur la page **Utilisateurs** (admin), le bouton **"+ Ajouter un
utilisateur"** crée le compte (e-mail + rôle) et envoie automatiquement un
e-mail à la personne pour qu'elle définisse elle-même son mot de passe —
plus besoin de passer par la console Firebase pour chaque nouvel arrivant.

Techniquement, la création utilise une **instance Firebase secondaire**
(`getSecondaryAuth()` dans `src/firebase.js`) : sans ça,
`createUserWithEmailAndPassword` connecterait automatiquement le nouveau
compte à la place de la session de l'admin en cours. Le compte est créé sur
cette instance isolée, un e-mail de définition de mot de passe est envoyé,
puis l'instance secondaire se déconnecte — la session de l'admin n'est
jamais affectée.

Chaque utilisateur a aussi un bouton **"Réinitialiser le mot de passe"** qui
renvoie ce même e-mail à tout moment (utile si la personne l'a perdu ou n'a
jamais fini de créer son compte).

**Note** : la langue de l'e-mail envoyé dépend de la configuration du
projet Firebase (Authentication > Templates > langue), pas de
l'application elle-même.

## Création d'utilisateurs et gestion des accès

Le service d'e-mail intégré de Firebase (forfait Spark) s'est révélé peu
fiable (aucune erreur, mais e-mails jamais reçus, y compris avec un serveur
SMTP externe dont l'IP s'est retrouvée bloquée). L'application ne dépend
donc plus de l'e-mail pour créer un compte :

- **"+ Ajouter un utilisateur"** (page Utilisateurs) : vous choisissez
  vous-même le mot de passe (un bouton "Générer" propose un mot de passe
  simple à dicter à l'oral, du type `Chantier482!`), ou vous le tapez
  manuellement. Une fois le compte créé, l'écran affiche l'e-mail et le mot
  de passe à communiquer à la personne (bouton "Copier" disponible).
- Le bouton **"Envoyer un e-mail de reset"** reste disponible sur chaque
  utilisateur si vous parvenez à fiabiliser l'envoi d'e-mail plus tard
  (SMTP personnalisé fonctionnel), mais ce n'est plus le chemin principal.

**Limite technique à connaître** : sans backend (Cloud Functions +
Admin SDK), l'application ne peut pas changer le mot de passe d'un compte
*existant* autrement que par e-mail, ni supprimer définitivement un compte
Firebase Authentication. C'est une limite de Firebase côté client, pas un
choix arbitraire.

À la place, le bouton **"Désactiver"** sur un utilisateur bloque
immédiatement son accès : au prochain essai de connexion (ou immédiatement
s'il est déjà connecté), la personne est déconnectée avec le message
"Ce compte a été désactivé. Contactez votre administrateur." Le compte
Firebase existe toujours techniquement, mais personne ne peut plus s'en
servir — dans les faits, l'effet recherché par une suppression. Le bouton
"Réactiver" annule cette restriction. Champ Firestore concerné :
`users/{id}.actif` (`true` par défaut, `false` = bloqué).

## Chat par chantier

Sur la page d'un chantier, l'onglet **"Chat"** (à côté de "Équipements")
ouvre une messagerie façon WhatsApp partagée par toute l'équipe du
chantier : texte en temps réel et envoi de photos (bouton 📷).

- `messages` (Firestore) : `chantierId`, `userId`, `userNom`, `texte`,
  `imageUrl`, `creeLe`
- Les photos sont stockées dans **Firebase Storage**, sous
  `chantiers/{chantierId}/chat/...`

**Important — étape supplémentaire à faire dans la console Firebase :**
1. Si ce n'est pas déjà fait, activez **Storage** (menu de gauche, "Get
   started"/"Commencer") — un bucket est créé automatiquement.
2. Publiez les règles de sécurité du fichier `storage.rules` de ce projet :
   Storage → onglet "Rules" → copier-coller le contenu → Publier.
3. Republiez aussi `firestore.rules` (nouvelle règle pour la collection
   `messages`) si ce n'est pas encore fait.

Sans ces deux étapes, l'onglet Chat affichera une erreur de permissions,
comme pour les autres fonctionnalités qui ont nécessité une mise à jour des
règles jusqu'ici.

## Notifications push (nouveaux messages de chat)

Quand un nouveau message est posté dans le chat d'un chantier, une
notification push est envoyée aux membres de l'équipe de ce chantier (RA,
responsable, automaticiens — ceux qui ont un compte dans l'application),
sauf à l'auteur du message. Fonctionne aussi app fermée (notification
système), à condition que l'app soit installée sur l'écran d'accueil.

**Architecture** : Cloud Function (`functions/index.js`) déclenchée à
chaque création de document dans `messages`, qui envoie le push via Firebase
Cloud Messaging (FCM) aux jetons enregistrés des personnes concernées.
Côté navigateur, `src/lib/notifications.js` gère la demande de permission et
l'enregistrement du jeton (`users/{id}.fcmTokens`), et
`public/firebase-messaging-sw.js` reçoit les notifications quand l'app n'est
pas au premier plan.

**Réglages obligatoires côté Firebase avant que ça fonctionne :**

1. **Passer le projet en forfait Blaze** (paiement à l'usage) : Console
   Firebase → roue crantée → "Modifier le forfait" → Blaze. Les Cloud
   Functions ne fonctionnent pas sur le forfait gratuit Spark. Le quota
   gratuit inclus dans Blaze est largement suffisant pour ce volume d'usage
   (coût réel proche de zéro).
2. **Générer la clé VAPID** : Console Firebase → roue crantée → Paramètres
   du projet → onglet "Cloud Messaging" → section "Certificats Web Push" →
   "Générer une paire de clés". Copiez la clé générée dans
   `src/firebase.js`, à la place de `REMPLACER_PAR_VOTRE_CLE_VAPID`
   (constante `VAPID_KEY`), puis redéployez.
3. Le déploiement de la Cloud Function se fait automatiquement via le
   workflow GitHub Actions (nouvelle étape ajoutée), en même temps que
   l'hébergement — pas d'action manuelle supplémentaire une fois Blaze
   activé.

**Utilisation** : dans l'onglet Chat d'un chantier, une bannière "🔔
Activer" propose d'activer les notifications sur l'appareil en cours —
chaque utilisateur doit le faire une fois par appareil (PC, iPhone…).

## Suppression de chantier et données orphelines

Supprimer un chantier (page Chantiers) supprime maintenant aussi tout ce qui
lui est rattaché : équipements régulés et leur matériel/tâches, autres lots
techniques et leurs équipements, tâches Kanban, temps passé. Avant cette
correction, seul le chantier était supprimé et le reste restait orphelin en
base — ce qui le faisait par exemple réapparaître dans l'export matériel
achats.

Le bouton **"Nettoyer les données orphelines"** (page Chantiers) répare les
suppressions faites avant ce correctif : il recherche tout matériel, lot,
tâche ou temps passé rattaché à un chantier qui n'existe plus, et propose de
les supprimer définitivement après confirmation.

## Petites tâches, plan de charge et levées de réserves

En complément du suivi des chantiers, trois ajouts reprennent la logique de
votre fichier Excel de suivi :

- **Compte par chantier** : champ `compte` sur le chantier (ex : "JE602"),
  saisi une fois à la création/modification. Il s'affiche automatiquement
  sur les tâches de ce chantier, pas besoin de le ressaisir à chaque fois.
- **Tâches enrichies** : en plus du Kanban existant, chaque tâche peut
  porter des heures prévues, une date de début, une date de fin, un lien
  devis et des commentaires — cliquer sur une carte l'ouvre en modification.
- **Page "Plan de charge"** (nouvelle entrée de menu) : synthèse par
  automaticien — nombre de tâches, total d'heures prévues, chantiers
  concernés, et détail dépliable de chaque tâche. Case à cocher pour inclure
  ou non les tâches déjà terminées. Reprend la logique de l'onglet BILAN de
  votre fichier.
- **Levées de réserves** (nouvelle section sur la page de chaque chantier) :
  désignation, responsable, date de signalement, échéance, statut
  ouverte/levée, avec filtres. Le nombre de réserves ouvertes apparaît aussi
  sur la vue d'ensemble.

Nouvelles collections Firestore : `reserves` (`chantierId`, `designation`,
`responsable`, `dateSignalement`, `dateEcheance`, `statut`, `remarque`).
`tasks` gagne les champs `heuresPrevues`, `dateDebut`, `lienDevis`,
`commentaires`. `sites` gagne le champ `compte`.

## Prochaines étapes possibles

- Planning type Gantt par chantier
- Coordination des interventions (qui va où, quand)
- Notifications (échéances proches) via Cloud Functions
- Export du compte-rendu en PDF
- Historique des modifications sur les équipements
