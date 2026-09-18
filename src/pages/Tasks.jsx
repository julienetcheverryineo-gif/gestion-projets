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
  const [modeGroupement, setModeGroupement] = useState("chantier");

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

  const groupesParChantier = useMemo(() => {
    const map = new Map();
    // Un groupe par chantier existant, même sans tâche, pour qu'on les retrouve tous
    for (const c of chantiers) {
      map.set(c.id, { cle: c.id, nom: c.nom, taches: [] });
    }
    map.set("aaffecter", { cle: "aaffecter", nom: "À affecter", taches: [] });
    for (const t of toutesLesTaches) {
      const cle = t.chantierId && map.has(t.chantierId) ? t.chantierId : "aaffecter";
      map.get(cle).taches.push(t);
    }
    return [...map.values()].filter((g) => g.cle === "aaffecter" ? g.taches.length > 0 : true);
  }, [toutesLesTaches, chantiers]);

  const groupesParResponsable = useMemo(() => {
    const map = new Map();
    for (const t of toutesLesTaches) {
      const nom = t.assigneA || "À affecter";
      if (!map.has(nom)) map.set(nom, { cle: nom, nom, taches: [] });
      map.get(nom).taches.push(t);
    }
    return [...map.values()].sort((a, b) => b.taches.length - a.taches.length);
  }, [toutesLesTaches]);

  const groupes = modeGroupement === "chantier" ? groupesParChantier : groupesParResponsable;

  const supprimer = async (id) => {
    if (!confirm("Supprimer cette tâche ?")) return;
    await deleteDoc(doc(db, "tasks", id));
  };

  const ajouterTache = async (groupe) => {
    const donnees = {
      titre: "Nouvelle tâche",
      chantierId: null,
      assigneA: null,
      heuresPrevues: null,
      dateDebut: null,
      echeance: null,
      lienDevis: null,
      commentaires: null,
      statut: "a_faire",
      creeLe: serverTimestamp(),
    };
    if (modeGroupement === "chantier") {
      donnees.chantierId = groupe.cle === "aaffecter" ? null : groupe.cle;
    } else {
      donnees.assigneA = groupe.cle === "À affecter" ? null : groupe.cle;
    }
    await addDoc(collection(db, "tasks"), donnees);
    setGroupeOuvert(groupe.cle);
  };

  return (
    <div className="page">
      <header className="page-header page-header-actions">
        <div>
          <h1>Tâches</h1>
          <p className="page-subtitle">
            {modeGroupement === "chantier"
              ? "Toutes les tâches, regroupées par chantier."
              : "Toutes les tâches, regroupées par responsable."}
          </p>
        </div>
        <button className="btn-primary" onClick={() => ajouterTache({ cle: "aaffecter" })}>
          Nouvelle tâche
        </button>
      </header>

      <div className="page-tabs" style={{ marginBottom: 16 }}>
        <button
          className={"page-tab" + (modeGroupement === "chantier" ? " page-tab-active" : "")}
          onClick={() => setModeGroupement("chantier")}
        >
          Par chantier
        </button>
        <button
          className={"page-tab" + (modeGroupement === "responsable" ? " page-tab-active" : "")}
          onClick={() => setModeGroupement("responsable")}
        >
          Par responsable
        </button>
      </div>

      {groupes.length === 0 ? (
        <div className="empty-state">
          <p className="empty-state-title">Aucune tâche</p>
          <p className="empty-state-description">Créez un chantier, puis ajoutez des tâches.</p>
        </div>
      ) : (
        <div className="lot-list">
          {groupes.map((g) => {
            const ouvert = groupeOuvert === g.cle;
            return (
              <div key={g.cle} className="lot-card">
                <div
                  className="lot-card-header"
                  onClick={() => setGroupeOuvert(ouvert ? null : g.cle)}
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
                      ajouterTache(g);
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
                      afficherChantier={modeGroupement === "responsable"}
                      nomChantier={(id) => chantiers.find((c) => c.id === id)?.nom ?? "À affecter"}
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
