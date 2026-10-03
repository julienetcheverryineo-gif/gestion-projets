import { useMemo } from "react";
import { useCollection } from "../lib/firestoreHooks";

const JOUR_MS = 24 * 60 * 60 * 1000;

function versDate(horodatage) {
  return horodatage?.toDate ? horodatage.toDate() : null;
}

function formatDate(date) {
  return date ? date.toLocaleDateString("fr-FR") : "—";
}

function formatHeure(date) {
  return date
    ? date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
    : "—";
}

function maintenantMs() {
  return Date.now();
}

function formatRole(role) {
  switch (role) {
    case "admin":
      return "Administrateur";
    case "chef_de_projet":
      return "Chef de projet";
    case "automaticien":
      return "Automaticien";
    case "electricien":
      return "Électricien";
    case "ra_electricite":
      return "RA Électricité";
    default:
      return role ?? "—";
  }
}

export default function Statistiques() {
  const { documents: connexions, chargement: chargementConnexions } =
    useCollection("connexions", "horodatage");
  const { documents: utilisateurs, chargement: chargementUtilisateurs } =
    useCollection("users", "email");

  const chargement = chargementConnexions || chargementUtilisateurs;

  const utilisateurParId = (id) => utilisateurs.find((u) => u.id === id);
  const nomUtilisateur = (id) => {
    const u = utilisateurParId(id);
    if (u) return u.nom;
    const connexion = connexions.find((c) => c.userId === id);
    return connexion?.email ? connexion.email + " (supprimé)" : "Utilisateur inconnu";
  };

  const connexionsAvecDate = useMemo(
    () =>
      connexions
        .map((c) => ({ ...c, date: versDate(c.horodatage) }))
        .filter((c) => c.date),
    [connexions]
  );

  const stats = useMemo(() => {
    const maintenant = maintenantMs();
    const total = connexionsAvecDate.length;
    const sur7Jours = connexionsAvecDate.filter(
      (c) => maintenant - c.date.getTime() < 7 * JOUR_MS
    );
    const sur30Jours = connexionsAvecDate.filter(
      (c) => maintenant - c.date.getTime() < 30 * JOUR_MS
    );
    const utilisateursActifs7j = new Set(sur7Jours.map((c) => c.userId)).size;
    return {
      total,
      sur7Jours: sur7Jours.length,
      sur30Jours: sur30Jours.length,
      utilisateursActifs7j,
    };
  }, [connexionsAvecDate]);

  // --- Synthèse par utilisateur : nombre de connexions + dernière connexion
  const parUtilisateur = useMemo(() => {
    const map = new Map();
    for (const u of utilisateurs) {
      map.set(u.id, { ...u, nombreConnexions: 0, derniereConnexion: null });
    }
    for (const c of connexionsAvecDate) {
      if (!map.has(c.userId)) {
        map.set(c.userId, {
          id: c.userId,
          nom: nomUtilisateur(c.userId),
          email: c.email,
          role: null,
          nombreConnexions: 0,
          derniereConnexion: null,
        });
      }
      const entree = map.get(c.userId);
      entree.nombreConnexions += 1;
      if (!entree.derniereConnexion || c.date > entree.derniereConnexion) {
        entree.derniereConnexion = c.date;
      }
    }
    return [...map.values()].sort((a, b) => {
      const dateA = a.derniereConnexion ? a.derniereConnexion.getTime() : 0;
      const dateB = b.derniereConnexion ? b.derniereConnexion.getTime() : 0;
      return dateB - dateA;
    });
    // nomUtilisateur() ferme déjà sur utilisateurs/connexions ci-dessous : l'ajouter
    // ne ferait que recalculer à chaque rendu sans changer le résultat.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [utilisateurs, connexionsAvecDate]);

  const plusActif = useMemo(() => {
    return parUtilisateur.reduce(
      (meilleur, u) =>
        u.nombreConnexions > (meilleur?.nombreConnexions ?? 0) ? u : meilleur,
      null
    );
  }, [parUtilisateur]);

  const historiqueRecent = useMemo(
    () => connexionsAvecDate.slice(0, 50),
    [connexionsAvecDate]
  );

  return (
    <div className="page">
      <header className="page-header">
        <h1>Statistiques d'utilisation</h1>
        <p className="page-subtitle">
          Suivi des connexions à l'application, par personne et dans le temps.
        </p>
      </header>

      {chargement ? (
        <div className="page-loading">Chargement des données…</div>
      ) : (
        <>
          <div className="stat-grid">
            <StatCard label="Connexions (total)" valeur={stats.total} />
            <StatCard label="Connexions (7 derniers jours)" valeur={stats.sur7Jours} />
            <StatCard label="Connexions (30 derniers jours)" valeur={stats.sur30Jours} />
            <StatCard
              label="Utilisateurs actifs (7 derniers jours)"
              valeur={stats.utilisateursActifs7j}
            />
            <StatCard
              label="Utilisateur le plus actif"
              valeur={plusActif ? plusActif.nom : "—"}
              sousValeur={
                plusActif ? plusActif.nombreConnexions + " connexion(s)" : null
              }
            />
          </div>

          <section className="panel" style={{ marginBottom: 16 }}>
            <div className="panel-header">
              <h2>Par utilisateur</h2>
            </div>
            {parUtilisateur.length === 0 ? (
              <p className="empty-state-description" style={{ margin: "10px 0" }}>
                Aucune connexion journalisée pour l'instant.
              </p>
            ) : (
              <div className="hscroll-auto" style={{ overflowX: "auto" }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Nom</th>
                      <th>Rôle</th>
                      <th>Dernière connexion</th>
                      <th>Nombre de connexions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parUtilisateur.map((u) => (
                      <tr key={u.id}>
                        <td data-label="Nom">{u.nom}</td>
                        <td data-label="Rôle" style={{ fontFamily: "var(--font-ui)" }}>
                          {formatRole(u.role)}
                        </td>
                        <td data-label="Dernière connexion">
                          {u.derniereConnexion
                            ? formatDate(u.derniereConnexion) +
                              " à " +
                              formatHeure(u.derniereConnexion)
                            : "Jamais"}
                        </td>
                        <td data-label="Nombre de connexions">{u.nombreConnexions}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="panel">
            <div className="panel-header">
              <h2>Historique récent</h2>
            </div>
            {historiqueRecent.length === 0 ? (
              <p className="empty-state-description" style={{ margin: "10px 0" }}>
                Aucune connexion journalisée pour l'instant.
              </p>
            ) : (
              <div className="hscroll-auto" style={{ overflowX: "auto" }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Heure</th>
                      <th>Utilisateur</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historiqueRecent.map((c) => (
                      <tr key={c.id}>
                        <td data-label="Date">{formatDate(c.date)}</td>
                        <td data-label="Heure">{formatHeure(c.date)}</td>
                        <td data-label="Utilisateur" style={{ fontFamily: "var(--font-ui)" }}>
                          {nomUtilisateur(c.userId)}
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

function StatCard({ label, valeur, sousValeur }) {
  return (
    <div className="stat-card">
      <div className="stat-value">{valeur}</div>
      <div className="stat-label">{label}</div>
      {sousValeur && <div className="simple-list-meta">{sousValeur}</div>}
    </div>
  );
}
