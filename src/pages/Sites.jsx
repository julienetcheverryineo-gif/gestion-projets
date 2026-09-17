import { useState } from "react";
import { Link } from "react-router-dom";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../contexts/AuthContext";
import { useCollection } from "../lib/firestoreHooks";
import { exporterMaterielAchats } from "../lib/exportMateriel";
import ImportSuiviModal from "../components/ImportSuiviModal";

const STATUTS = [
  { value: "actif", label: "Actif" },
  { value: "en_pause", label: "En pause" },
  { value: "termine", label: "Terminé" },
];

export default function Sites() {
  const { isAdmin, isChefDeProjet } = useAuth();
  const peutGerer = isAdmin || isChefDeProjet;
  const { documents: chantiers, chargement } = useCollection("sites");
  const { documents: lots } = useCollection("lots");
  const { documents: equipements } = useCollection("equipments");
  const { documents: regEquipements } = useCollection("regequipements");
  const { documents: regItems } = useCollection("regitems");
  const { documents: taches } = useCollection("tasks");
  const { documents: tempsEntries } = useCollection("timeEntries");
  const [chantierEnEdition, setChantierEnEdition] = useState(null);
  const [afficherFormulaire, setAfficherFormulaire] = useState(false);
  const [seulementNonInstalle, setSeulementNonInstalle] = useState(true);
  const [nettoyageEnCours, setNettoyageEnCours] = useState(false);
  const [messageNettoyage, setMessageNettoyage] = useState("");
  const [afficherImportSuivi, setAfficherImportSuivi] = useState(false);

  const supprimer = async (id) => {
    if (
      !confirm(
        "Supprimer ce chantier ? Son matériel, ses équipements, ses tâches et son temps passé seront aussi supprimés définitivement."
      )
    )
      return;

    const regEquipementsDuChantier = regEquipements.filter((r) => r.chantierId === id);
    const regEquipementIds = regEquipementsDuChantier.map((r) => r.id);
    const regItemsDuChantier = regItems.filter((it) =>
      regEquipementIds.includes(it.regEquipementId)
    );

    const lotsDuChantier = lots.filter((l) => l.chantierId === id);
    const lotIds = lotsDuChantier.map((l) => l.id);
    const equipementsDuChantier = equipements.filter((e) => lotIds.includes(e.lotId));

    const tachesDuChantier = taches.filter((t) => t.chantierId === id);
    const tempsDuChantier = tempsEntries.filter((t) => t.chantierId === id);

    await Promise.all([
      ...regItemsDuChantier.map((it) => deleteDoc(doc(db, "regitems", it.id))),
      ...regEquipementsDuChantier.map((r) => deleteDoc(doc(db, "regequipements", r.id))),
      ...equipementsDuChantier.map((e) => deleteDoc(doc(db, "equipments", e.id))),
      ...lotsDuChantier.map((l) => deleteDoc(doc(db, "lots", l.id))),
      ...tachesDuChantier.map((t) => deleteDoc(doc(db, "tasks", t.id))),
      ...tempsDuChantier.map((t) => deleteDoc(doc(db, "timeEntries", t.id))),
    ]);
    await deleteDoc(doc(db, "sites", id));
  };

  const nettoyerDonneesOrphelines = async () => {
    const idsChantiers = new Set(chantiers.map((c) => c.id));

    const regEquipementsOrphelins = regEquipements.filter(
      (r) => !idsChantiers.has(r.chantierId)
    );
    const idsRegEquipementsOrphelins = new Set(regEquipementsOrphelins.map((r) => r.id));
    const regItemsOrphelins = regItems.filter(
      (it) =>
        idsRegEquipementsOrphelins.has(it.regEquipementId) ||
        !regEquipements.some((r) => r.id === it.regEquipementId)
    );

    const lotsOrphelins = lots.filter((l) => !idsChantiers.has(l.chantierId));
    const idsLotsOrphelins = new Set(lotsOrphelins.map((l) => l.id));
    const equipementsOrphelins = equipements.filter(
      (e) => idsLotsOrphelins.has(e.lotId) || !lots.some((l) => l.id === e.lotId)
    );

    const tachesOrphelines = taches.filter((t) => t.chantierId && !idsChantiers.has(t.chantierId));
    const tempsOrphelins = tempsEntries.filter(
      (t) => t.chantierId && !idsChantiers.has(t.chantierId)
    );

    const total =
      regEquipementsOrphelins.length +
      regItemsOrphelins.length +
      lotsOrphelins.length +
      equipementsOrphelins.length +
      tachesOrphelines.length +
      tempsOrphelins.length;

    if (total === 0) {
      setMessageNettoyage("Aucune donnée orpheline trouvée — tout est déjà propre.");
      setTimeout(() => setMessageNettoyage(""), 4000);
      return;
    }

    if (
      !confirm(
        total +
          " élément(s) orphelin(s) trouvé(s) (matériel/tâches/temps liés à des chantiers déjà supprimés). Les supprimer définitivement ?"
      )
    )
      return;

    setNettoyageEnCours(true);
    await Promise.all([
      ...regItemsOrphelins.map((it) => deleteDoc(doc(db, "regitems", it.id))),
      ...regEquipementsOrphelins.map((r) => deleteDoc(doc(db, "regequipements", r.id))),
      ...equipementsOrphelins.map((e) => deleteDoc(doc(db, "equipments", e.id))),
      ...lotsOrphelins.map((l) => deleteDoc(doc(db, "lots", l.id))),
      ...tachesOrphelines.map((t) => deleteDoc(doc(db, "tasks", t.id))),
      ...tempsOrphelins.map((t) => deleteDoc(doc(db, "timeEntries", t.id))),
    ]);
    setNettoyageEnCours(false);
    setMessageNettoyage(total + " élément(s) orphelin(s) supprimé(s).");
    setTimeout(() => setMessageNettoyage(""), 5000);
  };

  const avancement = (chantierId) => {
    const lotsDuChantier = lots.filter((l) => l.chantierId === chantierId);
    if (lotsDuChantier.length === 0) return null;
    const moyenne =
      lotsDuChantier.reduce((sum, l) => sum + (l.avancement ?? 0), 0) /
      lotsDuChantier.length;
    return Math.round(moyenne);
  };

  return (
    <div className="page">
      <header className="page-header page-header-actions">
        <div>
          <h1>Chantiers</h1>
          <p className="page-subtitle">Vos chantiers automatisme &amp; GTB en cours.</p>
        </div>
        <div className="header-actions-stack">
          <div className="header-actions-row">
            {peutGerer && (
              <button className="btn-ghost" onClick={() => setAfficherImportSuivi(true)}>
                Importer le fichier de suivi
              </button>
            )}
            {peutGerer && (
              <button
                className="btn-ghost"
                onClick={nettoyerDonneesOrphelines}
                disabled={nettoyageEnCours}
              >
                {nettoyageEnCours ? "Nettoyage…" : "Nettoyer les données orphelines"}
              </button>
            )}
            {peutGerer && (
              <button
                className="btn-ghost"
                onClick={() =>
                  exporterMaterielAchats({
                    chantiers,
                    regEquipements,
                    regItems,
                    seulementNonInstalle,
                  })
                }
              >
                Exporter le matériel (achats)
              </button>
            )}
            {peutGerer && (
              <button
                className="btn-primary"
                onClick={() => {
                  setChantierEnEdition(null);
                  setAfficherFormulaire(true);
                }}
              >
                Nouveau chantier
              </button>
            )}
          </div>
          {messageNettoyage && (
            <div className="simple-list-meta" style={{ textAlign: "right" }}>
              {messageNettoyage}
            </div>
          )}
          {peutGerer && (
            <label className="export-filtre-checkbox">
              <input
                type="checkbox"
                checked={seulementNonInstalle}
                onChange={(e) => setSeulementNonInstalle(e.target.checked)}
              />
              Uniquement le matériel non installé
            </label>
          )}
        </div>
      </header>

      {chargement ? (
        <div className="page-loading">Chargement…</div>
      ) : chantiers.length === 0 ? (
        <div className="empty-state">
          <p className="empty-state-title">Aucun chantier</p>
          <p className="empty-state-description">
            Créez votre premier chantier pour commencer à suivre les lots techniques.
          </p>
        </div>
      ) : (
        <div className="project-grid">
          {chantiers.map((chantier) => {
            const pct = avancement(chantier.id);
            return (
              <div key={chantier.id} className="project-card">
                <div className="project-card-header">
                  <span className={"status-dot status-" + (chantier.statut ?? "actif")} />
                  <h3>{chantier.nom}</h3>
                </div>
                {chantier.client && (
                  <p className="project-card-description">Client : {chantier.client}</p>
                )}
                <div className="project-card-meta">
                  <span>{formatStatut(chantier.statut)}</span>
                  {pct !== null && <span>Avancement : {pct}%</span>}
                </div>
                {pct !== null && (
                  <div className="progress-bar">
                    <div className="progress-bar-fill" style={{ width: pct + "%" }} />
                  </div>
                )}
                <div className="project-card-actions">
                  <Link to={"/chantiers/" + chantier.id} className="btn-ghost">
                    Ouvrir
                  </Link>
                  {peutGerer && (
                    <button
                      className="btn-ghost btn-danger"
                      onClick={() => supprimer(chantier.id)}
                    >
                      Supprimer
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {afficherImportSuivi && (
        <ImportSuiviModal
          chantiersExistants={chantiers}
          onClose={() => setAfficherImportSuivi(false)}
        />
      )}

      {afficherFormulaire && (
        <SiteFormModal
          chantier={chantierEnEdition}
          onClose={() => setAfficherFormulaire(false)}
        />
      )}
    </div>
  );
}

function SiteFormModal({ chantier, onClose }) {
  const [nom, setNom] = useState(chantier?.nom ?? "");
  const [client, setClient] = useState(chantier?.client ?? "");
  const [adresse, setAdresse] = useState(chantier?.adresse ?? "");
  const [statut, setStatut] = useState(chantier?.statut ?? "actif");
  const [compte, setCompte] = useState(chantier?.compte ?? "");
  const [enCours, setEnCours] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setEnCours(true);
    const donnees = { nom, client, adresse, statut, compte };
    if (chantier) {
      await updateDoc(doc(db, "sites", chantier.id), donnees);
    } else {
      await addDoc(collection(db, "sites"), { ...donnees, creeLe: serverTimestamp() });
    }
    setEnCours(false);
    onClose();
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{chantier ? "Modifier le chantier" : "Nouveau chantier"}</h2>
        <form onSubmit={handleSubmit} className="form">
          <label>
            Nom du chantier
            <input value={nom} onChange={(e) => setNom(e.target.value)} required />
          </label>
          <label>
            Client
            <input value={client} onChange={(e) => setClient(e.target.value)} />
          </label>
          <label>
            Adresse
            <input value={adresse} onChange={(e) => setAdresse(e.target.value)} />
          </label>
          <div className="form-inline">
            <label>
              Statut
              <select value={statut} onChange={(e) => setStatut(e.target.value)}>
                {STATUTS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Compte
              <input
                value={compte}
                onChange={(e) => setCompte(e.target.value)}
                placeholder="ex : JE602"
              />
            </label>
          </div>
          <div className="modal-actions">
            <button type="button" className="btn-ghost" onClick={onClose}>
              Annuler
            </button>
            <button type="submit" className="btn-primary" disabled={enCours}>
              {enCours ? "Enregistrement…" : "Enregistrer"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function formatStatut(statut) {
  return STATUTS.find((s) => s.value === statut)?.label ?? statut;
}
