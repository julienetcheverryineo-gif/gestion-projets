import { useState } from "react";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "../firebase";
import { champsAvancement } from "../lib/statutTache";

export default function TacheGanttModal({ tache, onClose }) {
  const [dateDebut, setDateDebut] = useState(tache.dateDebut || "");
  const [echeance, setEcheance] = useState(tache.echeance || "");
  const [heuresPrevues, setHeuresPrevues] = useState(tache.heuresPrevues ?? "");
  const [statut, setStatut] = useState(tache.statut ?? "a_faire");
  const [avancement, setAvancement] = useState(tache.avancement ?? "");
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState("");

  // Ce formulaire a son statut ET son avancement en deux champs
  // indépendants (contrairement au tableau des tâches et au plan de
  // charge, qui passent par lib/statutTache) : sans ce recalage, changer
  // le % ici n'avait aucun effet sur le statut, resté tel quel — c'est le
  // bug remonté. On applique la même règle ici, à chaque frappe.
  const changerAvancement = (valeur) => {
    setAvancement(valeur);
    const maj = champsAvancement({ statut }, valeur);
    if (maj.statut) setStatut(maj.statut);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (echeance && dateDebut && echeance < dateDebut) {
      setErreur("La date de fin ne peut pas être avant la date de début.");
      return;
    }
    setErreur("");
    setEnCours(true);
    await updateDoc(doc(db, "tasks", tache.id), {
      dateDebut: dateDebut || null,
      echeance: echeance || null,
      heuresPrevues: heuresPrevues ? Number(heuresPrevues) : null,
      statut,
      avancement: avancement !== "" ? Math.max(0, Math.min(100, Number(avancement))) : null,
    });
    setEnCours(false);
    onClose();
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Recaler la tâche</h2>
        <p className="empty-state-description" style={{ margin: "0 0 14px" }}>
          {tache.titre}
        </p>
        <form onSubmit={handleSubmit} className="form">
          <div className="form-inline">
            <label>
              Date début
              <input type="date" value={dateDebut} onChange={(e) => setDateDebut(e.target.value)} />
            </label>
            <label>
              Date fin
              <input type="date" value={echeance} onChange={(e) => setEcheance(e.target.value)} />
            </label>
          </div>
          <div className="form-inline">
            <label>
              Heures prévues
              <input
                type="number"
                min="0"
                value={heuresPrevues}
                onChange={(e) => setHeuresPrevues(e.target.value)}
              />
            </label>
            <label>
              Statut
              <select value={statut} onChange={(e) => setStatut(e.target.value)}>
                <option value="a_faire">À faire</option>
                <option value="en_cours">En cours</option>
                <option value="termine">Terminé</option>
                <option value="suspendu">Suspendu</option>
              </select>
            </label>
          </div>
          <label>
            Avancement (%)
            <input
              type="number"
              min="0"
              max="100"
              value={avancement}
              onChange={(e) => changerAvancement(e.target.value)}
              placeholder="0"
            />
          </label>
          {erreur && <div className="form-error">{erreur}</div>}
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
