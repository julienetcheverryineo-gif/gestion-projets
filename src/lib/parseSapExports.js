// Lecture des exports texte "Edition de liste dynamique" de SAP (achats
// Fourniture et pointages CATS Main d'œuvre). Ce ne sont pas des CSV
// propres mais des rapports imprimés : tableaux délimités par "|", avec
// des lignes de titre/pagination, des séparateurs de tirets, et des
// cellules (référence, désignation...) qui peuvent déborder sur une ou
// plusieurs lignes suivantes quand le texte est trop long.
//
// Approche volontairement simple pour une première version "on importe
// tout, on affinera le rapprochement ensuite" : on accumule les lignes
// brutes jusqu'à avoir reconstitué le bon nombre de colonnes (repéré par
// le nombre de "|"), sans essayer de comprendre le sens de chaque
// cellule. Une ligne de séparateur (tirets) vide l'accumulateur en cours
// : ça élimine au passage les lignes de sous-total ("* Semaine ...") et
// de total général ("**"), qui sont toujours encadrées par deux
// séparateurs et n'ont jamais le bon nombre de colonnes à elles seules.
function decouperLignesPipe(texte, nbChamps) {
  const nbPipesAttendu = nbChamps + 1;
  const lignes = texte.split(/\r\n|\r|\n/);
  const resultats = [];
  let tampon = "";
  for (const ligne of lignes) {
    if (/^-{10,}\s*$/.test(ligne)) {
      tampon = "";
      continue;
    }
    if (tampon === "" && !ligne.trimStart().startsWith("|")) continue; // titres, pagination…
    tampon += (tampon ? " " : "") + ligne;
    const nbPipes = (tampon.match(/\|/g) || []).length;
    if (nbPipes >= nbPipesAttendu) {
      resultats.push(
        tampon
          .split("|")
          .slice(1, 1 + nbChamps)
          .map((c) => c.trim())
      );
      tampon = "";
    }
  }
  return resultats;
}

// "2.400,00" -> 2400 ; "7,50" -> 7.5 ; "" -> 0
function nombreFr(texte) {
  if (!texte) return 0;
  const n = parseFloat(texte.replace(/\s/g, "").replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

const RE_DATE = /^\d{2}\.\d{2}\.\d{4}$/;

// Préfixe fixe de tous les codes OTP de ces exports SAP : c'est le code
// de notre agence, toujours présent devant le code propre au chantier
// (ex. "AAQ5JE605" = préfixe "AAQ5" + compte "JE605").
const PREFIXE_AGENCE_OTP = "AAQ5";

// Champ "Compte" du chantier (ex. "JE605", voir SiteFormModal) -> code
// OTP complet tel qu'il apparaît dans les lignes importées (ex.
// "AAQ5JE605") — utilisé pour retrouver les lignes SAP d'un chantier
// donné. Tolère que le compte ait déjà été saisi avec le préfixe, et laisse
// tel quel un compte qui porte déjà le code d'une autre agence (ex.
// "AAQ2.A0006" : 3 lettres puis un chiffre, là où un compte normal comme
// "JE601" a un chiffre dès le 3e caractère).
export function otpDepuisCompte(compte) {
  const brut = (compte || "").trim().toUpperCase().replace(/\s+/g, "");
  if (!brut) return null;
  if (brut.startsWith(PREFIXE_AGENCE_OTP)) return brut.length > PREFIXE_AGENCE_OTP.length ? brut : null;
  if (/^[A-Z]{3}\d/.test(brut)) return brut;
  return PREFIXE_AGENCE_OTP + brut;
}

const CHAMPS_FO = [
  "otp",
  "dateDoc",
  "fournisseur",
  "nomFournisseur",
  "docAchat",
  "poste",
  "reference",
  "designation",
  "quantite",
  "unite",
  "valNette",
  "besoin",
  "grOr",
  "prixNet",
];

// Export achats (fichier "...export-fo-sap.txt") : une ligne par ligne de
// commande. `grOr` est le Code SAP (déjà utilisé dans
// correspondanceSapQdv.js) ; `otp` est le code chantier SAP (ex.
// "AAQ5JE503").
export function analyserSapFo(texte) {
  const lignes = decouperLignesPipe(texte, CHAMPS_FO.length);
  return lignes
    .filter((champs) => RE_DATE.test(champs[1]))
    .map((champs) => {
      const brut = {};
      CHAMPS_FO.forEach((nom, i) => (brut[nom] = champs[i]));
      return {
        otp: brut.otp,
        dateDoc: brut.dateDoc,
        fournisseur: brut.fournisseur,
        nomFournisseur: brut.nomFournisseur,
        docAchat: brut.docAchat,
        poste: brut.poste,
        reference: brut.reference,
        designation: brut.designation,
        quantite: nombreFr(brut.quantite),
        unite: brut.unite,
        valNette: nombreFr(brut.valNette),
        besoin: brut.besoin,
        grOr: brut.grOr,
        prixNet: nombreFr(brut.prixNet),
      };
    });
}

const CHAMPS_MO = [
  "nomPrenom",
  "date",
  "imputation",
  "heures",
  "tache",
  "matricule",
  "typAct",
  "designationImputation",
  "responsable",
];

// Export pointages CATS (fichier "...export-mo-sap.txt") : une ligne par
// personne/jour. `imputation` est le même code chantier que `otp` côté
// achats mais écrit avec des points ("A.AQ5.JE503") ; `designationImputation`
// donne le nom du chantier en clair, utile pour le rapprochement.
//
// On ne filtre pas la ligne d'en-tête sur son libellé ("Nom Prénom") : ces
// exports SAP arrivent parfois avec leurs caractères accentués déjà
// corrompus (remplacés par des "�" avant même l'import ici), donc un texte
// accentué n'est jamais fiable à comparer. On repère plutôt une vraie
// ligne de données par sa colonne Date, qui a toujours le format
// JJ.MM.AAAA — ça élimine l'en-tête et toute ligne non reconnue au passage.
export function analyserSapMo(texte) {
  const lignes = decouperLignesPipe(texte, CHAMPS_MO.length);
  return lignes
    .filter((champs) => RE_DATE.test(champs[1]))
    .map((champs) => {
      const brut = {};
      CHAMPS_MO.forEach((nom, i) => (brut[nom] = champs[i]));
      return {
        nomPrenom: brut.nomPrenom,
        date: brut.date,
        imputation: brut.imputation,
        otp: (brut.imputation || "").replace(/\./g, ""),
        heures: nombreFr(brut.heures),
        tache: brut.tache,
        matricule: brut.matricule,
        typAct: brut.typAct,
        designationImputation: brut.designationImputation,
        responsable: brut.responsable,
      };
    });
}
