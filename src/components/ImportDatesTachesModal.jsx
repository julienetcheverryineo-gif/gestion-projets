import { useState } from "react";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "../firebase";
import { parseTachesExcel } from "../lib/tachesExcel";

// Réimporte un classeur Excel précédemment exporté (bouton "Exporter en
// Excel" de la page Tâches), après que Début/Fin (et éventuellement
// heures/avancement/statut) ont été complétés dans le tableur — bien plus
// rapide à saisir en masse dans Excel qu'une par une dans l'appli. Seules
// les lignes dont au moins une valeur a changé sont proposées à
// l'enregistrement, par ID (la colonne technique du fichier, à ne pas
// modifier) ; les colonnes Chantier/Titre/Responsable ne sont que des
// repères et ne sont jamais réimportées.
export default function ImportDatesTachesModal({ taches, onClose }) {
  const [nomFichier, setNomFichier] = useState("");
  const [modifications, setModifications] = useState(null);
  const [idsInconnus, setIdsInconnus] = useState([]);
  const [erreur, setErreur] = useState("");
  const [enLecture, setEnLecture] = useState(false);
  const [enImport, setEnImport] = useState(false);
  const [termine, setTermine] = useState(false);

  const handleFichier = async (e) => {
    const fichier = e.target.files?.[0];
    if (!fichier) return;
    setErreur("");
    setEnLecture(true);
    setNomFichier(fichier.name);
    try {
      const buffer = await fichier.arrayBuffer();
      const { modifications: mods, idsInconnus: inconnus } = parseTachesExcel(buffer, taches);
      setModifications(mods);
      setIdsInconnus(inconnus);
      if (mods.length === 0 && inconnus.length === 0) {
        setErreur("Aucune ligne reconnue dans ce fichier (colonne ID manquante ou vide).");
      }
    } catch (err) {
      setErreur("Impossible de lire ce fichier : " + err.message);
      setModifications(null);
    } finally {
      setEnLecture(false);
    }
  };

  const importer = async () => {
    if (!modifications || modifications.length === 0) return;
    setEnImport(true);
    try {
      await Promise.all(
        modifications.map((m) => updateDoc(doc(db, "tasks", m.id), m.champs))
      );
      setTermine(true);
    } catch (err) {
      setErreur("Erreur pendant l'enregistrement : " + err.message);
    } finally {
      setEnImport(false);
    }
  };

  if (termine) {
    return (
      <div className="modal-backdrop" onClick={onClose}>
        <div className="modal" onClick={(e) => e.stopPropagation()}>
          <h2>Import terminé ✓</h2>
          <p className="empty-state-description">
            {modifications.length} tâche(s) mise(s) à jour.
          </p>
          <div className="modal-actions">
            <button className="btn-primary" onClick={onClose}>
              Fermer
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 560 }}>
        <h2>Importer les dates depuis Excel</h2>
        <p className="empty-state-description" style={{ margin: "0 0 14px" }}>
          Réimportez le classeur exporté (bouton "Exporter en Excel") une fois les colonnes
          Début / Fin (et heures / avancement / statut si besoin) complétées. La colonne ID
          ne doit pas être modifiée — c'est elle qui identifie la tâche à mettre à jour.
        </p>

        {!modifications && (
          <label className="file-picker">
            <input type="file" accept=".xlsx,.xls" onChange={handleFichier} />
            <span className="file-picker-icon">⬆</span>
            <span className="file-picker-text">
              <strong>Choisir un fichier</strong>
              <span>{nomFichier || "Aucun fichier sélectionné"}</span>
            </span>
          </label>
        )}
        {enLecture && <p className="page-loading">Analyse du fichier…</p>}

        {modifications && modifications.length > 0 && (
          <div style={{ maxHeight: 260, overflowY: "auto", margin: "12px 0" }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Tâche</th>
                  <th>Début</th>
                  <th>Fin</th>
                  <th>Heures</th>
                  <th>Avanc.</th>
                  <th>Statut</th>
                </tr>
              </thead>
              <tbody>
                {modifications.map((m) => (
                  <tr key={m.id}>
                    <td data-label="Tâche" style={{ fontFamily: "var(--font-ui)" }}>
                      {m.titre}
                    </td>
                    <td data-label="Début">{m.champs.dateDebut || "—"}</td>
                    <td data-label="Fin">{m.champs.echeance || "—"}</td>
                    <td data-label="Heures">{m.champs.heuresPrevues ?? "—"}</td>
                    <td data-label="Avanc.">
                      {m.champs.avancement !== null ? m.champs.avancement + "%" : "—"}
                    </td>
                    <td data-label="Statut">{m.champs.statut}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {modifications && modifications.length === 0 && idsInconnus.length === 0 && (
          <p className="empty-state-description">
            Aucun changement détecté par rapport aux données actuelles.
          </p>
        )}

        {idsInconnus.length > 0 && (
          <div className="form-error" style={{ marginTop: 10 }}>
            {idsInconnus.length} ligne(s) avec un ID non reconnu (tâche supprimée entre-temps ?),
            ignorée(s).
          </div>
        )}

        {erreur && <div className="form-error" style={{ marginTop: 10 }}>{erreur}</div>}

        <div className="modal-actions">
          <button type="button" className="btn-ghost" onClick={onClose}>
            {modifications ? "Fermer" : "Annuler"}
          </button>
          {modifications && modifications.length > 0 && (
            <button className="btn-primary" onClick={importer} disabled={enImport}>
              {enImport ? "Enregistrement…" : "Mettre à jour " + modifications.length + " tâche(s)"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
