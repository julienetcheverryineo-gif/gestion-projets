import { useState } from "react";
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

  const carte = { border: "1px solid var(--border, #d8dee4)", borderRadius: 10, padding: 14, marginTop: 14 };
  const champ = { display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "var(--text-muted, #667)" };
  const ligne = { display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end", padding: "10px 0", borderTop: "1px solid var(--border, #e6eaee)" };
  const options = (liste) =>
    liste.map((t) => (
      <option key={t.code} value={t.code}>
        {t.code} | {t.label}
      </option>
    ));

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 860, width: "94vw", maxHeight: "92vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
        <h2 style={{ marginTop: 0 }}>Nouvelle commande sans minute</h2>

        <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
          <label style={{ ...champ, flex: "1 1 320px" }}>
            Nom de la commande
            <input value={nom} onChange={(e) => setNom(e.target.value)} autoFocus />
          </label>
          <label style={{ ...champ, flex: "0 0 200px" }}>
            Montant vendu total (€ HT)
            <input inputMode="decimal" value={pvTotal} onChange={(e) => setPvTotal(e.target.value)} />
          </label>
        </div>

        <div style={carte}>
          <h3 style={{ margin: "0 0 4px" }}>Heures</h3>
          {HEURES.map((def) => (
            <div key={def.cle} style={ligne}>
              <div style={{ flex: "1 1 150px", fontWeight: 600 }}>{def.libelle}</div>
              <label style={{ ...champ, flex: "0 0 90px" }}>
                Heures
                <input
                  inputMode="decimal"
                  value={heures[def.cle].h}
                  onChange={(e) => majHeures(def.cle, "h", e.target.value)}
                />
              </label>
              <label style={{ ...champ, flex: "1 1 220px" }}>
                Tâche (poste)
                {def.tacheSup ? (
                  <input disabled value={def.tacheSup === "suivi" ? "Suivi de chantier" : "Étude"} />
                ) : (
                  <select value={heures[def.cle].tache} onChange={(e) => majHeures(def.cle, "tache", e.target.value)}>
                    {options(LISTE_TYPES_FO)}
                  </select>
                )}
              </label>
              <label style={{ ...champ, flex: "1 1 200px" }}>
                Profil
                <select value={heures[def.cle].type} onChange={(e) => majHeures(def.cle, "type", e.target.value)}>
                  {options(LISTE_TYPES_MO)}
                </select>
              </label>
            </div>
          ))}
        </div>

        <div style={carte}>
          <h3 style={{ margin: "0 0 4px" }}>Matériel</h3>
          {materiel.map((m, i) => (
            <div key={i} style={ligne}>
              <label style={{ ...champ, flex: "2 1 220px" }}>
                Désignation
                <input value={m.designation} onChange={(e) => majMat(i, "designation", e.target.value)} />
              </label>
              <label style={{ ...champ, flex: "2 1 220px" }}>
                Type de FO
                <select value={m.type} onChange={(e) => majMat(i, "type", e.target.value)}>
                  {options(LISTE_TYPES_FO)}
                </select>
              </label>
              <label style={{ ...champ, flex: "0 0 120px" }}>
                Coût d'achat (€)
                <input inputMode="decimal" value={m.cout} onChange={(e) => majMat(i, "cout", e.target.value)} />
              </label>
              {materiel.length > 1 && (
                <button className="btn-ghost btn-danger" title="Retirer cette ligne" onClick={() => setMateriel((p) => p.filter((_, k) => k !== i))}>
                  ×
                </button>
              )}
            </div>
          ))}
          <button
            className="btn-ghost"
            style={{ marginTop: 6 }}
            onClick={() => setMateriel((p) => [...p, { designation: "", type: "14", cout: "" }])}
          >
            + Ajouter une ligne de matériel
          </button>
        </div>

        {erreur && <div className="form-error" style={{ marginTop: 10 }}>{erreur}</div>}
        <div className="modal-actions" style={{ marginTop: 16 }}>
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
