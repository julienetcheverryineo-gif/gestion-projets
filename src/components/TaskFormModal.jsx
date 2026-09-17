import { useState } from "react";
import { addDoc, collection, doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { db } from "../firebase";

export default function TaskFormModal({
  statutInitial = "a_faire",
  tache,
  chantiers,
  chantierIdFixe,
  utilisateurs,
  onClose,
}) {
  const [titre, setTitre] = useState(tache?.titre ?? "");
  const [chantierId, setChantierId] = useState(
    tache?.chantierId ?? (chantierIdFixe !== undefined ? chantierIdFixe : chantiers[0]?.id) ?? ""
  );
  const [assigneA, setAssigneA] = useState(tache?.assigneA ?? "");
  const [heuresPrevues, setHeuresPrevues] = useState(tache?.heuresPrevues ?? "");
  const [dateDebut, setDateDebut] = useState(tache?.dateDebut ?? "");
  const [echeance, setEcheance] = useState(tache?.echeance ?? "");
  const [lienDevis, setLienDevis] = useState(tache?.lienDevis ?? "");
  const [commentaires, setCommentaires] = useState(tache?.commentaires ?? "");
  const [enCours, setEnCours] = useState(false);

  const compteChantier = chantiers.find((c) => c.id === chantierId)?.compte;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setEnCours(true);
    const donnees = {
      titre,
      chantierId: chantierId || null,
      assigneA: assigneA || null,
      heuresPrevues: heuresPrevues ? Number(heuresPrevues) : null,
      dateDebut: dateDebut || null,
      echeance: echeance || null,
      lienDevis: lienDevis || null,
      commentaires: commentaires || null,
    };
    if (tache) {
      await updateDoc(doc(db, "tasks", tache.id), donnees);
    } else {
      await addDoc(collection(db, "tasks"), {
        ...donnees,
        statut: statutInitial,
        creeLe: serverTimestamp(),
      });
    }
    setEnCours(false);
    onClose();
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{tache ? "Modifier la tâche" : "Nouvelle tâche"}</h2>
        <form onSubmit={handleSubmit} className="form">
          <label>
            Titre
            <input value={titre} onChange={(e) => setTitre(e.target.value)} required />
          </label>
          {chantierIdFixe === undefined && (
            <label>
              Chantier
              <select value={chantierId} onChange={(e) => setChantierId(e.target.value)}>
                <option value="">À affecter</option>
                {chantiers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nom}
                  </option>
                ))}
              </select>
            </label>
          )}
          {compteChantier && (
            <p className="simple-list-meta" style={{ margin: "-6px 0 0" }}>
              Compte : {compteChantier}
            </p>
          )}
          <label>
            Responsable
            <select value={assigneA} onChange={(e) => setAssigneA(e.target.value)}>
              <option value="">À affecter</option>
              {utilisateurs.map((u) => (
                <option key={u.id} value={u.nom}>
                  {u.nom}
                </option>
              ))}
            </select>
          </label>
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
              Date début
              <input
                type="date"
                value={dateDebut}
                onChange={(e) => setDateDebut(e.target.value)}
              />
            </label>
            <label>
              Date fin
              <input
                type="date"
                value={echeance}
                onChange={(e) => setEcheance(e.target.value)}
              />
            </label>
          </div>
          <label>
            Lien devis
            <input value={lienDevis} onChange={(e) => setLienDevis(e.target.value)} />
          </label>
          <label>
            Commentaires
            <textarea
              value={commentaires}
              onChange={(e) => setCommentaires(e.target.value)}
              rows={2}
            />
          </label>
          <div className="modal-actions">
            <button type="button" className="btn-ghost" onClick={onClose}>
              Annuler
            </button>
            <button type="submit" className="btn-primary" disabled={enCours}>
              {enCours ? "Enregistrement…" : tache ? "Enregistrer" : "Créer la tâche"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
