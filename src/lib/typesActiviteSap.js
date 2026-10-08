// Types d'activité SAP (colonne « Type activité » des pointages CATS) -> libellé.
const LIBELLES = {
  I102: "ASSISTANT RA",
  I106: "CADRE SENIOR (RAP)",
  I107: "CADRE",
  I108: "CADRE JUNIOR",
  I111: "ALTERNANT INGENIEUR",
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
  I311: "ALTERNANT",
  I314: "MONTEUR QUALIFIE",
  E200: "ETUDES EXTERNES",
  E301: "ENCADREMENT EXTERNE",
  E302: "PRODUCTION EXTERNE",
};

export const normaliserTypeActivite = (code) => String(code ?? "").trim().toUpperCase();
const normaliser = (code) => String(code ?? "").trim().toUpperCase();

export const CODES_TYPES_ACTIVITE_CONNUS = Object.keys(LIBELLES);

// Libellé + code (« CADRE (I107) ») ; le code seul s'il est inconnu.
export function libelleTypeActivite(code) {
  const c = normaliser(code);
  if (!c) return "";
  return LIBELLES[c] ? LIBELLES[c] + " (" + c + ")" : c;
}

// Les types d'activité « Jxxx », « Fxxx » et « Gxxx » ne sont pas des heures :
// importés mais jamais affichés ni comptés.
export function estActiviteIgnoree(code) {
  return /^[JFG]/.test(normaliser(code));
}

// Ligne de pointage à ne pas afficher ni compter (type d'activité J, F ou G).
export function estLigneMoIgnoree(ligne) {
  return estActiviteIgnoree(ligne?.typAct);
}
