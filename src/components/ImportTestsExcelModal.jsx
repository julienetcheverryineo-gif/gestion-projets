import { useState } from "react";
import { doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { db } from "../firebase";
import { parseTestsExcel, STATUTS_POINT } from "../lib/testsExcel";

const LABEL_STATUT = Object.fromEntries(STATUTS_POINT.map((s) => [s.value, s.label]));

// Réimporte un classeur Excel précédemment exporté (bouton "Exporter en
// Excel" de l'onglet Tests), après que Statut / Valeur mesurée /
// Commentaire ont été complétés sur le terrain (sur papier puis ressaisis,
// ou directement dans le tableur) — pratique quand la connexion n'est pas
// fiable sur le chantier. Même principe que l'import Excel des tâches :
// seules les lignes dont au moins une valeur a changé sont proposées, par
// ID (colonne technique, à ne pas modifier).
export default function ImportTestsExcelModal({ points, nomTesteur, onClose }) {
  const [nomFichier, setNomFichier] = useState("");
  const [modifications, setModifications] = useState(null);
  const [idsInconnus, setIdsInconnus] = useState([]);
  const [lignesAvecId, setLignesAvecId] = useState(0);
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
      const { modifications: mods, idsInconnus: inconnus, lignesAvecId: nbAvecId } = parseTestsExcel(
        buffer,
        points
      );
      setModifications(mods);
      setIdsInconnus(inconnus);
      setLignesAvecId(nbAvecId);
      if (nbAvecId === 0) {
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
        modifications.map((m) => {
          const testeSurPlace = m.champs.statut === "ok" || m.champs.statut === "ko";
          return updateDoc(doc(db, "testPoints", m.id), {
            ...m.champs,
            testePar: testeSurPlace ? nomTesteur : null,
            testeLe: testeSurPlace ? serverTimestamp() : null,
          });
        })
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
            {modifications.length} point(s) mis à jour.
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
        <h2>Importer les résultats depuis Excel</h2>
        <p className="empty-state-description" style={{ margin: "0 0 14px" }}>
          Réimportez le classeur exporté (bouton "Exporter en Excel") une fois les colonnes
          Statut / Valeur mesurée / Commentaire complétées. La colonne ID ne doit pas être
          modifiée — c'est elle qui identifie le point à mettre à jour. Le testeur enregistré
          sera vous-même ({nomTesteur || "non identifié"}), à la date de cet import.
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
          <div style={{ maxHeight: 260, overflowY: "auto", overflowX: "auto", margin: "12px 0" }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Repère</th>
                  <th>Statut</th>
                  <th>Valeur mesurée</th>
                  <th>Commentaire</th>
                </tr>
              </thead>
              <tbody>
                {modifications.map((m) => (
                  <tr key={m.id}>
                    <td data-label="Repère" style={{ fontFamily: "var(--font-ui)" }}>
                      {m.repere}
                    </td>
                    <td data-label="Statut">{LABEL_STATUT[m.champs.statut]}</td>
                    <td data-label="Valeur mesurée">{m.champs.valeurMesuree || "—"}</td>
                    <td data-label="Commentaire">{m.champs.commentaire || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {modifications && modifications.length === 0 && idsInconnus.length === 0 && lignesAvecId > 0 && (
          <p className="empty-state-description">
            Aucun changement détecté par rapport aux données actuelles.
          </p>
        )}

        {idsInconnus.length > 0 && (
          <div className="form-error" style={{ marginTop: 10 }}>
            {idsInconnus.length} ligne(s) avec un ID non reconnu (point supprimé entre-temps ?),
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
              {enImport ? "Enregistrement…" : "Mettre à jour " + modifications.length + " point(s)"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
