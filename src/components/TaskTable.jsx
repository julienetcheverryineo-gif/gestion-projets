import { doc, updateDoc } from "firebase/firestore";
import { db } from "../firebase";

const STATUTS_TASK = [
  { value: "a_faire", label: "À faire" },
  { value: "en_cours", label: "En cours" },
  { value: "termine", label: "Terminé" },
];

const STATUTS_REGITEM = [
  { value: "a_faire", label: "À faire" },
  { value: "fait", label: "Fait" },
];

// Affiche indifféremment des tâches "projet" (collection `tasks`) et des
// tâches issues d'un équipement régulé (`regitems` de type "tache") dans un
// seul tableau. `t._source` vaut "regitem" pour ces dernières ; leur
// désignation/statut ne peuvent être modifiées que depuis la fiche de
// l'équipement, mais le statut reste modifiable directement.
// Pour les tâches "projet" en revanche, toutes les colonnes sont éditables
// directement dans le tableau (pas de passage par une fenêtre séparée).
// Chaque <td> porte un data-label : sur mobile, le tableau se transforme en
// cartes empilées et ce label sert d'intitulé devant la valeur (voir CSS).
export default function TaskTable({ taches, peutGerer, utilisateurs, onDelete, afficherChantier, nomChantier }) {
  const changerChamp = async (t, champ, valeur) => {
    if (t._source === "regitem") {
      if (champ === "statut") await updateDoc(doc(db, "regitems", t.id), { statut: valeur });
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

  return (
    <table className="data-table task-table-editable">
      <thead>
        <tr>
          {afficherChantier && <th>Chantier</th>}
          <th>Titre</th>
          <th>Responsable</th>
          <th>Heures</th>
          <th>Début</th>
          <th>Fin</th>
          <th>Statut</th>
          <th>Commentaires</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {taches.map((t) => {
          const estRegitem = t._source === "regitem";
          const options = estRegitem ? STATUTS_REGITEM : STATUTS_TASK;
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
                  <td data-label="Responsable" style={{ fontFamily: "var(--font-ui)" }}>
                    {t.assigneA || "À affecter"}
                  </td>
                  <td data-label="Heures">—</td>
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
                    <select
                      className="import-edit-input"
                      value={t.assigneA || ""}
                      onChange={(e) => changerChamp(t, "assigneA", e.target.value || null)}
                    >
                      <option value="">À affecter</option>
                      {utilisateurs.map((u) => (
                        <option key={u.id} value={u.nom}>
                          {u.nom}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td data-label="Heures">
                    <input
                      type="number"
                      min="0"
                      className="import-edit-input task-cell-heures"
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
