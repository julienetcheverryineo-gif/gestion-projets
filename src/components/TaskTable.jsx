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
  equipement: 150,
  titre: 280,
  responsable: 170,
  heures: 64,
  debut: 118,
  fin: 118,
  statut: 110,
  avancement: 90,
  commentaires: 170,
  actions: 40,
};

const CLE_STOCKAGE = "taskTableColWidths";

// Colonne qui absorbe les redimensionnements des autres colonnes (voir
// demarrerRedimension) : la plus élastique (texte libre, peu de contenu
// critique), pour que le tableau reste dans son encart au lieu de déborder.
const COLONNE_ELASTIQUE = "commentaires";

function chargerLargeurs() {
  try {
    const brut = localStorage.getItem(CLE_STOCKAGE);
    if (!brut) return { ...LARGEURS_DEFAUT };
    return { ...LARGEURS_DEFAUT, ...JSON.parse(brut) };
  } catch {
    return { ...LARGEURS_DEFAUT };
  }
}

// Valeur comparable/filtrable de chaque colonne, pour le tri et le filtre.
function valeurColonne(t, colonne, nomChantier) {
  switch (colonne) {
    case "chantier":
      return t.chantierId ? nomChantier(t.chantierId) : "À affecter";
    case "equipement":
      return t._source === "regitem" ? t._equipementNom || "" : t.equipementSource || "";
    case "titre":
      return t.titre || "";
    case "responsable":
      return normaliserAssignes(t.assigneA).join(", ") || "À affecter";
    case "heures":
      return t.heuresPrevues ?? "";
    case "debut":
      return t.dateDebut || "";
    case "fin":
      return t.echeance || "";
    case "statut":
      return t.statut || "";
    case "avancement":
      return t.avancement ?? "";
    case "commentaires":
      return t.commentaires || "";
    default:
      return "";
  }
}

// Affiche indifféremment des tâches "projet" (collection `tasks`) et des
// tâches issues d'un équipement régulé (`regitems` de type "tache", pour
// compatibilité avec les données créées avant qu'on sépare les deux) dans
// un seul tableau. `t._source` vaut "regitem" pour ces dernières : leur
// désignation/équipement ne peuvent pas être modifiés ici (ça se fait
// depuis la fiche équipement), mais statut et responsable(s) restent
// éditables. Les tâches "projet" sont, elles, intégralement éditables,
// y compris leur équipement d'origine (simple texte libre).
//
// Réorganisation (glisser sur PC, flèches ▲/▼ au tactile) uniquement
// disponible tant qu'aucun tri par colonne n'est actif — trier et
// réorganiser manuellement sont deux logiques d'ordre incompatibles.
// Chaque colonne peut aussi être filtrée (ligne de recherche sous les
// en-têtes) et triée (clic sur l'intitulé, cycle aucun → ↑ → ↓).
// Les colonnes sont redimensionnables (glisser le bord d'un en-tête) ;
// la taille est mémorisée pour toute l'appli.
export default function TaskTable({ taches, peutGerer, utilisateurs, electriciens = [], onDelete, afficherChantier, nomChantier }) {
  const [largeurs, setLargeurs] = useState(chargerLargeurs);
  const [tri, setTri] = useState({ colonne: null, sens: 1 });
  const [filtres, setFiltres] = useState({});
  const redimensionRef = useRef(null);

  const tachesFiltrees = useMemo(() => {
    const entreesFiltre = Object.entries(filtres).filter(([, v]) => v && v.trim());
    if (entreesFiltre.length === 0) return taches;
    return taches.filter((t) =>
      entreesFiltre.every(([colonne, valeur]) =>
        String(valeurColonne(t, colonne, nomChantier))
          .toLowerCase()
          .includes(valeur.trim().toLowerCase())
      )
    );
  }, [taches, filtres, nomChantier]);

  const tachesTriees = useMemo(() => {
    const copie = [...tachesFiltrees];
    if (tri.colonne) {
      copie.sort((a, b) => {
        const va = valeurColonne(a, tri.colonne, nomChantier);
        const vb = valeurColonne(b, tri.colonne, nomChantier);
        if (va < vb) return -1 * tri.sens;
        if (va > vb) return 1 * tri.sens;
        return 0;
      });
    } else {
      copie.sort((a, b) => (a.ordre ?? 0) - (b.ordre ?? 0));
    }
    return copie;
  }, [tachesFiltrees, tri, nomChantier]);

  useEffect(() => {
    const onMove = (e) => {
      const info = redimensionRef.current;
      if (!info) return;
      const deltaX = e.clientX - info.startX;

      // Élargir une colonne prend la place sur la colonne "Commentaires"
      // (la plus élastique, du texte libre peu contraint) plutôt que de
      // faire grandir le tableau entier hors de son encart blanc — sauf
      // si c'est justement Commentaires qu'on redimensionne, auquel cas
      // elle se redimensionne simplement seule.
      if (info.colonne === COLONNE_ELASTIQUE) {
        const nouvelle = Math.max(60, info.startWidth + deltaX);
        setLargeurs((prev) => ({ ...prev, [info.colonne]: nouvelle }));
        return;
      }

      let nouvelle = Math.max(40, info.startWidth + deltaX);
      let deltaApplique = nouvelle - info.startWidth;
      let nouvelleElastique = info.startElastique - deltaApplique;
      if (nouvelleElastique < 60) {
        nouvelleElastique = 60;
        deltaApplique = info.startElastique - 60;
        nouvelle = info.startWidth + deltaApplique;
      }
      setLargeurs((prev) => ({
        ...prev,
        [info.colonne]: nouvelle,
        [COLONNE_ELASTIQUE]: nouvelleElastique,
      }));
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
    e.stopPropagation();
    redimensionRef.current = {
      colonne,
      startX: e.clientX,
      startWidth: largeurs[colonne],
      startElastique: largeurs[COLONNE_ELASTIQUE],
    };
  };

  const basculerTri = (colonne) => {
    setTri((t) => {
      if (t.colonne !== colonne) return { colonne, sens: 1 };
      if (t.sens === 1) return { colonne, sens: -1 };
      return { colonne: null, sens: 1 };
    });
  };

  const changerFiltre = (colonne, valeur) => {
    setFiltres((f) => ({ ...f, [colonne]: valeur }));
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

  // Variante multi-champs (même règle que changerChamp pour les regitems :
  // seuls statut/assigneA y sont modifiables, donc inutilisée pour eux ici).
  const changerChamps = async (t, champs) => {
    if (t._source === "regitem") return;
    await updateDoc(doc(db, "tasks", t.id), champs);
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

  const triActif = tri.colonne !== null;

  const Entete = ({ colonne, children }) => (
    <th style={{ width: largeurs[colonne], position: "relative" }}>
      <button
        type="button"
        className="th-tri-btn"
        onClick={() => basculerTri(colonne)}
        title="Trier"
      >
        {children}
        {tri.colonne === colonne ? (tri.sens > 0 ? " ▾" : " ▴") : ""}
      </button>
      <span className="col-resizer" onMouseDown={demarrerRedimension(colonne)} />
    </th>
  );

  const FiltreCell = ({ colonne }) => (
    <th style={{ width: largeurs[colonne] }}>
      <input
        className="th-filtre-input"
        placeholder="Filtrer…"
        value={filtres[colonne] ?? ""}
        onChange={(e) => changerFiltre(colonne, e.target.value)}
      />
    </th>
  );

  if (taches.length === 0) {
    return (
      <p className="empty-state-description" style={{ margin: "8px 0" }}>
        Aucune tâche.
      </p>
    );
  }

  return (
    <div className="hscroll-auto" style={{ overflowX: "auto" }}>
    <table className="data-table task-table-editable" style={{ tableLayout: "fixed" }}>
      <thead>
        <tr>
          {peutGerer && <th style={{ width: estTactile ? 64 : 24 }}></th>}
          {afficherChantier && <Entete colonne="chantier">Chantier</Entete>}
          <Entete colonne="equipement">Équipement</Entete>
          <Entete colonne="titre">Titre</Entete>
          <Entete colonne="responsable">Responsable</Entete>
          <Entete colonne="heures">Heures</Entete>
          <Entete colonne="debut">Début</Entete>
          <Entete colonne="fin">Fin</Entete>
          <Entete colonne="statut">Statut</Entete>
          <Entete colonne="avancement">Avanc.</Entete>
          <Entete colonne="commentaires">Commentaires</Entete>
          <th style={{ width: largeurs.actions }}></th>
        </tr>
        <tr>
          {peutGerer && <th></th>}
          {afficherChantier && <FiltreCell colonne="chantier" />}
          <FiltreCell colonne="equipement" />
          <FiltreCell colonne="titre" />
          <FiltreCell colonne="responsable" />
          <FiltreCell colonne="heures" />
          <FiltreCell colonne="debut" />
          <FiltreCell colonne="fin" />
          <FiltreCell colonne="statut" />
          <FiltreCell colonne="avancement" />
          <FiltreCell colonne="commentaires" />
          <th></th>
        </tr>
      </thead>
      <tbody>
        {tachesTriees.length === 0 ? (
          <tr>
            <td colSpan={13} style={{ textAlign: "center", padding: "16px 0" }}>
              <span className="simple-list-meta">Aucune tâche ne correspond aux filtres.</span>
            </td>
          </tr>
        ) : (
          tachesTriees.map((t, index) => {
            const estRegitem = t._source === "regitem";
            const options = estRegitem ? STATUTS_REGITEM : STATUTS_TASK;
            const assignes = normaliserAssignes(t.assigneA);
            const reorganisable = peutGerer && !estRegitem && !triActif;
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

                <td data-label="Équipement">
                  {estRegitem ? (
                    <span className="simple-list-meta">{t._equipementNom || "—"}</span>
                  ) : (
                    <input
                      className="import-edit-input"
                      defaultValue={t.equipementSource ?? ""}
                      placeholder="—"
                      onBlur={(e) => {
                        if (e.target.value !== (t.equipementSource ?? "")) {
                          changerChamp(t, "equipementSource", e.target.value || null);
                        }
                      }}
                    />
                  )}
                </td>

                {estRegitem ? (
                  <>
                    <td data-label="Titre" style={{ fontFamily: "var(--font-ui)" }}>
                      {t.titre}
                    </td>
                    <td data-label="Responsable">
                      <PersonMultiSelect
                        valeurs={assignes}
                        utilisateurs={utilisateurs}
                        autresNoms={electriciens}
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
                        autresNoms={electriciens}
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
                        onChange={(e) => {
                          const valeur = e.target.value || null;
                          // Si la fin n'est pas encore renseignée, elle suit le début —
                          // le cas le plus fréquent (tâche d'un jour) ne demande alors
                          // plus qu'une seule saisie ; sinon on ne touche pas à une fin
                          // déjà choisie.
                          if (!t.echeance && valeur) {
                            changerChamps(t, { dateDebut: valeur, echeance: valeur });
                          } else {
                            changerChamp(t, "dateDebut", valeur);
                          }
                        }}
                      />
                    </td>
                    <td data-label="Fin">
                      <input
                        type="date"
                        className="import-edit-input"
                        value={t.echeance || ""}
                        min={t.dateDebut || undefined}
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

                <td data-label="Avanc.">
                  {estRegitem ? (
                    <span className="simple-list-meta">—</span>
                  ) : (
                    <input
                      type="number"
                      min="0"
                      max="100"
                      className="import-edit-input task-cell-avancement"
                      defaultValue={t.avancement ?? ""}
                      placeholder="0"
                      onBlur={(e) => {
                        let v = e.target.value === "" ? null : Number(e.target.value);
                        if (v !== null) v = Math.max(0, Math.min(100, v));
                        if (v !== (t.avancement ?? null)) changerChamp(t, "avancement", v);
                      }}
                    />
                  )}
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
          })
        )}
      </tbody>
    </table>
    </div>
  );
}
