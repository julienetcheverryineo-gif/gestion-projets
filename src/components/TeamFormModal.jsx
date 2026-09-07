import { useState } from "react";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "../firebase";

export default function TeamFormModal({ chantier, utilisateurs, onClose }) {
  const [ra, setRa] = useState(chantier.ra ?? "Julien ETCHEVERRY");
  const [responsableChantier, setResponsableChantier] = useState(
    chantier.responsableChantier ?? ""
  );
  const [automaticiens, setAutomaticiens] = useState(chantier.automaticiens ?? []);
  const [electriciensTexte, setElectriciensTexte] = useState(
    (chantier.electriciens ?? []).join(", ")
  );
  const [enCours, setEnCours] = useState(false);

  const basculerAutomaticien = (nom) => {
    setAutomaticiens((liste) =>
      liste.includes(nom) ? liste.filter((n) => n !== nom) : [...liste, nom]
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setEnCours(true);
    const electriciens = electriciensTexte
      .split(",")
      .map((n) => n.trim())
      .filter(Boolean);
    await updateDoc(doc(db, "sites", chantier.id), {
      ra,
      responsableChantier,
      automaticiens,
      electriciens,
    });
    setEnCours(false);
    onClose();
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Équipe du chantier</h2>
        <form onSubmit={handleSubmit} className="form">
          <label>
            RA (responsable d'affaire)
            <input value={ra} onChange={(e) => setRa(e.target.value)} />
          </label>
          <label>
            Responsable de chantier
            <select
              value={responsableChantier}
              onChange={(e) => setResponsableChantier(e.target.value)}
            >
              <option value="">—</option>
              {utilisateurs.map((u) => (
                <option key={u.id} value={u.nom}>
                  {u.nom}
                </option>
              ))}
            </select>
          </label>

          <div>
            <div className="reg-subheading" style={{ marginBottom: 8 }}>
              Automaticiens (utilisateurs de l'application)
            </div>
            <div className="team-checklist">
              {utilisateurs.map((u) => (
                <label key={u.id} className="team-checklist-item">
                  <input
                    type="checkbox"
                    checked={automaticiens.includes(u.nom)}
                    onChange={() => basculerAutomaticien(u.nom)}
                  />
                  {u.nom}
                </label>
              ))}
            </div>
          </div>

          <label>
            Électriciens (souvent externes, sans compte — noms libres séparés par une
            virgule)
            <input
              value={electriciensTexte}
              onChange={(e) => setElectriciensTexte(e.target.value)}
              placeholder="ex : Jean Dupont, Marc Petit"
            />
          </label>

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
