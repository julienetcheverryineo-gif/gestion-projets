import { useEffect, useRef, useState } from "react";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "../firebase";
import { normaliserAssignes } from "../lib/assignes";
import PersonMultiSelect from "./PersonMultiSelect";

const STATUTS_TASK = [
  { value: "a_faire", label: "À faire" },
  { value: "en_cours", label: "En cours" },
  { value: "termine", label: "Terminé" },
];

const STATUTS_REGITEM = [
  { value: "a_faire", label: "À faire" },
  { value: "fait", label: "Fait" },
];

// Largeurs de colonnes par défaut (px). Le titre est volontairement large,
// heures/dates volontairement étroites.
const LARGEURS_DEFAUT = {
  chantier: 140,
  titre: 320,
  responsable: 170,
  heures: 64,
  debut: 118,
  fin: 118,
  statut: 110,
  commentaires: 180,
  actions: 40,
};

const CLE_STOCKAGE = "taskTableColWidths";

function chargerLargeurs() {
  try {
    const brut = localStorage.getItem(CLE_STOCKAGE);
    if (!brut) return { ...LARGEURS_DEFAUT };
    return { ...LARGEURS_DEFAUT, ...JSON.parse(brut) };
  } catch {
    return { ...LARGEURS_DEFAUT };
  }
}

// Affiche indifféremment des tâches "projet" (collection `tasks`) et des
// tâches issues d'un équipement régulé (`regitems` de type "tache") dans un
// seul tableau. `t._source` vaut "regitem" pour ces dernières ; leur
// désignation/statut ne peuvent être modifiées que depuis la fiche de
// l'équipement, mais le statut et le(s) responsable(s) restent modifiables
// directement. Pour les tâches "projet", toutes les colonnes sont éditables
// directement dans le tableau. Les colonnes sont redimensionnables à la
// souris (glisser le bord droit d'un en-tête) ; la taille est mémorisée
// pour toute l'appli (localStorage), pas seulement ce tableau.
export default function TaskTable({ taches, peutGerer, utilisateurs, onDelete, afficherChantier, nomChantier }) {
  const [largeurs, setLargeurs] = useState(chargerLargeurs);
  const redimensionRef = useRef(null);

  useEffect(() => {
    const onMove = (e) => {
      const info = redimensionRef.current;
      if (!info) return;
      const deltaX = e.clientX - info.startX;
      const nouvelle = Math.max(40, info.startWidth + deltaX);
      setLargeurs((prev) => ({ ...prev, [info.colonne]: nouvelle }));
    };
    const onUp = () => {
      if (!redimensionRef.current) return;
      redimensionRef.current = null;
      setLargeurs((actuelles) => {
        try {
          localStorage.setItem(CLE_STOCKAGE, JSON.stringify(actuelles));
        } catch {
          // stockage indisponible : tant pis, on garde juste la taille en mémoire
        }
        return actuelles;
      });
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  const demarrerRedimension = (colonne) => (e) => {
    e.preventDefault();
    redimensionRef.current = { colonne, startX: e.clientX, startWidth: largeurs[colonne] };
  };

  const changerChamp = async (t, champ, valeur) => {
    if (t._source === "regitem") {
      if (champ === "statut" || champ === "assigneA") {
        await updateDoc(doc(db, "regitems", t.id), { [champ]: valeur });
      }
      return;
    }
    await updateDoc(doc(db, "tasks", t.id), { [champ]: valeur });
  };

  if (taches.length === 0) {
    return (
      <p className="empty-state-description" style={{ margin: "8px 0" }}>
        Aucune tâche.
      </p>
    );
  }

  const Entete = ({ colonne, children }) => (
    <th style={{ width: largeurs[colonne], position: "relative" }}>
      {children}
      <span className="col-resizer" onMouseDown={demarrerRedimension(colonne)} />
    </th>
  );

  return (
    <table className="data-table task-table-editable" style={{ tableLayout: "fixed" }}>
      <thead>
        <tr>
          {afficherChantier && <Entete colonne="chantier">Chantier</Entete>}
          <Entete colonne="titre">Titre</Entete>
          <Entete colonne="responsable">Responsable</Entete>
          <Entete colonne="heures">Heures</Entete>
          <Entete colonne="debut">Début</Entete>
          <Entete colonne="fin">Fin</Entete>
          <Entete colonne="statut">Statut</Entete>
          <Entete colonne="commentaires">Commentaires</Entete>
          <th style={{ width: largeurs.actions }}></th>
        </tr>
      </thead>
      <tbody>
        {taches.map((t) => {
          const estRegitem = t._source === "regitem";
          const options = estRegitem ? STATUTS_REGITEM : STATUTS_TASK;
          const assignes = normaliserAssignes(t.assigneA);
          return (
            <tr key={(t._source || "task") + "-" + t.id}>
              {afficherChantier && (
                <td data-label="Chantier" style={{ fontFamily: "var(--font-ui)" }}>
                  {t.chantierId ? nomChantier(t.chantierId) : "À affecter"}
                </td>
              )}

              {estRegitem ? (
                <>
                  <td data-label="Titre" style={{ fontFamily: "var(--font-ui)" }}>
                    {t.titre}
                    <span className="simple-list-meta" style={{ marginLeft: 6 }}>
                      (équipement : {t._equipementNom})
                    </span>
                  </td>
                  <td data-label="Responsable">
                    <PersonMultiSelect
                      valeurs={assignes}
                      utilisateurs={utilisateurs}
                      onChange={(v) => changerChamp(t, "assigneA", v)}
                    />
                  </td>
                  <td data-label="Heures">{t.heuresPrevues || "—"}</td>
                  <td data-label="Début">—</td>
                  <td data-label="Fin">—</td>
                </>
              ) : (
                <>
                  <td data-label="Titre">
                    <input
                      className="import-edit-input"
                      defaultValue={t.titre}
                      onBlur={(e) => {
                        if (e.target.value !== t.titre) changerChamp(t, "titre", e.target.value);
                      }}
                    />
                  </td>
                  <td data-label="Responsable">
                    <PersonMultiSelect
                      valeurs={assignes}
                      utilisateurs={utilisateurs}
                      onChange={(v) => changerChamp(t, "assigneA", v)}
                    />
                  </td>
                  <td data-label="Heures">
                    <input
                      type="number"
                      min="0"
                      className="import-edit-input"
                      defaultValue={t.heuresPrevues ?? ""}
                      onBlur={(e) => {
                        const v = e.target.value ? Number(e.target.value) : null;
                        if (v !== (t.heuresPrevues ?? null)) changerChamp(t, "heuresPrevues", v);
                      }}
                    />
                  </td>
                  <td data-label="Début">
                    <input
                      type="date"
                      className="import-edit-input"
                      value={t.dateDebut || ""}
                      onChange={(e) => changerChamp(t, "dateDebut", e.target.value || null)}
                    />
                  </td>
                  <td data-label="Fin">
                    <input
                      type="date"
                      className="import-edit-input"
                      value={t.echeance || ""}
                      onChange={(e) => changerChamp(t, "echeance", e.target.value || null)}
                    />
                  </td>
                </>
              )}

              <td data-label="Statut">
                <select
                  value={t.statut ?? "a_faire"}
                  onChange={(e) => changerChamp(t, "statut", e.target.value)}
                >
                  {options.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </td>

              <td data-label="Commentaires">
                {estRegitem ? (
                  <span className="simple-list-meta">{t.commentaires || "—"}</span>
                ) : (
                  <input
                    className="import-edit-input"
                    defaultValue={t.commentaires ?? ""}
                    onBlur={(e) => {
                      if (e.target.value !== (t.commentaires ?? "")) {
                        changerChamp(t, "commentaires", e.target.value || null);
                      }
                    }}
                  />
                )}
              </td>

              <td>
                {estRegitem ? (
                  <span className="simple-list-meta">Depuis équipement</span>
                ) : (
                  peutGerer && (
                    <button className="btn-ghost btn-danger" onClick={() => onDelete(t.id)}>
                      ×
                    </button>
                  )
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
