import { Fragment, useMemo, useState } from "react";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "../firebase";
import { arrondirHeures } from "../lib/usePlanningData";
import { normaliserAssignes } from "../lib/assignes";
import PersonMultiSelect from "./PersonMultiSelect";

const STATUTS_TASK = [
  { value: "a_faire", label: "À faire" },
  { value: "en_cours", label: "En cours" },
  { value: "termine", label: "Terminé" },
];

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
// retrouver et corriger le détail (dates, responsable, heures, statut,
// avancement) d'une tâche précise au besoin.
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

// Une ligne éditable pour une tâche "projet" réelle (collection `tasks`),
// retrouvée via `tacheParId` — l'entrée du détail ne porte que la part
// d'heures du mois, pas la tâche complète. Les tâches issues d'un
// équipement régulé (_source "regitem") restent en lecture seule ici :
// elles se modifient depuis la fiche équipement, comme partout ailleurs
// dans l'appli.
function LigneTacheEditable({ entree, tache, nomChantier, utilisateurs }) {
  const assignes = normaliserAssignes(tache.assigneA);

  const changerChamp = (champ, valeur) => {
    updateDoc(doc(db, "tasks", tache.id), { [champ]: valeur });
  };

  const changerChamps = (champs) => {
    updateDoc(doc(db, "tasks", tache.id), champs);
  };

  return (
    <div className="charge-detail-edit-carte">
      <div className="charge-detail-edit-ligne1">
        <span className="charge-detail-edit-chantier">
          {tache.chantierId ? nomChantier(tache.chantierId) : "À affecter"}
        </span>
        <span className="charge-detail-edit-titre">{tache.titre}</span>
        <span className="simple-list-meta">{arrondirHeures(entree.heures)} h ce mois</span>
      </div>
      <div className="charge-detail-edit-champs">
        <label className="charge-detail-edit-champ">
          <span>Responsable</span>
          <PersonMultiSelect
            valeurs={assignes}
            utilisateurs={utilisateurs}
            onChange={(v) => changerChamp("assigneA", v)}
          />
        </label>
        <label className="charge-detail-edit-champ">
          <span>Début</span>
          <input
            type="date"
            className="import-edit-input"
            value={tache.dateDebut || ""}
            onChange={(e) => {
              const valeur = e.target.value || null;
              if (!tache.echeance && valeur) {
                changerChamps({ dateDebut: valeur, echeance: valeur });
              } else {
                changerChamp("dateDebut", valeur);
              }
            }}
          />
        </label>
        <label className="charge-detail-edit-champ">
          <span>Fin</span>
          <input
            type="date"
            className="import-edit-input"
            value={tache.echeance || ""}
            min={tache.dateDebut || undefined}
            onChange={(e) => changerChamp("echeance", e.target.value || null)}
          />
        </label>
        <label className="charge-detail-edit-champ charge-detail-edit-champ-etroit">
          <span>Heures</span>
          <input
            type="number"
            min="0"
            className="import-edit-input"
            defaultValue={tache.heuresPrevues ?? ""}
            onBlur={(e) => {
              const v = e.target.value ? Number(e.target.value) : null;
              if (v !== (tache.heuresPrevues ?? null)) changerChamp("heuresPrevues", v);
            }}
          />
        </label>
        <label className="charge-detail-edit-champ">
          <span>Statut</span>
          <select value={tache.statut ?? "a_faire"} onChange={(e) => changerChamp("statut", e.target.value)}>
            {STATUTS_TASK.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label className="charge-detail-edit-champ charge-detail-edit-champ-etroit">
          <span>Avanc. %</span>
          <input
            type="number"
            min="0"
            max="100"
            className="import-edit-input"
            defaultValue={tache.avancement ?? ""}
            placeholder="0"
            onBlur={(e) => {
              let v = e.target.value === "" ? null : Number(e.target.value);
              if (v !== null) v = Math.max(0, Math.min(100, v));
              if (v !== (tache.avancement ?? null)) changerChamp("avancement", v);
            }}
          />
        </label>
      </div>
    </div>
  );
}

// Détail des tâches d'une personne pour un mois donné (ou pour "non
// planifié"), pour comprendre d'où vient une charge élevée — et corriger
// directement ce qu'on y trouve plutôt que de rouvrir chaque tâche une
// par une depuis la page Tâches. Les heures affichées par tâche sont déjà
// la part attribuée à ce mois précis (une tâche à cheval sur plusieurs
// mois est répartie au prorata ailleurs).
export default function ChargeDetailModal({
  nomPersonne,
  libelleColonne,
  entrees,
  nomChantier,
  tacheParId,
  utilisateurs,
  onClose,
}) {
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
      <div className="modal charge-detail-modal" onClick={(e) => e.stopPropagation()}>
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
          <div className="charge-detail-scroll">
            <table className="data-table charge-detail-table">
              <thead>
                <tr>
                  <th style={{ width: 22 }}></th>
                  <th>Chantier</th>
                  <th>Tâche</th>
                  <th style={{ width: 50, textAlign: "center" }}>Nb</th>
                  <th style={{ width: 90 }}>Heures</th>
                </tr>
              </thead>
              <tbody>
                {groupes.map((g) => {
                  const pliable = g.items.length > 1;
                  const ouvert = pliable ? groupesOuverts.has(g.cle) : true;
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
                            const tache = tacheParId?.get(e.id);
                            const editable = tache && tache._source !== "regitem";
                            if (editable) {
                              return (
                                <tr key={e.id}>
                                  <td></td>
                                  <td colSpan={4} style={{ padding: 0 }}>
                                    <LigneTacheEditable
                                      entree={e}
                                      tache={tache}
                                      nomChantier={nomChantier}
                                      utilisateurs={utilisateurs}
                                    />
                                  </td>
                                </tr>
                              );
                            }
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
                                  {tache?._source === "regitem" && (
                                    <span style={{ marginLeft: 6 }}>· depuis la fiche équipement</span>
                                  )}
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
