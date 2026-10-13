import { Fragment, useState } from "react";
import { doc, FieldPath, updateDoc } from "firebase/firestore";
import { db } from "../firebase";
import { ecrireDevisElec } from "../lib/importCroise";
import { LISTE_TYPES_FO, LISTE_TYPES_MO, valeurType } from "../lib/typesElectricite";

// Commande saisie à la main, sans minute de devis : crée un devis (onglet)
// avec des lignes d'heures (suivi, bureau d'étude, chantier) et de matériel.
// Les lignes créées sont de vraies lignes de devis : avancement, bilan et EAT
// fonctionnent comme pour une minute importée.
const nombre = (v) => {
  const n = Number(String(v ?? "").replace(",", ".").replace(/\s/g, ""));
  return Number.isFinite(n) && n > 0 ? n : 0;
};

// suivi / étude : versées aux tâches « Suivi de chantier » / « Étude » du Récap MO
// (prises sur « Sans tâche ») ; chantier : rattachées à une tâche (type de FO) au choix.
const HEURES = [
  { cle: "suivi", libelle: "Heures de suivi", defaut: "53", tacheSup: "suivi" },
  { cle: "be", libelle: "Heures de bureau d'étude", defaut: "61", tacheSup: "etude" },
  { cle: "chantier", libelle: "Heures de chantier", defaut: "PR", tacheSup: null },
];

export default function NouvelleCommandeModal({ chantierId, nbDevisExistants, onClose }) {
  const [nom, setNom] = useState("");
  const [heures, setHeures] = useState(() =>
    Object.fromEntries(HEURES.map((h) => [h.cle, { h: "", pv: "", type: h.defaut, tache: "4" }]))
  );
  const [materiel, setMateriel] = useState([{ designation: "", type: "14", cout: "" }]);
  const [pvTotal, setPvTotal] = useState("");
  const [erreur, setErreur] = useState("");
  const [enCours, setEnCours] = useState(false);

  const majHeures = (cle, champ, v) => setHeures((p) => ({ ...p, [cle]: { ...p[cle], [champ]: v } }));
  const majMat = (i, champ, v) => setMateriel((p) => p.map((m, k) => (k === i ? { ...m, [champ]: v } : m)));

  const creer = async () => {
    if (!nom.trim()) return setErreur("Donne un nom à la commande.");
    const lignes = [];
    const prelevements = [];
    HEURES.forEach((def) => {
      const s = heures[def.cle];
      const h = nombre(s.h);
      if (!h) return;
      const t = LISTE_TYPES_MO.find((x) => x.code === s.type);
      const tache = def.tacheSup ? null : LISTE_TYPES_FO.find((x) => x.code === s.tache);
      if (def.tacheSup) prelevements.push([def.tacheSup, h]);
      lignes.push({
        typeFo: tache ? valeurType(tache.code, tache.label) : "",
        designation: def.libelle,
        unite: "h",
        quantite: h,
        typeMo: t ? valeurType(t.code, t.label) : "",
        tempsUnitaire: 1,
        tempsTotalHeures: h,
      });
    });
    materiel.forEach((m) => {
      const cout = nombre(m.cout);
      if (!m.designation.trim() && !cout) return;
      const t = LISTE_TYPES_FO.find((x) => x.code === m.type);
      lignes.push({
        designation: m.designation.trim() || "Matériel",
        unite: "u",
        quantite: 1,
        typeFo: t ? valeurType(t.code, t.label) : "",
        coutUnitaireFo: cout,
        coutTotalFo: cout,
      });
    });
    if (lignes.length === 0) return setErreur("Saisis au moins des heures ou du matériel.");
    const pv = nombre(pvTotal);
    const sequence = [
      { estPoste: true, code: "A", profondeur: 0, designation: nom.trim() },
      ...lignes.map((l) => ({ estPoste: false, code: "", profondeur: 1, ...l })),
    ].map((l, i) => ({ ...l, ordre: i }));
    setEnCours(true);
    try {
      const devisId = await ecrireDevisElec({ chantierId, nomDevis: nom, nomFichier: "", sequence, ordre: nbDevisExistants, montantVendu: pv });
      for (const [tacheId, h] of prelevements) {
        await updateDoc(doc(db, "sites", chantierId), new FieldPath("prelevementsMoSup", devisId + "||" + tacheId), h);
      }
      onClose();
    } catch (err) {
      setErreur("Erreur pendant la création : " + err.message);
      setEnCours(false);
    }
  };

  const options = (liste) =>
    liste.map((t) => (
      <option key={t.code} value={t.code}>
        {t.code} | {t.label}
      </option>
    ));

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal nc-modal" onClick={(e) => e.stopPropagation()}>
        <h2>Nouvelle commande sans minute</h2>

        <div className="nc-grid nc-entete">
          <span className="nc-th">Nom de la commande</span>
          <span className="nc-th">Vendu total (€ HT)</span>
          <input value={nom} onChange={(e) => setNom(e.target.value)} autoFocus placeholder="Ex. JE604-005 – Ychoux" />
          <input inputMode="decimal" value={pvTotal} onChange={(e) => setPvTotal(e.target.value)} placeholder="0" />
        </div>

        <h3 className="nc-titre">Heures</h3>
        <div className="nc-grid nc-heures">
          <span className="nc-th"></span>
          <span className="nc-th">Heures</span>
          <span className="nc-th">Tâche</span>
          <span className="nc-th">Profil</span>
          {HEURES.map((def) => (
            <Fragment key={def.cle}>
              <span className="nc-lib">{def.libelle}</span>
              <input
                inputMode="decimal"
                placeholder="0"
                value={heures[def.cle].h}
                onChange={(e) => majHeures(def.cle, "h", e.target.value)}
              />
              {def.tacheSup ? (
                <span className="nc-fixe">{def.tacheSup === "suivi" ? "Suivi de chantier" : "Étude"}</span>
              ) : (
                <select value={heures[def.cle].tache} onChange={(e) => majHeures(def.cle, "tache", e.target.value)}>
                  {options(LISTE_TYPES_FO)}
                </select>
              )}
              <select value={heures[def.cle].type} onChange={(e) => majHeures(def.cle, "type", e.target.value)}>
                {options(LISTE_TYPES_MO)}
              </select>
            </Fragment>
          ))}
        </div>

        <h3 className="nc-titre">Matériel</h3>
        <div className="nc-grid nc-materiel">
          <span className="nc-th">Désignation</span>
          <span className="nc-th">Type de FO</span>
          <span className="nc-th">Coût d'achat (€)</span>
          <span></span>
          {materiel.map((m, i) => (
            <Fragment key={i}>
              <input value={m.designation} onChange={(e) => majMat(i, "designation", e.target.value)} />
              <select value={m.type} onChange={(e) => majMat(i, "type", e.target.value)}>
                {options(LISTE_TYPES_FO)}
              </select>
              <input inputMode="decimal" placeholder="0" value={m.cout} onChange={(e) => majMat(i, "cout", e.target.value)} />
              {materiel.length > 1 ? (
                <button className="nc-x" title="Retirer" onClick={() => setMateriel((p) => p.filter((_, k) => k !== i))}>
                  ×
                </button>
              ) : (
                <span />
              )}
            </Fragment>
          ))}
        </div>
        <button className="btn-ghost nc-ajout" onClick={() => setMateriel((p) => [...p, { designation: "", type: "14", cout: "" }])}>
          + Ligne de matériel
        </button>

        {erreur && <div className="form-error" style={{ marginTop: 10 }}>{erreur}</div>}
        <div className="modal-actions">
          <button className="btn-ghost" onClick={onClose}>
            Annuler
          </button>
          <button className="btn-primary" onClick={creer} disabled={enCours}>
            {enCours ? "Création…" : "Créer la commande"}
          </button>
        </div>
      </div>
    </div>
  );
}
