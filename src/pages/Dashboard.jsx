import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useCollection } from "../lib/firestoreHooks";
import { calculerAvancementChantier, useSyncStatutEnCours } from "../lib/avancement";
import { normaliserAssignes } from "../lib/assignes";
import { libelleChantier } from "../lib/usePlanningData";
import { estChantierAutomatisme } from "../components/SiteFormModal";
import { useAuth } from "../contexts/AuthContext";
import { creerNotificationUnique, TYPE_TACHE_RETARD } from "../lib/notifications";

export default function Dashboard() {
  const { profile } = useAuth();
  const { documents: tousChantiers, chargement: chargementChantiers } =
    useCollection("sites");
  // Comme la page Chantiers : seuls les chantiers rattachés à l'espace
  // Automatisme & GTB apparaissent sur le tableau de bord.
  const chantiers = tousChantiers.filter(estChantierAutomatisme);
  const { documents: taches, chargement: chargementTaches } =
    useCollection("tasks");
  const { documents: regEquipements } = useCollection("regequipements");
  const { documents: regItems } = useCollection("regitems");
  const { documents: reserves } = useCollection("reserves");

  const [inclureTerminees, setInclureTerminees] = useState(false);

  // Passe automatiquement un chantier "Actif" en "En cours" dès qu'une de
  // ses tâches a démarré (voir lib/avancement.js).
  useSyncStatutEnCours(chantiers, taches);

  const chantierParId = (id) => chantiers.find((c) => c.id === id);
  const nomChantier = (id) => libelleChantier(chantierParId(id));
  const compteChantier = (id) => chantiers.find((c) => c.id === id)?.compte ?? "";

  // --- Tâches d'équipement régulé fusionnées avec les tâches classiques ---
  const tachesRegitems = useMemo(
    () =>
      regItems
        .filter((it) => it.type === "tache")
        .map((it) => {
          const equip = regEquipements.find((r) => r.id === it.regEquipementId);
          return {
            id: it.id,
            titre: it.designation + (equip ? " (" + equip.nom + ")" : ""),
            chantierId: equip?.chantierId ?? null,
            assigneA: it.assigneA || null,
            heuresPrevues: it.heuresPrevues ?? null,
            echeance: null,
            statut: it.statut === "fait" ? "termine" : "a_faire",
          };
        }),
    [regItems, regEquipements]
  );

  const toutesLesTaches = useMemo(
    () => [...taches, ...tachesRegitems],
    [taches, tachesRegitems]
  );

  const stats = useMemo(() => {
    const chantiersActifs = chantiers.filter((c) => c.statut !== "termine").length;
    const tachesEnRetard = toutesLesTaches.filter((t) => estEnRetard(t)).length;
    const tachesEnCours = toutesLesTaches.filter((t) => t.statut === "en_cours").length;
    const pointsRestants = regItems.filter(
      (it) => it.statut !== "teste" && it.statut !== "fait"
    ).length;
    const reservesOuvertes = reserves.filter((r) => r.statut !== "levee").length;
    const reservesEnRetard = reserves.filter((r) => estReserveEnRetard(r)).length;
    const heuresPrevues = toutesLesTaches.reduce(
      (s, t) => s + Number(t.heuresPrevues || 0),
      0
    );
    return {
      chantiersActifs,
      tachesEnRetard,
      tachesEnCours,
      pointsRestants,
      reservesOuvertes,
      reservesEnRetard,
      heuresPrevues,
    };
  }, [chantiers, toutesLesTaches, regItems, reserves]);

  const chargement = chargementChantiers || chargementTaches;

  const avancementChantier = (chantierId) =>
    calculerAvancementChantier(chantierId, { regEquipements, regItems, taches });

  // --- Mes chantiers (dont je suis responsable) ---
  const mesChantiers = useMemo(() => {
    if (!profile?.nom) return [];
    return chantiers.filter(
      (c) => c.responsableChantier === profile.nom || c.ra === profile.nom
    );
  }, [chantiers, profile]);

  // --- Mes tâches (qui me sont assignées) ---
  const mesTachesToutes = useMemo(() => {
    if (!profile?.nom) return [];
    return toutesLesTaches.filter((t) =>
      normaliserAssignes(t.assigneA).includes(profile.nom)
    );
  }, [toutesLesTaches, profile]);

  const mesTaches = useMemo(
    () => mesTachesToutes.filter((t) => inclureTerminees || t.statut !== "termine"),
    [mesTachesToutes, inclureTerminees]
  );

  // Notifie l'utilisateur connecté de ses propres tâches en retard, une
  // seule fois par tâche (id déterministe) : évite de reposter la même
  // alerte à chaque visite du tableau de bord tant que la tâche reste en
  // retard. Pas de serveur dédié ici (pas de Cloud Function planifiée) :
  // la détection se fait au moment où la personne concernée charge cette
  // page — un visiteur occasionnel ne déclenchera donc pas d'alerte avant
  // sa prochaine connexion.
  useEffect(() => {
    if (!profile?.id) return;
    const enRetard = mesTachesToutes.filter((t) => estEnRetard(t));
    enRetard.forEach((t) => {
      creerNotificationUnique("retard-" + t.id + "-" + profile.id, {
        destinataireId: profile.id,
        type: TYPE_TACHE_RETARD,
        titre: "Tâche en retard",
        message: t.titre + (t.chantierId ? " (" + nomChantier(t.chantierId) + ")" : ""),
        lien: t.chantierId ? "/chantiers/" + t.chantierId : "/taches",
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mesTachesToutes, profile?.id]);

  return (
    <div className="page">
      <header className="page-header">
        <h1>Vue d'ensemble</h1>
        <p className="page-subtitle">Chantiers et charge d'équipe, en un coup d'œil.</p>
      </header>

      {chargement ? (
        <div className="page-loading">Chargement des données…</div>
      ) : (
        <>
          <div className="stat-grid">
            <StatCard label="Chantiers actifs" valeur={stats.chantiersActifs} />
            <StatCard label="Tâches en cours" valeur={stats.tachesEnCours} />
            <StatCard
              label="Tâches en retard"
              valeur={stats.tachesEnRetard}
              alerte={stats.tachesEnRetard > 0}
            />
            <StatCard
              label="Réserves ouvertes"
              valeur={stats.reservesOuvertes}
              alerte={stats.reservesOuvertes > 0}
            />
            <StatCard
              label="Réserves en retard"
              valeur={stats.reservesEnRetard}
              alerte={stats.reservesEnRetard > 0}
            />
            <StatCard label="Points restants" valeur={stats.pointsRestants} />
            <StatCard label="Heures prévues" valeur={stats.heuresPrevues} />
          </div>

          {stats.reservesEnRetard > 0 && (
            <section className="panel panel-alert">
              <div className="panel-header">
                <h2>Réserves en retard</h2>
                <Link to="/reserves" className="link">
                  Voir toutes les réserves
                </Link>
              </div>
              <div className="hscroll-auto" style={{ overflowX: "auto" }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Chantier</th>
                      <th>Désignation</th>
                      <th>Responsable</th>
                      <th>Échéance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reserves
                      .filter((r) => estReserveEnRetard(r))
                      .slice(0, 8)
                      .map((r) => (
                        <tr key={r.id}>
                          <td data-label="Chantier">
                            {r.chantierId ? (
                              <Link to={"/chantiers/" + r.chantierId + "?onglet=reserves"}>
                                {nomChantier(r.chantierId)}
                              </Link>
                            ) : (
                              "À affecter"
                            )}
                          </td>
                          <td data-label="Désignation">{r.designation || "—"}</td>
                          <td data-label="Responsable">
                            {r.responsable || <span className="texte-attention">À affecter</span>}
                          </td>
                          <td data-label="Échéance">
                            {r.dateEcheance || <span className="texte-attention">Non planifiée</span>}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {stats.tachesEnRetard > 0 && (
            <section className="panel panel-alert">
              <div className="panel-header">
                <h2>Tâches en retard</h2>
                <Link to="/taches" className="link">
                  Voir toutes les tâches
                </Link>
              </div>
              <div className="hscroll-auto" style={{ overflowX: "auto" }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Chantier</th>
                      <th>Tâche</th>
                      <th>Échéance dépassée</th>
                    </tr>
                  </thead>
                  <tbody>
                    {toutesLesTaches
                      .filter((t) => estEnRetard(t))
                      .slice(0, 8)
                      .map((t) => (
                        <tr key={t.id}>
                          <td data-label="Chantier">
                            {t.chantierId ? (
                              <Link to={"/chantiers/" + t.chantierId}>{nomChantier(t.chantierId)}</Link>
                            ) : (
                              "À affecter"
                            )}
                          </td>
                          <td data-label="Tâche">{t.titre}</td>
                          <td data-label="Échéance dépassée">{t.echeance}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          <section className="panel">
            <div className="panel-header">
              <h2>Mes chantiers</h2>
              <Link to="/chantiers" className="link">
                Voir tous les chantiers
              </Link>
            </div>
            {mesChantiers.length === 0 ? (
              <EmptyState
                titre="Aucun chantier dont vous êtes responsable"
                description="Les chantiers où vous êtes désigné responsable ou RA apparaîtront ici."
                lienTexte="Voir tous les chantiers"
                lienVers="/chantiers"
              />
            ) : (
              <ul className="simple-list">
                {mesChantiers
                  .filter((c) => c.statut !== "termine")
                  .slice(0, 8)
                  .map((c) => {
                    const pct = avancementChantier(c.id);
                    return (
                      <li key={c.id}>
                        <span className={"status-dot status-" + (c.statut ?? "actif")} />
                        <Link to={"/chantiers/" + c.id} className="simple-list-title">
                          {nomChantier(c.id)}
                        </Link>
                        <span className="simple-list-meta">
                          {pct !== null ? "Avancement : " + pct + "%" : "Aucune tâche datée"}
                        </span>
                      </li>
                    );
                  })}
              </ul>
            )}
          </section>

          <section className="panel">
            <div className="panel-header">
              <h2>Mes tâches</h2>
              <Link to="/taches" className="link">
                Voir toutes les tâches
              </Link>
            </div>
            <label className="export-filtre-checkbox" style={{ marginBottom: 12 }}>
              <input
                type="checkbox"
                checked={inclureTerminees}
                onChange={(e) => setInclureTerminees(e.target.checked)}
              />
              Inclure les tâches terminées
            </label>

            {mesTaches.length === 0 ? (
              <EmptyState
                titre="Aucune tâche assignée"
                description="Les tâches qui vous sont assignées apparaîtront ici."
                lienTexte="Voir les tâches"
                lienVers="/taches"
              />
            ) : (
              <div className="hscroll-auto" style={{ overflowX: "auto" }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Chantier</th>
                      <th>Tâche</th>
                      <th>Compte</th>
                      <th>Heures</th>
                      <th>Date fin</th>
                      <th>Statut</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mesTaches.map((t) => (
                      <tr key={t.id}>
                        <td data-label="Chantier" style={{ fontFamily: "var(--font-ui)" }}>
                          {t.chantierId ? (
                            <Link to={"/chantiers/" + t.chantierId}>
                              {nomChantier(t.chantierId)}
                            </Link>
                          ) : (
                            "À affecter"
                          )}
                        </td>
                        <td data-label="Tâche" style={{ fontFamily: "var(--font-ui)" }}>
                          {t.titre}
                        </td>
                        <td data-label="Compte">{compteChantier(t.chantierId) || "—"}</td>
                        <td data-label="Heures">{t.heuresPrevues || "—"}</td>
                        <td data-label="Date fin">{t.echeance || "—"}</td>
                        <td data-label="Statut" style={{ fontFamily: "var(--font-ui)" }}>
                          {formatStatutTache(t.statut)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function estEnRetard(tache) {
  if (!tache.echeance || tache.statut === "termine") return false;
  return new Date(tache.echeance) < new Date(new Date().toDateString());
}

// Une réserve est "en retard" soit parce que son échéance est dépassée,
// soit parce qu'elle n'a encore ni échéance ni responsable (typiquement une
// réserve tout juste signalée par un client depuis l'Espace Client) : dans
// les deux cas, elle a besoin d'une action d'un admin/chef de projet
// (planifier une date, affecter quelqu'un), donc elle mérite de remonter
// ici pour ne pas être oubliée.
function estReserveEnRetard(reserve) {
  if (reserve.statut === "levee") return false;
  if (!reserve.dateEcheance) return true;
  return new Date(reserve.dateEcheance) < new Date(new Date().toDateString());
}

function formatStatutTache(statut) {
  switch (statut) {
    case "en_cours":
      return "En cours";
    case "termine":
      return "Terminé";
    default:
      return "À faire";
  }
}

function StatCard({ label, valeur, alerte }) {
  return (
    <div className={"stat-card" + (alerte ? " stat-card-alerte" : "")}>
      <div className="stat-value">{valeur}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

function EmptyState({ titre, description, lienTexte, lienVers }) {
  return (
    <div className="empty-state">
      <p className="empty-state-title">{titre}</p>
      <p className="empty-state-description">{description}</p>
      <Link to={lienVers} className="btn-primary">
        {lienTexte}
      </Link>
    </div>
  );
}
