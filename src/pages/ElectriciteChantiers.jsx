import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { doc, query, collection, where, getDocs, writeBatch } from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../contexts/AuthContext";
import { useCollection } from "../lib/firestoreHooks";
import { useTauxHoraires } from "../lib/tauxHoraires";
import { calculerIndicateursChantier } from "./ElectriciteSiteDetail";
import SiteFormModal, {
  formatStatutChantier,
  estChantierElectricite,
} from "../components/SiteFormModal";

const euroInd = (n) =>
  Number(n || 0)
    .toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    .replace(/[\u202f\u00a0]/g, " ");

// Colonnes d'indicateurs, recalculés à chaque affichage de la liste à partir
// des données du chantier (devis, suivi, situations, imports SAP).
function CelluleIcone({ label, info, vide }) {
  return (
    <td data-label={label} style={{ textAlign: "center" }}>
      {info ? (
        <span className={"ind-icone ind-" + info.etat} title={info.texte} aria-label={info.texte}>
          {info.etat === "retard" ? "↘" : info.etat === "avance" ? "↗" : "✓"}
        </span>
      ) : (
        <span className="ind-vide" title={vide}>
          —
        </span>
      )}
    </td>
  );
}

function CellulesIndicateurs({ ind }) {
  if (!ind) {
    const vide = "Pas de devis importé : rien à calculer";
    return [1, 2, 3, 4, 5].map((k) => (
      <td key={k} className="ind-vide" title={vide}>
        —
      </td>
    ));
  }
  const f = ind.factVsReel;
  const e = ind.etat || {};
  const puces = [];
  if (e.coherence) {
    puces.push(
      e.coherence.ok
        ? { t: "Cohérente", c: "ok", titre: "Facturé SAP = situations saisies" }
        : {
            t: "Écart SAP",
            c: "alerte",
            titre:
              e.coherence.ecart > 0
                ? "SAP a facturé " + euroInd(e.coherence.ecart) + " € de plus que les situations"
                : "Situations en avance de " + euroInd(-e.coherence.ecart) + " € sur SAP",
          }
    );
  }
  if (e.paiement === "retard") puces.push({ t: "Paiement en retard", c: "danger", titre: e.nbRetard + " facture(s) échue(s) non réglée(s)" });
  else if (e.paiement === "attente") puces.push({ t: "Paiement en attente", c: "alerte", titre: e.nbAttente + " facture(s) à régler" });
  else if (e.paiement === "ok") puces.push({ t: "Réglé", c: "ok", titre: "Toutes les factures SAP sont réglées" });
  return (
    <>
      <CelluleIcone label="Fact. vs dépense réelle" info={f} vide="Pas de budget chiffré ou de marché" />
      <CelluleIcone label="Fact. vs avancement" info={ind.factVsAvancement} vide="Pas de situation saisie" />
      <td data-label="État de facturation">
        {puces.length === 0 ? (
          <span className="ind-vide">—</span>
        ) : (
          <div className="ind-puces">
            {puces.map((p) => (
              <span key={p.t} className={"ind-puce ind-" + p.c} title={p.titre}>
                {p.t}
              </span>
            ))}
          </div>
        )}
      </td>
      <td data-label="Heures SAP non aff." className="col-num">
        {ind.heuresNonAffectees > 0 ? (
          <span className="ind-violet" title="Heures SAP à affecter à une tâche">
            {euroInd(ind.heuresNonAffectees)} h
          </span>
        ) : (
          <span className="ind-vide">—</span>
        )}
      </td>
      <td data-label="Fourn. non aff." className="col-num">
        {ind.fournituresNonAffectees > 0.005 ? (
          <span className="ind-violet" title="Achats SAP en affectation automatique, non rattachés à un devis">
            {euroInd(ind.fournituresNonAffectees)} €
          </span>
        ) : (
          <span className="ind-vide">—</span>
        )}
      </td>
    </>
  );
}

// Liste des chantiers du service Électricité — même principe que la page
// Chantiers de l'Automatisme, mais son propre périmètre : seuls les
// chantiers rattachés à l'espace Électricité (case à cocher du formulaire)
// apparaissent ici.
export default function ElectriciteChantiers() {
  const { isAdmin, profile } = useAuth();
  const peutGerer = isAdmin || profile?.role === "ra_electricite";
  const { documents: tousChantiers, chargement } = useCollection("sites");
  const { documents: tousDevis } = useCollection("elecDevis");
  const { documents: toutesLignes } = useCollection("elecLignes");
  const { documents: tousGroupes } = useCollection("elecGroupes");
  const { documents: sapLignesFo } = useCollection("sapLignesFo");
  const { documents: sapLignesMo } = useCollection("sapLignesMo");
  const { taux: tauxHoraire } = useTauxHoraires();
  const { documents: utilisateurs } = useCollection("users", "email");
  const [tous, setTous] = useState(false);
  const chantiersElec = tousChantiers.filter(estChantierElectricite);
  // Par défaut : seulement les chantiers dont l'utilisateur est le RA.
  const chantiers = (tous ? chantiersElec : chantiersElec.filter((c) => (c.ra || "") === (profile?.nom || ""))).slice().sort((a, b) => {
    // Tri par numéro de compte (ordre naturel) ; sans compte en fin de liste.
    const ca = String(a.compte || "").trim();
    const cb = String(b.compte || "").trim();
    if (!ca !== !cb) return ca ? -1 : 1;
    return ca.localeCompare(cb, "fr", { numeric: true, sensitivity: "base" }) || String(a.nom || "").localeCompare(String(b.nom || ""), "fr");
  });
  const indicateurs = useMemo(() => {
    const out = {};
    chantiers.forEach((c) => {
      try {
        out[c.id] = calculerIndicateursChantier(c, { tousDevis, toutesLignes, tousGroupes, sapLignesFo, sapLignesMo, tauxHoraire });
      } catch (err) {
        console.error("Indicateurs " + c.nom, err);
        out[c.id] = null;
      }
    });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tousChantiers, tous, profile?.nom, tousDevis, toutesLignes, tousGroupes, sapLignesFo, sapLignesMo, tauxHoraire]);
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
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <label className="switch-filtre" title="Basculer entre mes chantiers et tous les chantiers">
          <span className={!tous ? "actif" : ""}>Mes chantiers</span>
          <input type="checkbox" checked={tous} onChange={(e) => setTous(e.target.checked)} />
          <i aria-hidden="true" />
          <span className={tous ? "actif" : ""}>Tous</span>
        </label>
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
      </header>

      {chargement ? (
        <div className="page-loading">Chargement…</div>
      ) : chantiers.length === 0 ? (
        <div className="empty-state">
          <p className="empty-state-title">{chantiersElec.length > 0 && !tous ? "Aucun chantier dont vous êtes RA" : "Aucun chantier"}</p>
          <p className="empty-state-description">
            {chantiersElec.length > 0 && !tous
              ? "Passez en « Tous » pour voir l'ensemble des chantiers."
              : "Créez votre premier chantier électricité pour commencer à importer des devis."}
          </p>
        </div>
      ) : (
        <div className="data-table-wrapper">
          <table className="data-table chantiers-table">
            <thead>
              <tr>
                <th>N° compte</th>
                <th>Client</th>
                <th>Chantier</th>
                <th>Statut</th>
                <th>Devis importés</th>
                <th title="Facturation face à l'avancement réel et aux dépenses SAP">Fact. vs dépense réelle</th>
                <th title="Facturation face à l'avancement suivi (situations)">Fact. vs avancement</th>
                <th>État de facturation</th>
                <th title="Heures SAP pas encore affectées à une tâche">Heures SAP non aff.</th>
                <th title="Achats SAP pas encore affectés à un devis (chantiers à plusieurs devis)">Fourn. non aff.</th>
                <th>Responsable d'affaire</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {chantiers.map((chantier) => (
                <tr key={chantier.id}>
                  <td data-label="N° compte" style={{ fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                    {chantier.compte || "—"}
                  </td>
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
                    <Link to={"/electricite/chantiers/" + chantier.id} className="lien-chantier">
                      {chantier.nom}
                    </Link>
                  </td>
                  <td data-label="Statut" style={{ fontFamily: "var(--font-ui)" }}>
                    {formatStatutChantier(chantier.statut)}
                  </td>
                  <td data-label="Devis importés">
                    {nbDevis(chantier.id) > 0 ? nbDevis(chantier.id) : "—"}
                  </td>
                  <CellulesIndicateurs ind={indicateurs[chantier.id]} />
                  <td
                    data-label="Responsable d'affaire"
                    style={{ fontFamily: "var(--font-ui)", color: "var(--text-muted)" }}
                  >
                    {chantier.ra || "—"}
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
