import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useCollection } from "../lib/firestoreHooks";
import NotesPanel from "../components/NotesPanel";

function formatDate(ts) {
  if (!ts?.toDate) return "";
  return ts.toDate().toLocaleDateString("fr-FR");
}

export default function Notes() {
  const navigate = useNavigate();
  const { documents: chantiers } = useCollection("sites");
  const { documents: notes, chargement } = useCollection("notes");

  // Synthèse : pour chaque chantier ayant au moins une note, le nombre de
  // notes et un aperçu de la plus récente — pour repérer d'un coup d'œil
  // où il y a du nouveau, sans ouvrir chaque chantier.
  const synthese = useMemo(() => {
    const parChantier = new Map();
    for (const note of notes) {
      if (!note.chantierId) continue;
      if (!parChantier.has(note.chantierId)) parChantier.set(note.chantierId, []);
      parChantier.get(note.chantierId).push(note);
    }
    const lignes = [];
    for (const [chantierId, notesChantier] of parChantier) {
      const chantier = chantiers.find((c) => c.id === chantierId);
      // notesChantier est déjà trié du plus récent au plus ancien
      // (useCollection trie par creeLe desc).
      const derniere = notesChantier[0];
      lignes.push({
        chantierId,
        nomChantier: chantier ? chantier.nom : "Chantier supprimé",
        client: chantier?.client || "",
        nb: notesChantier.length,
        derniere,
      });
    }
    lignes.sort((a, b) => (b.derniere?.creeLe?.seconds || 0) - (a.derniere?.creeLe?.seconds || 0));
    return lignes;
  }, [notes, chantiers]);

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>Notes</h1>
          <p className="page-subtitle">Notes générales et synthèse des notes par affaire</p>
        </div>
      </header>

      <div className="notes-page-grille">
        <section className="panel">
          <div className="panel-header">
            <h2>Notes générales</h2>
          </div>
          <NotesPanel texteVide="Aucune note générale pour l'instant." />
        </section>

        <section className="panel">
          <div className="panel-header">
            <h2>Synthèse par affaire</h2>
            <span className="simple-list-meta">cliquer une ligne pour ouvrir les notes du chantier</span>
          </div>
          {chargement ? (
            <p className="page-loading">Chargement…</p>
          ) : synthese.length === 0 ? (
            <p className="empty-state-description" style={{ margin: "10px 0" }}>
              Aucune note saisie sur un chantier pour l'instant.
            </p>
          ) : (
            <div className="hscroll-auto" style={{ overflowX: "auto" }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Chantier</th>
                    <th>Client</th>
                    <th>Notes</th>
                    <th>Dernière note</th>
                  </tr>
                </thead>
                <tbody>
                  {synthese.map((ligne) => (
                    <tr
                      key={ligne.chantierId}
                      className="notes-synthese-ligne"
                      onClick={() => navigate(`/chantiers/${ligne.chantierId}?onglet=notes`)}
                    >
                      <td>{ligne.nomChantier}</td>
                      <td>{ligne.client || "—"}</td>
                      <td>{ligne.nb}</td>
                      <td>
                        <span className="notes-synthese-extrait">{ligne.derniere?.texte}</span>
                        <span className="simple-list-meta">
                          {formatDate(ligne.derniere?.creeLe)} · {ligne.derniere?.auteur}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
