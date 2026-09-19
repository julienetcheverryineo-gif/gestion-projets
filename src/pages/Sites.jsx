import { useState } from "react";
import { Link } from "react-router-dom";
import { deleteDoc, doc } from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../contexts/AuthContext";
import { useCollection } from "../lib/firestoreHooks";
import { exporterMaterielAchats } from "../lib/exportMateriel";
import ImportSuiviModal from "../components/ImportSuiviModal";
import SiteFormModal, { formatStatutChantier } from "../components/SiteFormModal";

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
  const { documents: utilisateurs } = useCollection("users", "email");
  const { documents: reserves } = useCollection("reserves");
  const [chantierEnEdition, setChantierEnEdition] = useState(null);
  const [afficherFormulaire, setAfficherFormulaire] = useState(false);
  const [seulementNonInstalle, setSeulementNonInstalle] = useState(true);
  const [nettoyageEnCours, setNettoyageEnCours] = useState(false);
  const [messageNettoyage, setMessageNettoyage] = useState("");
  const [afficherImportSuivi, setAfficherImportSuivi] = useState(false);
  const [recherche, setRecherche] = useState("");
  const [filtreStatut, setFiltreStatut] = useState("actifs");
  const [tri, setTri] = useState({ colonne: "nom", sens: 1 });

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
    const regsDuChantier = regEquipements.filter((r) => r.chantierId === chantierId);
    const items = regItems.filter((it) =>
      regsDuChantier.some((r) => r.id === it.regEquipementId)
    );
    if (items.length === 0) return null;
    const faits = items.filter((it) => it.statut === "teste" || it.statut === "fait").length;
    return Math.round((faits / items.length) * 100);
  };

  const reservesOuvertes = (chantierId) =>
    reserves.filter((r) => r.chantierId === chantierId && r.statut !== "levee").length;

  const basculerTri = (colonne) => {
    setTri((t) =>
      t.colonne === colonne ? { colonne, sens: -t.sens } : { colonne, sens: 1 }
    );
  };

  const chantiersAffiches = chantiers
    .filter((c) => {
      if (filtreStatut === "tous") return true;
      if (filtreStatut === "termines") return c.statut === "termine";
      return c.statut !== "termine"; // "actifs" par défaut
    })
    .filter((c) => {
      const q = recherche.trim().toLowerCase();
      if (!q) return true;
      return (
        c.nom.toLowerCase().includes(q) || (c.client ?? "").toLowerCase().includes(q)
      );
    })
    .sort((a, b) => {
      const { colonne, sens } = tri;
      let va, vb;
      if (colonne === "avancement") {
        va = avancement(a.id) ?? -1;
        vb = avancement(b.id) ?? -1;
      } else if (colonne === "reserves") {
        va = reservesOuvertes(a.id);
        vb = reservesOuvertes(b.id);
      } else if (colonne === "client") {
        va = (a.client ?? "").toLowerCase();
        vb = (b.client ?? "").toLowerCase();
      } else {
        va = a.nom.toLowerCase();
        vb = b.nom.toLowerCase();
      }
      if (va < vb) return -1 * sens;
      if (va > vb) return 1 * sens;
      return 0;
    });

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

      <div className="chantiers-filtres">
        <input
          className="chantiers-recherche"
          placeholder="Rechercher un chantier ou un client…"
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
        />
        <select value={filtreStatut} onChange={(e) => setFiltreStatut(e.target.value)}>
          <option value="actifs">Actifs (masquer terminés)</option>
          <option value="tous">Tous statuts</option>
          <option value="termines">Terminés seulement</option>
        </select>
      </div>

      {chargement ? (
        <div className="page-loading">Chargement…</div>
      ) : chantiersAffiches.length === 0 ? (
        <div className="empty-state">
          <p className="empty-state-title">
            {chantiers.length === 0 ? "Aucun chantier" : "Aucun résultat"}
          </p>
          <p className="empty-state-description">
            {chantiers.length === 0
              ? "Créez votre premier chantier pour commencer à suivre les lots techniques."
              : "Essayez une autre recherche ou changez le filtre de statut."}
          </p>
        </div>
      ) : (
        <div className="data-table-wrapper">
          <table className="data-table chantiers-table">
            <thead>
              <tr>
                <th className="th-tri" onClick={() => basculerTri("nom")}>
                  Chantier{tri.colonne === "nom" ? (tri.sens > 0 ? " ▾" : " ▴") : ""}
                </th>
                <th className="th-tri" onClick={() => basculerTri("client")}>
                  Client{tri.colonne === "client" ? (tri.sens > 0 ? " ▾" : " ▴") : ""}
                </th>
                <th>Statut</th>
                <th className="th-tri" onClick={() => basculerTri("avancement")}>
                  Avancement{tri.colonne === "avancement" ? (tri.sens > 0 ? " ▾" : " ▴") : ""}
                </th>
                <th className="th-tri" onClick={() => basculerTri("reserves")}>
                  Réserves{tri.colonne === "reserves" ? (tri.sens > 0 ? " ▾" : " ▴") : ""}
                </th>
                <th>Responsable</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {chantiersAffiches.map((chantier) => {
                const pct = avancement(chantier.id);
                const nbReserves = reservesOuvertes(chantier.id);
                return (
                  <tr key={chantier.id}>
                    <td
                      data-label="Chantier"
                      style={{ fontFamily: "var(--font-ui)", fontWeight: 500 }}
                    >
                      <span
                        className={"status-dot status-" + (chantier.statut ?? "actif")}
                        style={{ marginRight: 8 }}
                      />
                      {chantier.nom}
                    </td>
                    <td
                      data-label="Client"
                      style={{ fontFamily: "var(--font-ui)", color: "var(--text-muted)" }}
                    >
                      {chantier.client || "—"}
                    </td>
                    <td data-label="Statut" style={{ fontFamily: "var(--font-ui)" }}>
                      {formatStatutChantier(chantier.statut)}
                    </td>
                    <td data-label="Avancement">
                      {pct !== null ? (
                        <div className="chantiers-avancement-cell">
                          <div className="progress-bar chantiers-avancement-bar">
                            <div className="progress-bar-fill" style={{ width: pct + "%" }} />
                          </div>
                          <span className="simple-list-meta">{pct}%</span>
                        </div>
                      ) : (
                        <span className="simple-list-meta">—</span>
                      )}
                    </td>
                    <td data-label="Réserves">
                      {nbReserves > 0 ? (
                        <span className="chantiers-reserves-alerte">{nbReserves} ouverte(s)</span>
                      ) : (
                        <span className="simple-list-meta">—</span>
                      )}
                    </td>
                    <td
                      data-label="Responsable"
                      style={{ fontFamily: "var(--font-ui)", color: "var(--text-muted)" }}
                    >
                      {chantier.responsableChantier || "—"}
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
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
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {afficherImportSuivi && (
        <ImportSuiviModal
          chantiersExistants={chantiers}
          utilisateurs={utilisateurs}
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
