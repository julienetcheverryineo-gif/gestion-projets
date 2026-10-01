// Calendrier de travail France pour le plan de charge Électricité :
// 8h/jour du lundi au jeudi, 4h le vendredi (semaine à 36h), 0h les
// week-ends et jours fériés. Utilisé pour répartir le reste à faire au
// prorata des jours réellement travaillés dans chaque semaine plutôt que
// de façon strictement égale (une semaine avec un jour férié, ou une
// semaine partielle en début/fin de chantier, doit porter moins d'heures).

// Jours fériés fixes (mois 0-indexé comme Date).
const FERIES_FIXES = [
  [0, 1], // Jour de l'an
  [4, 1], // Fête du travail
  [4, 8], // Victoire 1945
  [6, 14], // Fête nationale
  [7, 15], // Assomption
  [10, 1], // Toussaint
  [10, 11], // Armistice
  [11, 25], // Noël
];

// Dimanche de Pâques (algorithme de Meeus/Jones/Butcher).
function datePaques(annee) {
  const a = annee % 19;
  const b = Math.floor(annee / 100);
  const c = annee % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mois = Math.floor((h + l - 7 * m + 114) / 31);
  const jour = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(annee, mois - 1, jour);
}

function ajouterJoursDate(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

const cacheFeriesParAnnee = new Map();

function joursFeriesAnnee(annee) {
  if (cacheFeriesParAnnee.has(annee)) return cacheFeriesParAnnee.get(annee);
  const paques = datePaques(annee);
  const liste = [
    ...FERIES_FIXES.map(([mois, jour]) => new Date(annee, mois, jour)),
    ajouterJoursDate(paques, 1), // Lundi de Pâques
    ajouterJoursDate(paques, 39), // Ascension
    ajouterJoursDate(paques, 50), // Lundi de Pentecôte
  ];
  cacheFeriesParAnnee.set(annee, liste);
  return liste;
}

export function estJourFerie(date) {
  return joursFeriesAnnee(date.getFullYear()).some(
    (f) => f.getFullYear() === date.getFullYear() && f.getMonth() === date.getMonth() && f.getDate() === date.getDate()
  );
}

// Heures travaillées pour une journée donnée : 0 le week-end et les jours
// fériés, 4h le vendredi, 8h du lundi au jeudi.
export function heuresJournalieres(date) {
  const jour = date.getDay(); // 0 = dimanche, 6 = samedi
  if (jour === 0 || jour === 6) return 0;
  if (estJourFerie(date)) return 0;
  return jour === 5 ? 4 : 8;
}

// Capacité (heures) d'une personne sur la semaine ISO (lundi → vendredi)
// dont `lundi` est le premier jour.
export function capaciteSemaine(lundi) {
  let total = 0;
  for (let i = 0; i < 5; i++) {
    total += heuresJournalieres(ajouterJoursDate(lundi, i));
  }
  return total;
}
