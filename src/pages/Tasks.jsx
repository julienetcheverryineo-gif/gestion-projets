import { useMemo, useState } from "react";
import { addDoc, collection, deleteDoc, doc, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../contexts/AuthContext";
import { useCollection } from "../lib/firestoreHooks";
import TaskTable from "../components/TaskTable";

export default function Tasks() {
  const { isAdmin, isChefDeProjet } = useAuth();
  const peutGerer = isAdmin || isChefDeProjet;
  const { documents: taches } = useCollection("tasks");
  const { documents: chantiers } = useCollection("sites");
  const { documents: utilisateurs } = useCollection("users", "email");
  const { documents: regItems } = useCollection("regitems");
  const { documents: regEquipements } = useCollection("regequipements");
  const [groupeOuvert, setGroupeOuvert] = useState(null);

  const tachesRegitems = useMemo(
    () =>
      regItems
        .filter((it) => it.type === "tache")
        .map((it) => {
          const equip = regEquipements.find((r) => r.id === it.regEquipementId);
          return {
            id: it.id,
            _source: "regitem",
            _equipementNom: equip?.nom ?? "?",
            titre: it.designation,
            chantierId: equip?.chantierId ?? null,
            assigneA: it.assigneA || null,
            heuresPrevues: null,
            dateDebut: null,
            echeance: null,
            commentaires: it.remarque || null,
            statut: it.statut,
          };
        }),
    [regItems, regEquipements]
  );

  const toutesLesTaches = useMemo(
    () => [...taches, ...tachesRegitems],
    [taches, tachesRegitems]
  );

  const groupes = useMemo(() => {
    const map = new Map();
    // Un groupe par chantier existant, même sans tâche, pour qu'on les retrouve tous
    for (const c of chantiers) {
      map.set(c.id, { id: c.id, nom: c.nom, taches: [] });
    }
    map.set("aaffecter", { id: null, nom: "À affecter", taches: [] });
    for (const t of toutesLesTaches) {
      const cle = t.chantierId && map.has(t.chantierId) ? t.chantierId : "aaffecter";
      map.get(cle).taches.push(t);
    }
    return [...map.values()].filter((g) => g.id === null ? g.taches.length > 0 : true);
  }, [toutesLesTaches, chantiers]);

  const supprimer = async (id) => {
    if (!confirm("Supprimer cette tâche ?")) return;
    await deleteDoc(doc(db, "tasks", id));
  };

  const ajouterTache = async (chantierId) => {
    await addDoc(collection(db, "tasks"), {
      titre: "Nouvelle tâche",
      chantierId: chantierId || null,
      assigneA: null,
      heuresPrevues: null,
      dateDebut: null,
      echeance: null,
      lienDevis: null,
      commentaires: null,
      statut: "a_faire",
      creeLe: serverTimestamp(),
    });
    setGroupeOuvert(chantierId ?? "aaffecter");
  };

  return (
    <div className="page">
      <header className="page-header page-header-actions">
        <div>
          <h1>Tâches</h1>
          <p className="page-subtitle">Toutes les tâches, regroupées par chantier.</p>
        </div>
        <button className="btn-primary" onClick={() => ajouterTache(null)}>
          Nouvelle tâche
        </button>
      </header>

      {groupes.length === 0 ? (
        <div className="empty-state">
          <p className="empty-state-title">Aucune tâche</p>
          <p className="empty-state-description">Créez un chantier, puis ajoutez des tâches.</p>
        </div>
      ) : (
        <div className="lot-list">
          {groupes.map((g) => {
            const ouvert = groupeOuvert === (g.id ?? "aaffecter");
            return (
              <div key={g.id ?? "aaffecter"} className="lot-card">
                <div
                  className="lot-card-header"
                  onClick={() => setGroupeOuvert(ouvert ? null : g.id ?? "aaffecter")}
                >
                  <div>
                    <span className="lot-card-toggle">{ouvert ? "▾" : "▸"}</span>
                    <strong>{g.nom}</strong>
                    <span className="simple-list-meta" style={{ marginLeft: 10 }}>
                      {g.taches.length} tâche(s)
                    </span>
                  </div>
                  <button
                    className="btn-ghost"
                    onClick={(e) => {
                      e.stopPropagation();
                      ajouterTache(g.id);
                    }}
                  >
                    + Tâche
                  </button>
                </div>
                {ouvert && (
                  <div className="lot-card-body">
                    <TaskTable
                      taches={g.taches}
                      peutGerer={peutGerer}
                      utilisateurs={utilisateurs}
                      onDelete={supprimer}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
