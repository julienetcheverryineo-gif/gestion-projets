import { useState } from "react";
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

const HEURES = [
  { cle: "suivi", libelle: "Heures de suivi", defaut: "53" },
  { cle: "be", libelle: "Heures de bureau d'étude", defaut: "61" },
  { cle: "chantier", libelle: "Heures de chantier", defaut: "PR" },
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
    HEURES.forEach((def) => {
      const s = heures[def.cle];
      const h = nombre(s.h);
      if (!h) return;
      const t = LISTE_TYPES_MO.find((x) => x.code === s.type);
      const tache = LISTE_TYPES_FO.find((x) => x.code === s.tache);
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
    if (pv) lignes.push({ designation: "Montant vendu de la commande", unite: "u", quantite: 1, pvLigne: pv, pvTotal: pv });
    const sequence = [
      { estPoste: true, code: "A", profondeur: 0, designation: nom.trim() },
      ...lignes.map((l) => ({ estPoste: false, code: "", profondeur: 1, ...l })),
    ].map((l, i) => ({ ...l, ordre: i }));
    setEnCours(true);
    try {
      await ecrireDevisElec({ chantierId, nomDevis: nom, nomFichier: "", sequence, ordre: nbDevisExistants });
      onClose();
    } catch (err) {
      setErreur("Erreur pendant la création : " + err.message);
      setEnCours(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 820 }} onClick={(e) => e.stopPropagation()}>
        <h2 style={{ marginTop: 0 }}>Nouvelle commande sans minute</h2>
        <label>
          Nom de la commande
          <br />
          <input style={{ width: "100%" }} value={nom} onChange={(e) => setNom(e.target.value)} autoFocus />
        </label>

        <label style={{ display: "block", marginTop: 12 }}>
          Montant vendu total de la commande (€ HT)
          <br />
          <input inputMode="decimal" style={{ width: 160 }} value={pvTotal} onChange={(e) => setPvTotal(e.target.value)} />
        </label>

        <h3>Heures</h3>
        <div className="data-table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th></th>
                <th>Heures</th>
                <th>Tâche (poste)</th>
                <th>Profil (type de MO)</th>
              </tr>
            </thead>
            <tbody>
              {HEURES.map((def) => (
                <tr key={def.cle}>
                  <td>{def.libelle}</td>
                  <td>
                    <input
                      inputMode="decimal"
                      style={{ width: 90 }}
                      value={heures[def.cle].h}
                      onChange={(e) => majHeures(def.cle, "h", e.target.value)}
                    />
                  </td>
                  <td>
                    <select value={heures[def.cle].tache} onChange={(e) => majHeures(def.cle, "tache", e.target.value)}>
                      {LISTE_TYPES_FO.map((t) => (
                        <option key={t.code} value={t.code}>
                          {t.code} | {t.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <select value={heures[def.cle].type} onChange={(e) => majHeures(def.cle, "type", e.target.value)}>
                      {LISTE_TYPES_MO.map((t) => (
                        <option key={t.code} value={t.code}>
                          {t.code} | {t.label}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h3>Matériel</h3>
        <div className="data-table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Désignation</th>
                <th>Type de FO</th>
                <th>Coût d'achat (€)</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {materiel.map((m, i) => (
                <tr key={i}>
                  <td>
                    <input value={m.designation} onChange={(e) => majMat(i, "designation", e.target.value)} />
                  </td>
                  <td>
                    <select value={m.type} onChange={(e) => majMat(i, "type", e.target.value)}>
                      {LISTE_TYPES_FO.map((t) => (
                        <option key={t.code} value={t.code}>
                          {t.code} | {t.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input inputMode="decimal" style={{ width: 100 }} value={m.cout} onChange={(e) => majMat(i, "cout", e.target.value)} />
                  </td>
                  <td>
                    {materiel.length > 1 && (
                      <button className="btn-ghost btn-danger" onClick={() => setMateriel((p) => p.filter((_, k) => k !== i))}>
                        ×
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button
          className="btn-ghost"
          style={{ marginTop: 8 }}
          onClick={() => setMateriel((p) => [...p, { designation: "", type: "14", cout: "" }])}
        >
          + Ajouter une ligne de matériel
        </button>

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
