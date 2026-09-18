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

export default function SiteFormModal({ chantier, onClose }) {
  const [nom, setNom] = useState(chantier?.nom ?? "");
  const [client, setClient] = useState(chantier?.client ?? "");
  const [adresse, setAdresse] = useState(chantier?.adresse ?? "");
  const [statut, setStatut] = useState(chantier?.statut ?? "actif");
  const [compte, setCompte] = useState(chantier?.compte ?? "");
  const [enCours, setEnCours] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setEnCours(true);
    const donnees = { nom, client, adresse, statut, compte };
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
