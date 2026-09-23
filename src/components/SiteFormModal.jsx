import { useState } from "react";
import { addDoc, collection, doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { db } from "../firebase";

export const STATUTS_CHANTIER = [
  { value: "actif", label: "Actif" },
  { value: "en_pause", label: "En pause" },
  { value: "termine", label: "Terminé" },
];

export function formatStatutChantier(statut) {
  return STATUTS_CHANTIER.find((s) => s.value === statut)?.label ?? statut;
}

// Formulaire chantier unifié : infos générales ET équipe en un seul endroit,
// aussi bien à la création (l'équipe peut rester vide, à affecter plus
// tard) qu'à la modification.
export default function SiteFormModal({ chantier, utilisateurs, onClose }) {
  const [nom, setNom] = useState(chantier?.nom ?? "");
  const [client, setClient] = useState(chantier?.client ?? "");
  const [adresse, setAdresse] = useState(chantier?.adresse ?? "");
  const [statut, setStatut] = useState(chantier?.statut ?? "actif");
  const [compte, setCompte] = useState(chantier?.compte ?? "");
  const [ra, setRa] = useState(chantier?.ra ?? "Julien ETCHEVERRY");
  const [responsableChantier, setResponsableChantier] = useState(
    chantier?.responsableChantier ?? ""
  );
  const [automaticiens, setAutomaticiens] = useState(chantier?.automaticiens ?? []);
  const [electriciensTexte, setElectriciensTexte] = useState(
    (chantier?.electriciens ?? []).join(", ")
  );
  const [enCours, setEnCours] = useState(false);

  const basculerAutomaticien = (nomPersonne) => {
    setAutomaticiens((liste) =>
      liste.includes(nomPersonne) ? liste.filter((n) => n !== nomPersonne) : [...liste, nomPersonne]
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setEnCours(true);
    const electriciens = electriciensTexte
      .split(",")
      .map((n) => n.trim())
      .filter(Boolean);
    const donnees = {
      nom,
      client,
      adresse,
      statut,
      compte,
      ra,
      responsableChantier,
      automaticiens,
      electriciens,
    };
    if (chantier) {
      await updateDoc(doc(db, "sites", chantier.id), donnees);
    } else {
      await addDoc(collection(db, "sites"), { ...donnees, creeLe: serverTimestamp() });
    }
    setEnCours(false);
    onClose();
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{chantier ? "Modifier le chantier" : "Nouveau chantier"}</h2>
        <form onSubmit={handleSubmit} className="form">
          <label>
            Nom du chantier
            <input value={nom} onChange={(e) => setNom(e.target.value)} required />
          </label>
          <label>
            Client
            <input value={client} onChange={(e) => setClient(e.target.value)} />
          </label>
          <label>
            Adresse
            <input value={adresse} onChange={(e) => setAdresse(e.target.value)} />
          </label>
          <div className="form-inline">
            <label>
              Statut
              <select value={statut} onChange={(e) => setStatut(e.target.value)}>
                {STATUTS_CHANTIER.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Compte
              <input
                value={compte}
                onChange={(e) => setCompte(e.target.value)}
                placeholder="ex : JE602"
              />
            </label>
          </div>

          <div className="form-divider">Équipe (facultatif, à affecter plus tard si besoin)</div>

          <div className="form-inline">
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
          </div>

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
