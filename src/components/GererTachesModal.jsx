import { useState } from "react";
import { doc, updateDoc, writeBatch } from "firebase/firestore";
import { db } from "../firebase";
import { codeTypeFo } from "../lib/exportGoat";
import { valeurType } from "../lib/typesElectricite";

// Gestion des Tâches (anciennement « Types de FO ») d'un chantier : on peut
// renommer le libellé de chaque tâche (toutes les lignes de devis qui
// l'utilisent suivent) et en ajouter. La liste est propre au chantier
// (champ tachesFo du chantier) ; tant qu'elle n'a pas été modifiée, le
// référentiel standard s'applique.
export default function GererTachesModal({ chantierId, chantier, taches, lignesChantier, onClose }) {
  const [items, setItems] = useState(() =>
    taches.map((t) => ({ code: t.code, label: t.label, origine: t.label }))
  );
  const [nouveau, setNouveau] = useState("");
  const [filtre, setFiltre] = useState("");
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState("");

  const nbUtilisations = (code) => lignesChantier.filter((l) => codeTypeFo(l.typeFo) === code).length;

  const ajouter = () => {
    const label = nouveau.trim();
    if (!label) return;
    if (items.some((i) => i.label.trim().toLowerCase() === label.toLowerCase())) {
      setErreur("Ce libellé existe déjà.");
      return;
    }
    setErreur("");
    // Codes numériques à 3 chiffres (301, 302...) : même format que les
    // sous-types existants, pour s'afficher et se trier comme les autres.
    const max = items.reduce((m, i) => (/^30\d+$/.test(i.code) ? Math.max(m, Number(i.code)) : m), 300);
    setItems((prev) => [...prev, { code: String(max + 1), label, origine: null }]);
    setNouveau("");
  };

  const enregistrer = async () => {
    setEnCours(true);
    setErreur("");
    try {
      const finale = items.map((i) => ({ code: i.code, label: i.label.trim() || i.origine || i.code }));
      // Anciennes valeurs de typeFo -> nouvelles, pour les tâches renommées.
      const renommees = new Map();
      items.forEach((i, idx) => {
        if (i.origine !== null && finale[idx].label !== i.origine) {
          renommees.set(i.code, valeurType(i.code, finale[idx].label));
        }
      });
      const ancienVersNouveau = new Map();
      const operations = [];
      lignesChantier.forEach((l) => {
        const nv = renommees.get(codeTypeFo(l.typeFo));
        if (nv && l.typeFo !== nv) {
          ancienVersNouveau.set(l.typeFo, nv);
          operations.push((batch) => batch.update(doc(db, "elecLignes", l.id), { typeFo: nv }));
        }
      });
      for (let i = 0; i < operations.length; i += 400) {
        const batch = writeBatch(db);
        operations.slice(i, i + 400).forEach((op) => op(batch));
        await batch.commit();
      }
      // Les corrections propres au chantier sont indexées par la valeur de
      // typeFo : on les suit pour ne rien perdre au renommage.
      const cle = (v) => ancienVersNouveau.get(v) ?? v;
      const reCle = (obj) =>
        Object.fromEntries(Object.entries(obj || {}).map(([k, v]) => [cle(k), v]));
      // Une affectation d'heures peut valoir « idDevis||tâche » : on ne
      // remplace que la partie tâche.
      const reValeur = (v) => {
        const i = String(v).indexOf("||");
        return i === -1 ? cle(v) : v.slice(0, i + 2) + cle(v.slice(i + 2));
      };
      const reValeurs = (obj) =>
        Object.fromEntries(Object.entries(obj || {}).map(([k, v]) => [k, reValeur(v)]));
      await updateDoc(doc(db, "sites", chantierId), {
        tachesFo: finale,
        ordreTypesFo: reCle(chantier?.ordreTypesFo),
        ordreTypesMo: reCle(chantier?.ordreTypesMo),
        affectationsSapLignes: reValeurs(chantier?.affectationsSapLignes),
        affectationsSapHeures: reValeurs(chantier?.affectationsSapHeures),
      });
      onClose();
    } catch (err) {
      setErreur("Erreur : " + err.message);
      setEnCours(false);
    }
  };

  const visibles = items.filter(
    (i) => !filtre || (i.code + " " + i.label).toLowerCase().includes(filtre.toLowerCase())
  );

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 640 }} onClick={(e) => e.stopPropagation()}>
        <h2>Types de FO / tâches</h2>
        <p className="simple-list-meta" style={{ marginBottom: 10 }}>
          Modifiez le libellé : toutes les lignes de devis qui l'utilisent sont mises à
          jour. Vous pouvez aussi en ajouter un nouveau.
        </p>
        <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
          <input
            type="text"
            style={{ flex: 1 }}
            placeholder="Nouveau libellé…"
            value={nouveau}
            onChange={(e) => setNouveau(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                ajouter();
              }
            }}
          />
          <button type="button" className="btn-primary" onClick={ajouter}>
            + Ajouter
          </button>
        </div>
        <input
          type="search"
          placeholder="Filtrer…"
          value={filtre}
          onChange={(e) => setFiltre(e.target.value)}
          style={{ width: "100%", marginBottom: 8 }}
        />
        <div style={{ maxHeight: "50vh", overflow: "auto" }}>
          {visibles.map((i) => (
            <div key={i.code} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 4 }}>
              <span className="simple-list-meta" style={{ width: 48 }}>{i.code}</span>
              <input
                type="text"
                style={{ flex: 1 }}
                value={i.label}
                onChange={(e) =>
                  setItems((prev) =>
                    prev.map((x) => (x.code === i.code ? { ...x, label: e.target.value } : x))
                  )
                }
              />
              <span className="simple-list-meta" style={{ width: 70, textAlign: "right" }}>
                {i.origine === null ? "nouvelle" : nbUtilisations(i.code) + " ligne(s)"}
              </span>
            </div>
          ))}
        </div>
        {erreur && <div className="form-error">{erreur}</div>}
        <div className="modal-actions" style={{ marginTop: 12 }}>
          <button type="button" className="btn-ghost" onClick={onClose}>
            Annuler
          </button>
          <button type="button" className="btn-primary" disabled={enCours} onClick={enregistrer}>
            {enCours ? "Enregistrement…" : "Enregistrer"}
          </button>
        </div>
      </div>
    </div>
  );
}
