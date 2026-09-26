import { Fragment, useMemo, useState } from "react";
import { arrondirHeures } from "../lib/usePlanningData";

function formatStatutTache(statut) {
  switch (statut) {
    case "en_cours":
      return "En cours";
    case "termine":
      return "Terminé";
    default:
      return "À faire";
  }
}

function formatDateCourte(v) {
  if (!v) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
  return m ? m[3] + "/" + m[2] : v;
}

// Un même chantier génère souvent plusieurs tâches au titre identique
// (une par équipement régulé, par exemple "Programmation CTA" répétée
// une dizaine de fois) : sans regroupement, le détail d'une case de
// charge devient une longue liste de lignes qui se ressemblent toutes et
// n'apporte rien. On regroupe donc par chantier + titre, avec le nombre
// de tâches et le total d'heures ; chaque groupe reste dépliable pour
// retrouver le détail (dates, statut) d'une tâche précise au besoin.
function grouperEntrees(entrees) {
  const parGroupe = new Map();
  for (const e of entrees) {
    const cle = (e.chantierId || "—") + "||" + e.titre;
    if (!parGroupe.has(cle)) {
      parGroupe.set(cle, { cle, chantierId: e.chantierId, titre: e.titre, heures: 0, items: [] });
    }
    const groupe = parGroupe.get(cle);
    groupe.heures += e.heures;
    groupe.items.push(e);
  }
  return [...parGroupe.values()].sort((a, b) => b.heures - a.heures);
}

// Détail des tâches d'une personne pour un mois donné (ou pour "non
// planifié"), pour comprendre d'où vient une charge élevée. Les heures
// affichées par tâche sont déjà la part attribuée à ce mois précis (une
// tâche à cheval sur plusieurs mois est répartie au prorata ailleurs).
export default function ChargeDetailModal({ nomPersonne, libelleColonne, entrees, nomChantier, onClose }) {
  const [recherche, setRecherche] = useState("");
  const [groupesOuverts, setGroupesOuverts] = useState(() => new Set());

  const total = entrees.reduce((s, e) => s + e.heures, 0);

  const entreesFiltrees = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    if (!q) return entrees;
    return entrees.filter((e) => {
      const nom = e.chantierId ? nomChantier(e.chantierId) : "à affecter";
      return e.titre.toLowerCase().includes(q) || nom.toLowerCase().includes(q);
    });
  }, [entrees, recherche, nomChantier]);

  const groupes = useMemo(() => grouperEntrees(entreesFiltrees), [entreesFiltrees]);

  const basculerGroupe = (cle) => {
    setGroupesOuverts((actuel) => {
      const suivant = new Set(actuel);
      if (suivant.has(cle)) suivant.delete(cle);
      else suivant.add(cle);
      return suivant;
    });
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 620 }}>
        <h2>{nomPersonne}</h2>
        <p className="empty-state-description" style={{ margin: "0 0 14px" }}>
          {libelleColonne} — {arrondirHeures(total)} h au total sur {entrees.length} tâche
          {entrees.length > 1 ? "s" : ""}
          {groupes.length < entrees.length ? " (" + groupes.length + " regroupées)" : ""}
        </p>

        {entrees.length > 6 && (
          <input
            className="chantiers-recherche"
            style={{ marginBottom: 12, width: "100%" }}
            placeholder="Filtrer par chantier ou tâche…"
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
          />
        )}

        {entrees.length === 0 ? (
          <p className="empty-state-description">Aucune tâche.</p>
        ) : groupes.length === 0 ? (
          <p className="empty-state-description">Aucun résultat pour cette recherche.</p>
        ) : (
          <div style={{ maxHeight: 440, overflowY: "auto" }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width: 20 }}></th>
                  <th>Chantier</th>
                  <th>Tâche</th>
                  <th style={{ width: 46, textAlign: "center" }}>Nb</th>
                  <th>Heures</th>
                </tr>
              </thead>
              <tbody>
                {groupes.map((g) => {
                  const pliable = g.items.length > 1;
                  const ouvert = groupesOuverts.has(g.cle);
                  return (
                    <Fragment key={g.cle}>
                      <tr
                        onClick={() => pliable && basculerGroupe(g.cle)}
                        style={pliable ? { cursor: "pointer" } : undefined}
                      >
                        <td style={{ textAlign: "center", color: "var(--text-muted)" }}>
                          {pliable ? (ouvert ? "▾" : "▸") : ""}
                        </td>
                        <td style={{ fontFamily: "var(--font-ui)" }}>
                          {g.chantierId ? nomChantier(g.chantierId) : "À affecter"}
                        </td>
                        <td style={{ fontFamily: "var(--font-ui)" }}>{g.titre}</td>
                        <td style={{ textAlign: "center" }}>{g.items.length}</td>
                        <td>{arrondirHeures(g.heures)} h</td>
                      </tr>
                      {ouvert &&
                        g.items
                          .slice()
                          .sort((a, b) => (a.dateDebut || "").localeCompare(b.dateDebut || ""))
                          .map((e) => {
                            const debut = formatDateCourte(e.dateDebut);
                            const fin = formatDateCourte(e.echeance);
                            return (
                              <tr key={e.id}>
                                <td></td>
                                <td
                                  colSpan={2}
                                  style={{
                                    fontFamily: "var(--font-ui)",
                                    color: "var(--text-muted)",
                                    fontSize: "0.85rem",
                                    paddingLeft: 24,
                                  }}
                                >
                                  {debut ? debut + (fin && fin !== debut ? " → " + fin : "") : "Sans dates"}
                                  {" · "}
                                  {formatStatutTache(e.statut)}
                                </td>
                                <td></td>
                                <td style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
                                  {arrondirHeures(e.heures)} h
                                </td>
                              </tr>
                            );
                          })}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="modal-actions">
          <button type="button" className="btn-ghost" onClick={onClose}>
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}
