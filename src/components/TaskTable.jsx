import { useEffect, useMemo, useRef, useState } from "react";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "../firebase";
import { normaliserAssignes } from "../lib/assignes";
import { estTactile } from "../lib/tactile";
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
// tâches issues d'un équipement régulé (`regitems` de type "tache", pour
// compatibilité avec les données créées avant qu'on sépare les deux) dans
// un seul tableau. `t._source` vaut "regitem" pour ces dernières ; elles ne
// peuvent pas être réordonnées ni voir leur désignation modifiée ici (ça se
// fait depuis la fiche équipement), mais statut et responsable(s) restent
// éditables. Les tâches "projet" sont, elles, intégralement éditables et
// réordonnables : glisser une ligne par sa poignée (souris) ou les boutons
// ▲/▼ (tactile, le glisser-déposer HTML5 ne fonctionnant pas au doigt).
// Les colonnes sont redimensionnables (glisser le bord d'un en-tête) ; la
// taille est mémorisée pour toute l'appli.
export default function TaskTable({ taches, peutGerer, utilisateurs, onDelete, afficherChantier, nomChantier }) {
  const [largeurs, setLargeurs] = useState(chargerLargeurs);
  const redimensionRef = useRef(null);

  const tachesTriees = useMemo(
    () => [...taches].sort((a, b) => (a.ordre ?? 0) - (b.ordre ?? 0)),
    [taches]
  );

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

  // Déplace la tâche de `depuis` vers `vers` dans la liste affichée, puis
  // renumérote (0, 1, 2…) toutes les tâches "projet" de cette liste — les
  // tâches issues d'un équipement (`_source === "regitem"`) ne sont pas
  // réordonnables ici et gardent leur position d'origine.
  const deplacerTache = async (depuis, vers) => {
    if (vers < 0 || vers >= tachesTriees.length || depuis === vers) return;
    const copie = [...tachesTriees];
    const [item] = copie.splice(depuis, 1);
    copie.splice(vers, 0, item);
    await Promise.all(
      copie
        .filter((t) => t._source !== "regitem")
        .map((t, i) => updateDoc(doc(db, "tasks", t.id), { ordre: i }))
    );
  };

  if (tachesTriees.length === 0) {
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
          {peutGerer && <th style={{ width: estTactile ? 64 : 24 }}></th>}
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
        {tachesTriees.map((t, index) => {
          const estRegitem = t._source === "regitem";
          const options = estRegitem ? STATUTS_REGITEM : STATUTS_TASK;
          const assignes = normaliserAssignes(t.assigneA);
          const reorganisable = peutGerer && !estRegitem;
          return (
            <tr
              key={(t._source || "task") + "-" + t.id}
              draggable={reorganisable && !estTactile}
              onDragStart={(e) => {
                if (!reorganisable) return;
                e.dataTransfer.setData("text/task-index", String(index));
              }}
              onDragOver={(e) => reorganisable && e.preventDefault()}
              onDrop={(e) => {
                if (!reorganisable) return;
                e.preventDefault();
                const indexDepart = Number(e.dataTransfer.getData("text/task-index"));
                if (Number.isNaN(indexDepart)) return;
                deplacerTache(indexDepart, index);
              }}
              className={reorganisable && !estTactile ? "reg-equip-draggable" : undefined}
            >
              {peutGerer && (
                <td>
                  {reorganisable && estTactile ? (
                    <div className="tache-move-mobile">
                      <button
                        className="btn-ghost"
                        disabled={index === 0}
                        onClick={() => deplacerTache(index, index - 1)}
                        aria-label="Monter"
                      >
                        ▲
                      </button>
                      <button
                        className="btn-ghost"
                        disabled={index === tachesTriees.length - 1}
                        onClick={() => deplacerTache(index, index + 1)}
                        aria-label="Descendre"
                      >
                        ▼
                      </button>
                    </div>
                  ) : (
                    reorganisable && <span className="tache-drag-handle">⠿</span>
                  )}
                </td>
              )}
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
