import { useRef, useState } from "react";
import { ACCEPT_PJ, ajouterPieces, retirerPiece } from "../lib/piecesJointes";

// Liste des pièces jointes d'une réserve, avec ajout (et retrait) immédiat.
export default function PiecesJointesReserve({ reserveId, pieces = [], peutAjouter, peutRetirer, auteur }) {
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState("");
  const champ = useRef(null);

  const ajouter = async (e) => {
    const fichiers = [...(e.target.files || [])];
    e.target.value = "";
    if (fichiers.length === 0) return;
    setErreur("");
    setEnCours(true);
    try {
      await ajouterPieces(reserveId, fichiers, auteur);
    } catch (err) {
      setErreur(err.message || "Envoi impossible.");
    }
    setEnCours(false);
  };

  const retirer = async (p) => {
    if (!confirm("Retirer « " + p.nom + " » ?")) return;
    try {
      await retirerPiece(reserveId, p);
    } catch (err) {
      setErreur(err.message || "Suppression impossible.");
    }
  };

  return (
    <div className="pj-reserve">
      {pieces.map((p) => (
        <span key={p.chemin} className="pj-reserve-item">
          <a href={p.url} target="_blank" rel="noreferrer" title={p.nom}>
            {p.type?.startsWith("image/") ? "🖼" : "📎"} {p.nom}
          </a>
          {peutRetirer && (
            <button type="button" className="btn-ghost btn-danger pj-reserve-x" onClick={() => retirer(p)} title="Retirer">
              ×
            </button>
          )}
        </span>
      ))}
      {peutAjouter && (
        <>
          <input ref={champ} type="file" multiple accept={ACCEPT_PJ} onChange={ajouter} hidden />
          <button type="button" className="btn-ghost pj-reserve-ajout" disabled={enCours} onClick={() => champ.current?.click()}>
            {enCours ? "Envoi…" : "＋ Pièce jointe"}
          </button>
        </>
      )}
      {pieces.length === 0 && !peutAjouter && <span className="simple-list-meta">—</span>}
      {erreur && <div className="form-error">{erreur}</div>}
    </div>
  );
}
