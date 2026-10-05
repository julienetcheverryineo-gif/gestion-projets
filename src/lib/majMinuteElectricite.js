import { normaliser } from "./parseXlsxCommun";

// Ré-import d'une minute de devis Électricité sur un devis déjà importé :
// on compare le fichier aux lignes existantes et on ne retient que ce qui a
// changé (nouvelles lignes, lignes modifiées, lignes disparues), sans
// toucher aux % d'avancement, au regroupement ni aux types FO/MO déjà
// saisis dans l'appli.

// Champs recopiés depuis le fichier et comparés. Les types FO/MO sont
// volontairement exclus : ils se choisissent dans l'appli (menu déroulant)
// et un ré-import ne doit pas écraser ce choix.
const CHAMPS = [
  { champ: "code", label: "N°", type: "texte" },
  { champ: "designation", label: "Désignation", type: "texte" },
  { champ: "detail", label: "Détail", type: "texte" },
  { champ: "reference", label: "Référence", type: "texte" },
  { champ: "unite", label: "Unité", type: "texte" },
  { champ: "profondeur", label: "Niveau", type: "nombre" },
  { champ: "quantite", label: "Qté", type: "nombre" },
  { champ: "coutUnitaireFo", label: "Coût unitaire FO", type: "nombre" },
  { champ: "coutTotalFo", label: "Coût total FO", type: "nombre" },
  { champ: "tempsUnitaire", label: "Temps unitaire", type: "nombre" },
  { champ: "tempsTotalHeures", label: "Temps total", type: "nombre" },
  { champ: "pvUnitaire", label: "PV unitaire", type: "nombre" },
  { champ: "pvTotal", label: "PV total", type: "nombre" },
  { champ: "informative", label: "Ligne informative", type: "booleen" },
];

function valeurNormalisee(ligne, { champ, type }) {
  const v = ligne[champ];
  if (type === "nombre") return Number(v ?? 0) || 0;
  if (type === "booleen") return Boolean(v);
  return String(v ?? "").trim();
}

function egales(a, b, type) {
  return type === "nombre" ? Math.abs(a - b) < 1e-9 : a === b;
}

// Champs Firestore d'une ligne de devis créée depuis le fichier (partagé
// entre l'import initial et les ajouts d'une mise à jour).
export function champsDocumentLigne(ligne) {
  return {
    estPoste: ligne.estPoste,
    code: ligne.code,
    profondeur: ligne.profondeur ?? 0,
    designation: ligne.designation || "",
    detail: ligne.detail || "",
    reference: ligne.reference || "",
    unite: ligne.unite || "",
    quantite: ligne.quantite || 0,
    typeFo: ligne.typeFo || "",
    coutUnitaireFo: ligne.coutUnitaireFo || 0,
    coutTotalFo: ligne.coutTotalFo || 0,
    typeMo: ligne.typeMo || "",
    tempsUnitaire: ligne.tempsUnitaire || 0,
    tempsTotalHeures: ligne.tempsTotalHeures || 0,
    pvUnitaire: ligne.pvUnitaire || 0,
    pvTotal: ligne.pvTotal || 0,
    informative: ligne.informative || false,
    avancementFo: 0,
    avancementMo: 0,
    ordre: ligne.ordre,
  };
}

// Clé d'identité d'une ligne : poste courant + n° de ligne (les n° repartent
// à 1 dans chaque poste) + rang d'occurrence si le même couple se répète
// (lignes sans n°, par exemple). Fonctionne aussi bien sur la séquence du
// fichier que sur les lignes déjà en base (même structure), donc sur les
// devis importés avant l'existence de cette fonction.
function attribuerCles(lignes) {
  const occurrences = new Map();
  let poste = "";
  return lignes.map((l) => {
    if (l.estPoste) poste = String(l.code ?? "");
    const base = (l.estPoste ? "P|" : poste + "|") + String(l.code ?? "");
    const rang = (occurrences.get(base) || 0) + 1;
    occurrences.set(base, rang);
    return { cle: base + "#" + rang, poste, designation: normaliser(l.designation) };
  });
}

export function calculerMiseAJour(sequence, lignesExistantes) {
  const existantes = [...lignesExistantes].sort((a, b) => (a.ordre ?? 0) - (b.ordre ?? 0));
  const clesExistantes = attribuerCles(existantes);
  const clesFichier = attribuerCles(sequence);

  const parCle = new Map(clesExistantes.map((c, j) => [c.cle, j]));
  const apparie = new Array(sequence.length).fill(-1);
  const utilisees = new Set();
  clesFichier.forEach((c, i) => {
    const j = parCle.get(c.cle);
    if (j !== undefined) {
      apparie[i] = j;
      utilisees.add(j);
    }
  });

  // 2e passe : une ligne dont le n° a changé (insertion/renumérotation)
  // mais dont le poste et la désignation sont identiques reste la même
  // ligne, pour ne pas perdre son avancement.
  const restantes = new Map();
  clesExistantes.forEach((c, j) => {
    if (utilisees.has(j) || existantes[j].estPoste) return;
    const k = c.poste + "|" + c.designation;
    if (!restantes.has(k)) restantes.set(k, []);
    restantes.get(k).push(j);
  });
  clesFichier.forEach((c, i) => {
    if (apparie[i] !== -1 || sequence[i].estPoste) return;
    const candidats = restantes.get(c.poste + "|" + c.designation);
    if (candidats && candidats.length > 0) {
      const j = candidats.shift();
      apparie[i] = j;
      utilisees.add(j);
    }
  });

  const ajouts = [];
  const modifications = [];
  const repositionnees = [];
  let inchangees = 0;

  sequence.forEach((nouvelle, i) => {
    const j = apparie[i];
    if (j === -1) {
      ajouts.push(nouvelle);
      return;
    }
    const existante = existantes[j];
    const patch = {};
    const details = [];
    for (const def of CHAMPS) {
      const avant = valeurNormalisee(existante, def);
      const apres = valeurNormalisee(nouvelle, def);
      if (!egales(avant, apres, def.type)) {
        patch[def.champ] = apres;
        details.push({ label: def.label, avant, apres });
      }
    }
    const ordreChange = (existante.ordre ?? 0) !== nouvelle.ordre;
    if (details.length > 0) {
      modifications.push({
        id: existante.id,
        ligne: nouvelle,
        patch: ordreChange ? { ...patch, ordre: nouvelle.ordre } : patch,
        details,
      });
    } else if (ordreChange) {
      // Simple décalage dû à une insertion/suppression ailleurs : appliqué
      // sans compter comme une modification.
      repositionnees.push({ id: existante.id, ordre: nouvelle.ordre });
      inchangees += 1;
    } else {
      inchangees += 1;
    }
  });

  const absentes = existantes.filter((_, j) => !utilisees.has(j));

  return { ajouts, modifications, repositionnees, absentes, inchangees };
}
