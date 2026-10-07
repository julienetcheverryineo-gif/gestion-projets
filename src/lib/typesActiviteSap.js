// Types d'activité SAP (colonne « Type activité » des pointages CATS) -> libellé.
const LIBELLES = {
  I102: "ASSISTANT RA",
  I106: "CADRE SENIOR (RAP)",
  I107: "CADRE",
  I108: "CADRE JUNIOR",
  I112: "RDT",
  I203: "PROJETEUR BE",
  I204: "BUREAU D'ETUDE EXEC",
  I205: "AUTOMATICIEN",
  I207: "TECHNICIEN",
  I209: "ETUDES IAC",
  I211: "TECHNICIEN SENIOR",
  I301: "TECHN. MAINTENANCE",
  I302: "CONDUCTEUR TRAVAUX",
  I303: "CHEF DE CHANTIER",
  I306: "CHEF EQUIPE",
  I314: "MONTEUR QUALIFIE",
  E200: "ETUDES EXTERNES",
  E301: "ENCADREMENT EXTERNE",
  E302: "PRODUCTION EXTERNE",
};

const normaliser = (code) => String(code ?? "").trim().toUpperCase();

// Libellé + code (« CADRE (I107) ») ; le code seul s'il est inconnu.
export function libelleTypeActivite(code) {
  const c = normaliser(code);
  if (!c) return "";
  return LIBELLES[c] ? LIBELLES[c] + " (" + c + ")" : c;
}

// Les types « Jxxx » ne servent pas : importés mais jamais affichés ni comptés.
export function estActiviteIgnoree(code) {
  return /^J/.test(normaliser(code));
}

// Lignes de pointage à ne pas afficher ni compter : type d'activité « Jxxx »
// ou tâche « F » / « G » (ce ne sont pas des heures). Importées quand même.
export function estLigneMoIgnoree(ligne) {
  if (estActiviteIgnoree(ligne?.typAct)) return true;
  return /^[FG]$/.test(normaliser(ligne?.tache));
}
