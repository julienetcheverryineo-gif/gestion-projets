import { useMemo, useState } from "react";
import { addDoc, collection, deleteDoc, doc, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../contexts/AuthContext";
import { useCollection } from "../lib/firestoreHooks";

export default function TimeTracking() {
  const { profile } = useAuth();
  const { documents: entrees } = useCollection("timeEntries");
  const { documents: projets } = useCollection("projects");
  const { documents: taches } = useCollection("tasks");

  const [projetId, setProjetId] = useState("");
  const [tacheId, setTacheId] = useState("");
  const [duree, setDuree] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [enCours, setEnCours] = useState(false);

  const mesEntrees = useMemo(
    () => entrees.filter((e) => e.userId === profile?.id),
    [entrees, profile]
  );

  const totalHeuresSemaine = useMemo(() => {
    const debutSemaine = debutDeSemaine(new Date());
    return mesEntrees
      .filter((e) => new Date(e.date) >= debutSemaine)
      .reduce((total, e) => total + Number(e.duree || 0), 0);
  }, [mesEntrees]);

  const ajouterEntree = async (e) => {
    e.preventDefault();
    if (!duree) return;
    setEnCours(true);
    await addDoc(collection(db, "timeEntries"), {
      userId: profile.id,
      userNom: profile.nom,
      projetId: projetId || null,
      tacheId: tacheId || null,
      duree: Number(duree),
      date,
      creeLe: serverTimestamp(),
    });
    setDuree("");
    setEnCours(false);
  };

  const supprimer = async (id) => {
    await deleteDoc(doc(db, "timeEntries", id));
  };

  return (
    <div className="page">
      <header className="page-header">
        <h1>Suivi de temps</h1>
        <p className="page-subtitle">
          Cette semaine : <strong>{totalHeuresSemaine} h</strong> saisies
        </p>
      </header>

      <section className="panel">
        <div className="panel-header">
          <h2>Nouvelle saisie</h2>
        </div>
        <form onSubmit={ajouterEntree} className="form form-inline">
          <label>
            Projet
            <select value={projetId} onChange={(e) => setProjetId(e.target.value)}>
              <option value="">—</option>
              {projets.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nom}
                </option>
              ))}
            </select>
          </label>
          <label>
            Tâche
            <select value={tacheId} onChange={(e) => setTacheId(e.target.value)}>
              <option value="">—</option>
              {taches
                .filter((t) => !projetId || t.projetId === projetId)
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.titre}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Date
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label>
            Durée (heures)
            <input
              type="number"
              step="0.25"
              min="0"
              value={duree}
              onChange={(e) => setDuree(e.target.value)}
              placeholder="ex: 2.5"
              required
            />
          </label>
          <button type="submit" className="btn-primary" disabled={enCours}>
            {enCours ? "Ajout…" : "Ajouter"}
          </button>
        </form>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>Mes dernières saisies</h2>
        </div>
        {mesEntrees.length === 0 ? (
          <div className="empty-state">
            <p className="empty-state-title">Aucune saisie</p>
            <p className="empty-state-description">
              Ajoutez votre premier temps passé ci-dessus.
            </p>
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Projet</th>
                <th>Tâche</th>
                <th>Durée</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {mesEntrees.slice(0, 20).map((entree) => (
                <tr key={entree.id}>
                  <td>{entree.date}</td>
                  <td>{nomParId(projets, entree.projetId) ?? "—"}</td>
                  <td>{nomParId(taches, entree.tacheId, "titre") ?? "—"}</td>
                  <td>{entree.duree} h</td>
                  <td>
                    <button
                      className="btn-ghost btn-danger"
                      onClick={() => supprimer(entree.id)}
                    >
                      Supprimer
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

function nomParId(liste, id, champ = "nom") {
  return liste.find((el) => el.id === id)?.[champ];
}

function debutDeSemaine(date) {
  const d = new Date(date);
  const jour = d.getDay() || 7;
  if (jour !== 1) d.setHours(-24 * (jour - 1));
  d.setHours(0, 0, 0, 0);
  return d;
}
