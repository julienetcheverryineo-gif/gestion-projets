import { useMemo, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useCollectionParChantiers, useCollectionParIds } from "../lib/firestoreHooks";
import { libelleChantier } from "../lib/usePlanningData";
import ReserveClientFormModal from "../components/ReserveClientFormModal";
import logoIneo from "../assets/logo-ineo.png";

function formatDateFr(v) {
  if (!v) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
  return m ? m[3] + "/" + m[2] + "/" + m[1] : v;
}

export default function EspaceClient() {
  const { profile, logout } = useAuth();
  const chantierIds = useMemo(() => profile?.chantierIds || [], [profile]);

  const { documents: chantiers, chargement: chargementChantiers } =
    useCollectionParIds("sites", chantierIds);
  const { documents: reserves, chargement: chargementReserves } =
    useCollectionParChantiers("reserves", chantierIds);

  const chantiersTries = useMemo(
    () => [...chantiers].sort((a, b) => libelleChantier(a).localeCompare(libelleChantier(b))),
    [chantiers]
  );

  // Onglet explicitement choisi par le client ; tant qu'il n'a pas cliqué
  // (ou si son choix précédent ne correspond plus à un chantier chargé), on
  // retombe simplement sur le premier chantier — dérivé au rendu, pas
  // besoin d'un effect pour "rattraper" la sélection.
  const [chantierActifIdChoisi, setChantierActifIdChoisi] = useState(null);
  const [afficherForm, setAfficherForm] = useState(false);
  const [filtre, setFiltre] = useState("ouvertes");

  const chantierActifId = chantiersTries.some((c) => c.id === chantierActifIdChoisi)
    ? chantierActifIdChoisi
    : (chantiersTries[0]?.id ?? null);

  const chantierActif = chantiersTries.find((c) => c.id === chantierActifId) || null;

  const reservesDuChantier = useMemo(() => {
    return reserves
      .filter((r) => r.chantierId === chantierActif?.id)
      .sort((a, b) => (b.dateSignalement || "").localeCompare(a.dateSignalement || ""));
  }, [reserves, chantierActif]);

  const ouvertes = reservesDuChantier.filter((r) => r.statut !== "levee");
  const levees = reservesDuChantier.filter((r) => r.statut === "levee");
  const affichees = filtre === "ouvertes" ? ouvertes : filtre === "levees" ? levees : reservesDuChantier;

  const chargement = chargementChantiers || chargementReserves;

  const handleLogout = async () => {
    await logout();
  };

  return (
    <div className="espace-client-shell">
      <header className="espace-client-header">
        <div className="espace-client-brand">
          <div className="logo-chip">
            <img src={logoIneo} alt="INEO — une marque d'EQUANS" />
          </div>
          <div>
            <div className="brand-title">Espace client</div>
            <div className="brand-subtitle">Bonjour {profile?.nom}</div>
          </div>
        </div>
        <button className="btn-ghost" onClick={handleLogout}>
          Se déconnecter
        </button>
      </header>

      <main className="espace-client-body">
        {chargement ? (
          <div className="page-loading">Chargement…</div>
        ) : chantiersTries.length === 0 ? (
          <div className="empty-state">
            <p className="empty-state-title">Aucun chantier associé à votre compte</p>
            <p className="empty-state-description">
              Contactez votre interlocuteur INEO pour qu'il vous donne accès à vos chantiers.
            </p>
          </div>
        ) : (
          <>
            {chantiersTries.length > 1 && (
              <div className="espace-client-tabs">
                {chantiersTries.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className={
                      "espace-client-tab" + (c.id === chantierActifId ? " espace-client-tab-active" : "")
                    }
                    onClick={() => setChantierActifIdChoisi(c.id)}
                  >
                    {libelleChantier(c)}
                  </button>
                ))}
              </div>
            )}

            <div className="espace-client-chantier-titre">{libelleChantier(chantierActif)}</div>

            <div className="espace-client-stats">
              <div className="espace-client-stat">
                <div className="espace-client-stat-valeur">{ouvertes.length}</div>
                <div className="espace-client-stat-label">Réserve(s) ouverte(s)</div>
              </div>
              <div className="espace-client-stat">
                <div className="espace-client-stat-valeur">{levees.length}</div>
                <div className="espace-client-stat-label">Réserve(s) levée(s)</div>
              </div>
            </div>

            <button
              type="button"
              className="btn-primary espace-client-bouton-signaler"
              onClick={() => setAfficherForm(true)}
            >
              + Signaler une réserve
            </button>

            <div className="chantier-actions-bar" style={{ marginTop: 20 }}>
              <button
                className={filtre === "ouvertes" ? "btn-primary" : "btn-accent"}
                onClick={() => setFiltre("ouvertes")}
              >
                Ouvertes ({ouvertes.length})
              </button>
              <button
                className={filtre === "levees" ? "btn-primary" : "btn-accent"}
                onClick={() => setFiltre("levees")}
              >
                Levées ({levees.length})
              </button>
              <button
                className={filtre === "toutes" ? "btn-primary" : "btn-accent"}
                onClick={() => setFiltre("toutes")}
              >
                Toutes
              </button>
            </div>

            {affichees.length === 0 ? (
              <div className="empty-state" style={{ marginTop: 14 }}>
                <p className="empty-state-title">Rien à afficher ici</p>
                <p className="empty-state-description">
                  {filtre === "ouvertes"
                    ? "Aucune réserve ouverte pour ce chantier."
                    : "Aucune réserve pour ce filtre."}
                </p>
              </div>
            ) : (
              <div className="espace-client-liste">
                {affichees.map((r) => (
                  <article key={r.id} className="espace-client-carte">
                    <div className="espace-client-carte-entete">
                      <span
                        className={
                          "espace-client-badge " +
                          (r.statut === "levee" ? "espace-client-badge-levee" : "espace-client-badge-ouverte")
                        }
                      >
                        {r.statut === "levee" ? "Levée" : "Ouverte"}
                      </span>
                      <span className="simple-list-meta">
                        Signalée le {formatDateFr(r.dateSignalement) || "—"}
                      </span>
                    </div>
                    <div className="espace-client-carte-titre">{r.designation}</div>
                    {r.remarque && <div className="espace-client-carte-remarque">{r.remarque}</div>}
                  </article>
                ))}
              </div>
            )}
          </>
        )}
      </main>

      {afficherForm && chantierActif && (
        <ReserveClientFormModal
          chantierId={chantierActif.id}
          nomSignalant={profile?.nom}
          onClose={() => setAfficherForm(false)}
        />
      )}
    </div>
  );
}
