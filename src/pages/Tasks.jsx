import { useMemo, useState } from "react";
import { addDoc, collection, deleteDoc, doc, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../contexts/AuthContext";
import { useCollection } from "../lib/firestoreHooks";
import { normaliserAssignes } from "../lib/assignes";
import { equipeChantier, electriciensChantier } from "../lib/equipe";
import { exporterTachesExcel } from "../lib/tachesExcel";
import TaskTable from "../components/TaskTable";
import ImportDatesTachesModal from "../components/ImportDatesTachesModal";

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
  const [afficherImportDates, setAfficherImportDates] = useState(false);

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
            equipementSource: equip?.nom ?? null,
            assigneA: it.assigneA || null,
            heuresPrevues: it.heuresPrevues ?? null,
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
      const noms = normaliserAssignes(t.assigneA);
      const cles = noms.length > 0 ? noms : ["À affecter"];
      for (const nom of cles) {
        if (!map.has(nom)) map.set(nom, { cle: nom, nom, taches: [] });
        map.get(nom).taches.push(t);
      }
    }
    return [...map.values()].sort((a, b) => b.taches.length - a.taches.length);
  }, [toutesLesTaches]);

  const groupesParEquipement = useMemo(() => {
    const map = new Map();
    for (const t of toutesLesTaches) {
      const cle = t.equipementSource || "sans-equipement";
      if (!map.has(cle)) {
        map.set(cle, { cle, nom: t.equipementSource || "Sans équipement", taches: [] });
      }
      map.get(cle).taches.push(t);
    }
    return [...map.values()].sort((a, b) => b.taches.length - a.taches.length);
  }, [toutesLesTaches]);

  const tousElectriciens = useMemo(
    () => [...new Set(chantiers.flatMap((c) => electriciensChantier(c)))],
    [chantiers]
  );
  const tousUtilisateursEquipe = useMemo(
    () => utilisateurs.filter((u) => chantiers.some((c) => equipeChantier(c).includes(u.nom))),
    [utilisateurs, chantiers]
  );

  // En mode "par chantier", chaque groupe correspond à un seul chantier :
  // on peut alors restreindre précisément à son équipe. Dans les autres
  // modes (responsable/équipement), les tâches d'un même groupe peuvent
  // venir de plusieurs chantiers : on propose l'union de toutes les
  // équipes plutôt que de choisir arbitrairement un chantier.
  const utilisateursPourGroupe = (g) => {
    if (modeGroupement !== "chantier" || g.cle === "aaffecter") return tousUtilisateursEquipe;
    const chantier = chantiers.find((c) => c.id === g.cle);
    return utilisateurs.filter((u) => equipeChantier(chantier).includes(u.nom));
  };
  const electriciensPourGroupe = (g) => {
    if (modeGroupement !== "chantier" || g.cle === "aaffecter") return tousElectriciens;
    const chantier = chantiers.find((c) => c.id === g.cle);
    return electriciensChantier(chantier);
  };

  const groupes =
    modeGroupement === "chantier"
      ? groupesParChantier
      : modeGroupement === "responsable"
      ? groupesParResponsable
      : groupesParEquipement;

  const supprimer = async (id) => {
    if (!confirm("Supprimer cette tâche ?")) return;
    await deleteDoc(doc(db, "tasks", id));
  };

  const ajouterTache = async (groupe) => {
    const donnees = {
      titre: "Nouvelle tâche",
      chantierId: null,
      equipementSource: null,
      assigneA: [],
      heuresPrevues: null,
      dateDebut: null,
      echeance: null,
      lienDevis: null,
      commentaires: null,
      statut: "a_faire",
      ordre: Date.now(),
      creeLe: serverTimestamp(),
    };
    if (modeGroupement === "chantier") {
      donnees.chantierId = groupe.cle === "aaffecter" ? null : groupe.cle;
    } else if (modeGroupement === "responsable") {
      donnees.assigneA = groupe.cle === "À affecter" ? [] : [groupe.cle];
    } else {
      donnees.equipementSource = groupe.cle === "sans-equipement" ? null : groupe.cle;
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
            {modeGroupement === "chantier" && "Toutes les tâches, regroupées par chantier."}
            {modeGroupement === "responsable" && "Toutes les tâches, regroupées par responsable."}
            {modeGroupement === "equipement" && "Toutes les tâches, regroupées par équipement."}
          </p>
        </div>
        <div className="header-actions-stack" style={{ display: "flex", gap: 8 }}>
          <button
            className="btn-accent"
            onClick={() => exporterTachesExcel(toutesLesTaches, chantiers)}
            title="Télécharger un classeur avec toutes les tâches, pour compléter Début/Fin en masse dans Excel"
          >
            Exporter en Excel
          </button>
          <button className="btn-accent" onClick={() => setAfficherImportDates(true)}>
            Importer depuis Excel
          </button>
          <button className="btn-primary" onClick={() => ajouterTache({ cle: "aaffecter" })}>
            Nouvelle tâche
          </button>
        </div>
      </header>

      <div className="chantier-actions-bar">
        <button
          className={modeGroupement === "chantier" ? "btn-primary" : "btn-accent"}
          onClick={() => setModeGroupement("chantier")}
        >
          Par chantier
        </button>
        <button
          className={modeGroupement === "responsable" ? "btn-primary" : "btn-accent"}
          onClick={() => setModeGroupement("responsable")}
        >
          Par responsable
        </button>
        <button
          className={modeGroupement === "equipement" ? "btn-primary" : "btn-accent"}
          onClick={() => setModeGroupement("equipement")}
        >
          Par équipement
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
                      utilisateurs={utilisateursPourGroupe(g)}
                      electriciens={electriciensPourGroupe(g)}
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

      {afficherImportDates && (
        <ImportDatesTachesModal
          taches={toutesLesTaches}
          onClose={() => setAfficherImportDates(false)}
        />
      )}
    </div>
  );
}
