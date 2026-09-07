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

## Prochaines étapes possibles

- Planning type Gantt par chantier
- Coordination des interventions (qui va où, quand)
- Notifications (échéances proches) via Cloud Functions
- Export du compte-rendu en PDF
- Historique des modifications sur les équipements
