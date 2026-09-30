import { useState } from "react";
import { Link } from "react-router-dom";
import { doc, query, collection, where, getDocs, writeBatch } from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../contexts/AuthContext";
import { useCollection } from "../lib/firestoreHooks";
import SiteFormModal, {
  formatStatutChantier,
  estChantierElectricite,
} from "../components/SiteFormModal";

// Liste des chantiers du service Électricité — même principe que la page
// Chantiers de l'Automatisme, mais son propre périmètre : seuls les
// chantiers rattachés à l'espace Électricité (case à cocher du formulaire)
// apparaissent ici.
export default function ElectriciteChantiers() {
  const { isAdmin, profile } = useAuth();
  const peutGerer = isAdmin || profile?.role === "ra_electricite";
  const { documents: tousChantiers, chargement } = useCollection("sites");
  const { documents: tousDevis } = useCollection("elecDevis");
  const { documents: utilisateurs } = useCollection("users", "email");
  const chantiers = tousChantiers.filter(estChantierElectricite);
  const [chantierEnEdition, setChantierEnEdition] = useState(null);
  const [afficherFormulaire, setAfficherFormulaire] = useState(false);
  const [suppressionEnCours, setSuppressionEnCours] = useState(null);

  const nbDevis = (chantierId) => tousDevis.filter((d) => d.chantierId === chantierId).length;

  const supprimer = async (id) => {
    if (
      !confirm(
        "Supprimer ce chantier ? Ses devis importés et leurs lignes seront aussi supprimés définitivement."
      )
    )
      return;
    setSuppressionEnCours(id);
    const devisDuChantier = tousDevis.filter((d) => d.chantierId === id);
    const lignesSnap = await getDocs(
      query(collection(db, "elecLignes"), where("chantierId", "==", id))
    );
    const batch = writeBatch(db);
    lignesSnap.docs.forEach((d) => batch.delete(d.ref));
    devisDuChantier.forEach((d) => batch.delete(doc(db, "elecDevis", d.id)));
    batch.delete(doc(db, "sites", id));
    await batch.commit();
    setSuppressionEnCours(null);
  };

  return (
    <div className="page">
      <header className="page-header page-header-actions">
        <div>
          <h1>Chantiers — Électricité</h1>
          <p className="page-subtitle">Vos chantiers électricité en cours.</p>
        </div>
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
      </header>

      {chargement ? (
        <div className="page-loading">Chargement…</div>
      ) : chantiers.length === 0 ? (
        <div className="empty-state">
          <p className="empty-state-title">Aucun chantier</p>
          <p className="empty-state-description">
            Créez votre premier chantier électricité pour commencer à importer des devis.
          </p>
        </div>
      ) : (
        <div className="data-table-wrapper">
          <table className="data-table chantiers-table">
            <thead>
              <tr>
                <th>Client</th>
                <th>Chantier</th>
                <th>Statut</th>
                <th>Devis importés</th>
                <th>Responsable</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {chantiers.map((chantier) => (
                <tr key={chantier.id}>
                  <td
                    data-label="Client"
                    style={{ fontFamily: "var(--font-ui)", color: "var(--text-muted)" }}
                  >
                    {chantier.client || "—"}
                  </td>
                  <td data-label="Chantier" style={{ fontFamily: "var(--font-ui)", fontWeight: 500 }}>
                    <span
                      className={"status-dot status-" + (chantier.statut ?? "actif")}
                      style={{ marginRight: 8 }}
                    />
                    {chantier.nom}
                  </td>
                  <td data-label="Statut" style={{ fontFamily: "var(--font-ui)" }}>
                    {formatStatutChantier(chantier.statut)}
                  </td>
                  <td data-label="Devis importés">
                    {nbDevis(chantier.id) > 0 ? nbDevis(chantier.id) : "—"}
                  </td>
                  <td
                    data-label="Responsable"
                    style={{ fontFamily: "var(--font-ui)", color: "var(--text-muted)" }}
                  >
                    {chantier.responsableChantier || "—"}
                  </td>
                  <td>
                    <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                      <Link to={"/electricite/chantiers/" + chantier.id} className="btn-ghost">
                        Ouvrir
                      </Link>
                      {peutGerer && (
                        <button
                          className="btn-ghost btn-danger"
                          onClick={() => supprimer(chantier.id)}
                          disabled={suppressionEnCours === chantier.id}
                        >
                          {suppressionEnCours === chantier.id ? "Suppression…" : "Supprimer"}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {afficherFormulaire && (
        <SiteFormModal
          chantier={chantierEnEdition}
          utilisateurs={utilisateurs}
          service="electricite"
          onClose={() => setAfficherFormulaire(false)}
        />
      )}
    </div>
  );
}
