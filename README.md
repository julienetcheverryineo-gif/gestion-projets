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

## Onglets sur la page chantier

La page d'un chantier est maintenant organisée en 4 onglets : **Équipements
régulés**, **Autres lots**, **Réserves**, **Tâches** — au lieu de tout
empiler verticalement.

## Tâches repensées façon Excel

Le Kanban a été remplacé par une vue tableau, plus proche de votre fichier
de suivi : les tâches sont groupées par chantier (cartes dépliables, comme
les équipements), chaque ligne affichant responsable, heures prévues, dates
début/fin, statut (menu déroulant direct dans le tableau) et commentaires.
Cette même vue tableau apparaît aussi dans l'onglet "Tâches" de chaque
chantier (filtrée sur lui), donc on retrouve les tâches d'un chantier à
deux endroits cohérents : sa propre page, et la page Tâches globale.

Une tâche sans chantier ni responsable assigné est étiquetée **"À
affecter"** (plutôt que "Sans chantier"/vide) — elle apparaît alors dans son
propre groupe sur la page Tâches, et dans son propre groupe sur la page
Plan de charge, pour ne pas la perdre de vue.

## Tâches d'équipement visibles dans les tâches globales

Les tâches saisies dans un équipement régulé ("Équipements régulés" →
matériel/tâches d'un équipement) apparaissent désormais aussi dans la page
Tâches globale, dans le groupe de leur chantier — avec la mention "(depuis
équipement : Nom)" pour les distinguer. Leur statut reste modifiable
directement depuis ce tableau global, mais pas leur désignation
(modification réservée à la fiche de l'équipement, pour éviter d'avoir deux
façons différentes de faire la même chose).

## Import ponctuel du fichier de suivi Excel

Sur la page Chantiers, le bouton **"Importer le fichier de suivi"** lit un
fichier au même format que "Chantiers en cours.xlsm" (un onglet par
client/chantier, lignes = tâches) et crée automatiquement les chantiers et
leurs tâches. Un chantier dont le nom correspond exactement à un chantier
déjà existant est réutilisé plutôt que dupliqué ; en revanche, **relancer
l'import réimporte les tâches en double** (prévu pour un usage ponctuel, pas
un import récurrent — une bannière le rappelle dans l'écran d'import).

## Responsable sur les tâches d'équipement régulé

Les tâches d'un équipement régulé (liste "Tâches" dans un équipement) ont
maintenant un responsable assignable (champ `assigneA` sur `regitems`),
comme les tâches classiques — indispensable pour qu'elles comptent dans le
Plan de charge, qui les intègre désormais lui aussi.

## Affecter toutes les tâches d'un chantier en une fois

Sur la page d'un chantier, le lien **"Assigner toutes les tâches à…"**
(à côté de "Modifier l'équipe") affecte en une fois toutes les tâches du
chantier — Kanban et tâches d'équipements régulés confondues — à
l'automaticien choisi. Pratique au lancement d'un chantier pour tout
attribuer par défaut à une personne, à répartir plus finement ensuite.

## Correspondance des noms à l'import du fichier de suivi

L'import du fichier de suivi (page Chantiers) fait maintenant correspondre
le nom court utilisé dans les onglets clients (ex : "Anan N.") au nom exact
d'un compte de l'application (ex : "Anan NAMMA"), via la feuille
"Referentiel" du fichier (colonnes Nom/Mail) recoupée avec l'e-mail des
comptes existants — plus fiable qu'un rapprochement direct des noms.
Les noms qui ne trouvent pas de correspondance (mail absent du référentiel,
ou aucun compte avec cet e-mail) sont repris tels quels et signalés dans
l'aperçu avant import, à corriger manuellement ensuite si besoin.

## Page Chantiers en tableau

La liste des chantiers est passée d'une grille de cartes à un tableau
triable, plus adapté dès qu'on dépasse une dizaine de chantiers :
recherche (nom/client), filtre de statut (actifs par défaut, masque les
terminés), colonnes cliquables pour trier (Chantier, Client, Avancement,
Réserves), avancement en barre visuelle, et réserves ouvertes mises en
évidence en rouge quand il y en a. L'avancement utilise désormais le même
calcul que la vue d'ensemble (équipements régulés testés/faits), plus
cohérent avec le reste de l'appli qu'avant.

## Vue d'ensemble fusionnée avec le Plan de charge

Les deux pages faisaient doublon (chantiers d'un côté, charge d'équipe de
l'autre, sans lien entre elles). "Plan de charge" a été retiré du menu — sa
section "Charge par automaticien" vit maintenant dans "Vue d'ensemble", à
côté de la liste des chantiers :

- **6 indicateurs en haut** : chantiers actifs, tâches en cours, tâches en
  retard, réserves ouvertes, points restants, heures prévues au total.
- **Deux panneaux côte à côte** : Chantiers (avancement, lien direct) et
  Charge par automaticien (dépliable, détail par tâche, case "inclure les
  tâches terminées").
- **Tâches en retard** reste en bas si besoin, comme avant.

## Ordre des équipements régulés

Les équipements s'affichent maintenant dans l'ordre du fichier importé (au
lieu de l'ordre de création en base, qui les mélangeait) — un champ `ordre`
est attribué à chaque équipement, à l'import comme à la création manuelle.
Vous pouvez aussi **glisser-déposer** une carte d'équipement pour la
repositionner à la main ; l'ordre choisi est mémorisé.

**Limite à connaître** : les équipements déjà créés avant cette mise à jour
n'ont pas ce champ `ordre` — leur ordre d'affichage actuel ne changera pas
tout seul. Un glisser-déposer suffit à les ranger comme vous le souhaitez,
une fois fait c'est acquis.

## Tâches éditables directement dans le tableau

Titre, responsable, heures, dates début/fin et commentaires se modifient
maintenant directement dans le tableau (page Tâches globale et onglet
Tâches d'un chantier) — plus besoin d'ouvrir une fenêtre "Modifier". Le
texte s'enregistre en quittant le champ (clic ailleurs ou touche Tab), les
listes déroulantes et les dates s'enregistrent immédiatement. Les tâches
issues d'un équipement régulé restent en lecture seule pour leur
désignation (seul leur statut est modifiable ici, comme avant — la
modification complète se fait depuis la fiche de l'équipement).

## Ouverture directe sur l'onglet Tâches, création rapide, modification du chantier

- La page d'un chantier s'ouvre désormais directement sur l'onglet
  **Tâches** (au lieu d'"Équipements régulés").
- **"+ Ajouter une tâche"** crée immédiatement une ligne ("Nouvelle tâche",
  à faire, sans responsable ni dates) directement dans le tableau — vous la
  complétez sur place grâce à l'édition en ligne, plus de fenêtre à
  remplir avant de voir la tâche apparaître. Même logique pour le bouton
  "Nouvelle tâche"/"+ Tâche" de la page Tâches globale.
- Nouveau bouton **"Modifier le chantier"** sur la page du chantier (à côté
  de "Assigner toutes les tâches à…") pour changer nom, client, adresse,
  statut ou compte sans repasser par la liste des chantiers.

## Tâches d'équipement régulé dans l'onglet Tâches du chantier, vue par responsable, réserves globales

- L'onglet **Tâches** d'un chantier affiche maintenant aussi les tâches de
  ses équipements régulés (comme la page Tâches globale déjà).
- Tableau des chantiers : la colonne **RA** est remplacée par
  **Responsable** (le responsable de chantier défini dans "Modifier
  l'équipe"), plus utile pour se repérer d'un coup d'œil.
- Page **Tâches** globale : deux boutons **"Par chantier" / "Par
  responsable"** pour changer le regroupement. En mode "Par responsable", la
  colonne Chantier apparaît dans chaque tableau pour resituer la tâche.
- Nouvelle page **"Réserves"** (menu de gauche) : synthèse de toutes les
  réserves de tous les chantiers, avec indicateurs (total, ouvertes,
  levées), filtres et regroupement par chantier — plus besoin d'ouvrir
  chaque chantier pour vérifier ses réserves.

## Vraie version mobile

Depuis les premiers ajustements mobile, beaucoup de tableaux denses avaient
été ajoutés (tâches éditables, chantiers, réserves, matériel) et étaient
redevenus illisibles sur iPhone — simple défilement horizontal d'un
tableau bien trop large. Refonte complète :

- **Tous les tableaux de l'appli** (tâches, chantiers, réserves, matériel,
  utilisateurs, import) se transforment sur mobile en **cartes empilées** :
  chaque ligne devient un bloc, chaque valeur est précédée de son intitulé
  de colonne. Plus de défilement horizontal.
- **Réordonnancement des équipements régulés** : le glisser-déposer ne
  fonctionne pas au doigt (limite du web, pas de l'appli). Sur mobile, des
  boutons **▲ Monter / ▼ Descendre** apparaissent à la place.
- En-têtes de cartes (équipements, lots) et barres d'onglets adaptés pour
  ne plus déborder sur petit écran.

## Tri des chantiers, colonnes de tâches redimensionnables, multi-affectation, avancement global

- **Tri des chantiers** : par défaut, la liste est triée par client puis
  par nom de chantier (au lieu du nom de chantier seul).
- **Colonnes du tableau de tâches redimensionnables** : Titre est plus
  large par défaut, Heures/Début/Fin plus étroites. Chaque colonne se
  redimensionne en glissant son bord droit à la souris — la taille choisie
  est mémorisée (`localStorage`) et s'applique à tous les tableaux de
  tâches de l'appli, pas seulement celui en cours.
- **Affectation à plusieurs personnes** : le champ "Responsable" d'une
  tâche (classique ou d'équipement régulé) accepte maintenant plusieurs
  personnes à la fois, via un menu à cases à cocher. Le regroupement "Par
  responsable" (page Tâches) et la charge par automaticien (Vue
  d'ensemble) comptent alors la tâche pour chacune des personnes assignées.
  Les anciennes tâches à une seule personne restent affichées normalement
  (compatibilité automatique).
- **Avancement du chantier (%)** : calculé désormais sur l'ensemble des
  tâches — matériel et tâches des équipements régulés **et** tâches
  classiques confondues — plutôt que les équipements régulés seuls.

## Bouton Actualiser partout, vrai contournement du cache

Le bouton "⟳ Actualiser" est maintenant visible en permanence, pas
seulement sur mobile — aussi dans le pied de la barre latérale sur
ordinateur. Surtout, il ne fait plus un simple `reload()` (qui pouvait
resservir une version en cache, d'où le besoin de quitter/rouvrir l'app sur
iPad pour voir une mise à jour) : il rouvre la page avec un paramètre
d'URL unique à chaque clic, ce qui empêche le navigateur de répondre depuis
son cache et force un vrai aller-retour réseau.

En renfort côté serveur, `firebase.json` interdit désormais explicitement
la mise en cache d'`index.html` (toujours revalidé), tandis que les
fichiers `assets/` (noms uniques à chaque build) restent mis en cache
longuement — sans risque, puisqu'un nouveau déploiement change leur nom.

## Matériel et tâches d'équipement régulé éditables, nouveaux statuts, réordonnancement corrigé

- **Matériel et tâches désormais éditables directement** dans la fiche
  équipement : désignation, quantité, unité et remarque pour le matériel ;
  désignation pour les tâches — jusqu'ici seuls statut et responsable
  l'étaient.
- **Statuts du matériel** : "À acheter" → "Reçu" → "Installé" → "Testé"
  (remplace l'ancienne liste À installer/Installé/Configuré/Testé). Les
  anciennes données (`a_faire`) s'affichent automatiquement comme
  "À acheter", sans opération de migration nécessaire. L'export achats et
  sa case "matériel non acheté" suivent la même logique.
- **Bug corrigé — réordonnancement des équipements régulés** : l'échange de
  position ne faisait rien pour les équipements créés avant l'introduction
  du champ `ordre` (les deux valeurs étaient absentes, l'échange revenait à
  ne rien faire). Le déplacement (glisser-déposer comme boutons ▲/▼)
  renumérote maintenant toute la liste à chaque mouvement, ce qui fonctionne
  quel que soit l'état de départ. Un détecteur d'appareil tactile
  (`src/lib/tactile.js`) désactive proprement le glisser-déposer sur
  iPad/iPhone (non fonctionnel au doigt) au profit des boutons ▲/▼, désormais
  toujours visibles (plus seulement en dessous de 860px de large).

## Heures par tâche à l'import de devis

Les heures prévues de chaque tâche sont désormais extraites automatiquement
depuis la colonne **"Temps unitaire"** du devis (multipliée par la quantité
de la ligne, ex : 4h × 4 occurrences = 16h) et visibles/modifiables dans
l'aperçu avant import. Jusqu'ici, les tâches d'équipement régulé n'avaient
tout simplement aucun champ heures — ajouté partout où c'était nécessaire :
formulaire d'ajout manuel, fiche équipement (nouveau petit champ à côté du
responsable), page Tâches globale et Vue d'ensemble (comptent désormais ces
heures dans les totaux et la charge par automaticien).

## Restructuration : Listing matériel séparé des tâches

L'onglet "Équipements régulés" devient **"Listing matériel"** et n'affiche
plus que du matériel (Désignation, Qté, Unité, Statut, Remarque) — la
section Tâches, devenue illisible une fois les heures ajoutées (trop de
champs sur une ligne trop étroite), est retirée de cette vue. Les tâches
d'un chantier, y compris celles issues d'un équipement, se gèrent
désormais **uniquement depuis l'onglet "Tâches"**.

Concrètement, à l'import d'une minute de devis : le **matériel** continue
de créer un équipement régulé (dans le Listing matériel) ; les **tâches**
sont maintenant créées directement dans la collection des tâches
classiques, avec un commentaire "Équipement : Nom" pour garder le lien
d'origine. Un poste composé uniquement de tâches (aucun matériel) ne crée
plus d'équipement vide dans le listing.

Les tâches d'équipement déjà existantes en base (créées avant cette mise à
jour) restent visibles et gérables depuis l'onglet Tâches, comme avant —
rien n'est perdu, seul l'endroit où on les gère a changé.

**Barre d'actions du chantier** : "Modifier l'équipe", "Assigner toutes les
tâches à…", "Modifier le chantier" et désormais **"Importer une minute de
devis"** (déplacé depuis le panneau Listing matériel) forment une seule
rangée de boutons homogènes juste sous l'en-tête. Au passage, un bug
d'origine est corrigé : ces boutons utilisaient une classe CSS
(`linkish`) qui n'avait jamais été définie et s'affichaient donc avec le
style par défaut du navigateur, d'où l'incohérence visuelle.

## Regroupements, réorganisation des tâches, boutons homogènes

- **Regroupement au choix** : l'onglet Tâches d'un chantier et le Listing
  matériel proposent chacun un bouton "Grouper par équipement" / "Vue à
  plat" — utile pour scanner rapidement une longue liste sans naviguer
  équipement par équipement. Le Listing matériel en vue à plat prend la
  forme d'un vrai tableau (une colonne "Équipement" remplace le
  regroupement), dans le même esprit que le tableau des tâches. La page
  Tâches globale gagne un troisième mode **"Par équipement"**, à côté de
  "Par chantier" et "Par responsable".
- **Réorganisation des tâches** : comme pour les équipements régulés, une
  tâche se déplace en la glissant (souris, via la poignée ⠿) ou avec des
  boutons ▲/▼ sur appareil tactile (le glisser-déposer ne fonctionnant pas
  au doigt). Un champ `ordre` a été ajouté aux tâches pour retenir la
  position choisie.
- **Sur PC, glisser-déposer uniquement** pour réorganiser les équipements
  régulés — les boutons ▲/▼ Monter/Descendre ne s'affichent plus que sur
  appareil tactile (ils faisaient doublon avec le glisser sur PC).
- **Boutons homogènes et verts EQUANS** : "Modifier le chantier",
  "Assigner toutes les tâches à…" et "Importer une minute de devis" (dans
  cet ordre) forment une rangée de boutons au contour vert EQUANS,
  juste sous l'en-tête du chantier. Le bouton "Modifier l'équipe" a
  disparu : chantier et équipe (RA, responsable, automaticiens,
  électriciens) se modifient désormais en un seul formulaire, y compris
  **à la création du chantier** (l'équipe peut rester vide, à affecter
  plus tard).

## Colonne Équipement, vue à plat par défaut, tri et filtre par colonne

- **Tâches** : nouvelle colonne "Équipement", éditable (texte libre) pour
  les tâches classiques. Les tâches issues d'anciens équipements régulés
  (avant qu'on sépare les deux) l'affichent en lecture seule, comme avant.
- **Listing matériel** : s'ouvre désormais **à plat par défaut** (tableau
  unique, plus besoin de déplier équipement par équipement) — le bouton
  bascule vers la vue groupée si besoin. En vue à plat, la colonne
  "Équipement" est un menu déroulant : on peut réaffecter une ligne de
  matériel à un autre équipement du chantier directement depuis le tableau.
- **Tri et filtre par colonne**, sur les deux tableaux (Tâches et Listing
  matériel à plat) : cliquer un intitulé de colonne trie (clic à nouveau
  pour inverser, une troisième fois pour revenir à l'ordre manuel) ; une
  ligne de recherche sous les en-têtes filtre chaque colonne
  indépendamment (recherche simple, insensible à la casse). Trier une
  colonne désactive temporairement le glisser-déposer des tâches — les
  deux logiques d'ordre (manuelle et triée) ne peuvent pas cohabiter.

## Électriciens sélectionnables comme responsables

Les électriciens affectés à un chantier (souvent externes, sans compte
applicatif) apparaissent maintenant dans le sélecteur "Responsable" des
tâches — en plus des comptes utilisateurs, dans une section séparée du
menu. Disponible partout où on affecte une tâche : tableau des tâches
(chantier et page globale), tâches d'équipement régulé, et "Assigner
toutes les tâches à…". Sur la page Tâches globale (qui peut mélanger
plusieurs chantiers), la liste combine les électriciens de tous les
chantiers.

## Responsable restreint à l'équipe du chantier, électricien à affecter

- Le sélecteur "Responsable" d'une tâche ne propose plus tous les comptes
  de l'application, mais uniquement les personnes réellement affectées au
  chantier (RA, responsable de chantier, automaticiens) — plus les
  électriciens. Sur la page Tâches globale, quand le regroupement mélange
  plusieurs chantiers ("Par responsable", "Par équipement"), la liste
  proposée est l'union des équipes concernées ; en mode "Par chantier",
  elle reste précise au chantier du groupe ouvert.
- Nouvelle case **"Électricien à affecter"** dans le formulaire chantier
  (à côté du champ Électriciens) : à cocher quand un électricien est
  nécessaire mais pas encore désigné. Une fois cochée, "Électricien à
  affecter" apparaît comme option choisissable dans le responsable des
  tâches, pour marquer le besoin sans attendre d'avoir un nom.

## Prochaines étapes possibles

- Planning type Gantt par chantier
- Coordination des interventions (qui va où, quand)
- Notifications (échéances proches) via Cloud Functions
- Export du compte-rendu en PDF
- Historique des modifications sur les équipements
