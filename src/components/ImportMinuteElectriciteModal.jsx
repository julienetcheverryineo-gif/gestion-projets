import { useState } from "react";
import { addDoc, collection, serverTimestamp, writeBatch, doc } from "firebase/firestore";
import { db } from "../firebase";
import { analyserMinuteElectricite } from "../lib/parseMinuteElectricite";

// Import d'une minute de devis pour un chantier Électricité : contrairement
// à l'Automatisme (qui regroupe les lignes en équipements), on garde ici
// la structure du devis telle quelle et on en fait un nouvel onglet
// ("elecDevis"), avec toutes ses lignes ("elecLignes") prêtes à recevoir un
// % d'avancement.
export default function ImportMinuteElectriciteModal({ chantierId, nbDevisExistants, onClose }) {
  const [sequence, setSequence] = useState(null);
  const [nomFichier, setNomFichier] = useState("");
  const [nomDevis, setNomDevis] = useState("");
  const [erreur, setErreur] = useState("");
  const [enLecture, setEnLecture] = useState(false);
  const [enImport, setEnImport] = useState(false);

  const handleFichier = async (e) => {
    const fichier = e.target.files?.[0];
    if (!fichier) return;
    setErreur("");
    setEnLecture(true);
    setNomFichier(fichier.name);
    setNomDevis(fichier.name.replace(/\.[^.]+$/, ""));
    try {
      const buffer = await fichier.arrayBuffer();
      const resultat = analyserMinuteElectricite(buffer);
      setSequence(resultat);
    } catch (err) {
      setErreur("Impossible de lire ce fichier : " + err.message);
      setSequence(null);
    } finally {
      setEnLecture(false);
    }
  };

  const nbLignes = (sequence ?? []).filter((l) => !l.estPoste).length;
  const nbPostes = (sequence ?? []).filter((l) => l.estPoste).length;

  const importer = async () => {
    if (!sequence || !nomDevis.trim()) return;
    setEnImport(true);
    try {
      const devisRef = await addDoc(collection(db, "elecDevis"), {
        chantierId,
        nom: nomDevis.trim(),
        nomFichier,
        ordre: nbDevisExistants,
        creeLe: serverTimestamp(),
      });

      // Écriture par lots de 400 (marge sous la limite de 500 opérations
      // par batch Firestore) — une minute peut compter plusieurs
      // centaines de lignes.
      const TAILLE_LOT = 400;
      for (let i = 0; i < sequence.length; i += TAILLE_LOT) {
        const batch = writeBatch(db);
        for (const ligne of sequence.slice(i, i + TAILLE_LOT)) {
          const ref = doc(collection(db, "elecLignes"));
          batch.set(ref, {
            devisId: devisRef.id,
            chantierId,
            estPoste: ligne.estPoste,
            code: ligne.code,
            profondeur: ligne.profondeur ?? 0,
            designation: ligne.designation || "",
            detail: ligne.detail || "",
            reference: ligne.reference || "",
            unite: ligne.unite || "",
            quantite: ligne.quantite || 0,
            typeFo: ligne.typeFo || "",
            coutUnitaireFo: ligne.coutUnitaireFo || 0,
            coutTotalFo: ligne.coutTotalFo || 0,
            typeMo: ligne.typeMo || "",
            tempsUnitaire: ligne.tempsUnitaire || 0,
            tempsTotalHeures: ligne.tempsTotalHeures || 0,
            pvUnitaire: ligne.pvUnitaire || 0,
            pvTotal: ligne.pvTotal || 0,
            informative: ligne.informative || false,
            avancementFo: 0,
            avancementMo: 0,
            ordre: ligne.ordre,
            creeLe: serverTimestamp(),
          });
        }
        await batch.commit();
      }
      onClose();
    } catch (err) {
      setErreur("Erreur pendant l'import : " + err.message);
    } finally {
      setEnImport(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="import-popup" onClick={(e) => e.stopPropagation()}>
        <header className="import-fullscreen-header">
          <div>
            <h2>Importer une minute de devis</h2>
            {sequence && (
              <p className="page-subtitle">
                {nomFichier} — {nbPostes} poste(s), {nbLignes} ligne(s) détectée(s)
              </p>
            )}
          </div>
          <button className="btn-ghost" onClick={onClose} aria-label="Fermer">
            Fermer ✕
          </button>
        </header>

        <div className="import-fullscreen-body">
          {!sequence && (
            <div className="import-drop">
              <p className="empty-state-description" style={{ margin: "0 0 16px" }}>
                Sélectionnez le fichier Excel (.xlsx) de la minute de devis. Elle devient un
                nouvel onglet de devis sur ce chantier, avec toutes ses lignes prêtes à
                recevoir un % d'avancement — vous pouvez importer autant de minutes que
                nécessaire.
              </p>
              <label className="file-picker">
                <input type="file" accept=".xlsx,.xls" onChange={handleFichier} />
                <span className="file-picker-icon">⬆</span>
                <span className="file-picker-text">
                  <strong>Choisir un fichier</strong>
                  <span>{nomFichier || "Aucun fichier sélectionné"}</span>
                </span>
              </label>
              {enLecture && <p className="page-loading">Analyse du fichier…</p>}
              {erreur && <div className="form-error" style={{ marginTop: 10 }}>{erreur}</div>}
            </div>
          )}

          {sequence && (
            <div>
              <label>
                Nom du devis (visible comme onglet)
                <input value={nomDevis} onChange={(e) => setNomDevis(e.target.value)} required />
              </label>
              <div className="hscroll-auto" style={{ overflowX: "auto", marginTop: 16 }}>
                <table className="data-table import-edit-table">
                  <thead>
                    <tr>
                      <th>Désignation</th>
                      <th style={{ width: 70 }}>Unité</th>
                      <th style={{ width: 70 }}>Qté</th>
                      <th style={{ width: 110 }}>Coût total FO</th>
                      <th style={{ width: 90 }}>Temps total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sequence.slice(0, 40).map((ligne, i) => (
                      <tr key={i}>
                        <td
                          data-label="Désignation"
                          style={
                            ligne.estPoste
                              ? { fontWeight: 600, paddingLeft: 8 + (ligne.profondeur || 0) * 16 }
                              : { paddingLeft: 24, color: "var(--text-muted)" }
                          }
                        >
                          {ligne.designation}
                        </td>
                        <td data-label="Unité">{ligne.unite || ""}</td>
                        <td data-label="Qté">{ligne.estPoste ? "" : ligne.quantite || ""}</td>
                        <td data-label="Coût total FO">
                          {ligne.estPoste ? "" : ligne.coutTotalFo ? ligne.coutTotalFo + " €" : ""}
                        </td>
                        <td data-label="Temps total">
                          {ligne.estPoste
                            ? ""
                            : ligne.tempsTotalHeures
                            ? ligne.tempsTotalHeures + " h"
                            : ""}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {sequence.length > 40 && (
                <p className="empty-state-description" style={{ margin: "8px 0 0" }}>
                  … et {sequence.length - 40} ligne(s) supplémentaire(s), non affichée(s) dans cet
                  aperçu mais bien importée(s).
                </p>
              )}
            </div>
          )}

          {erreur && sequence && (
            <div className="form-error" style={{ marginTop: 10 }}>{erreur}</div>
          )}
        </div>

        <footer className="import-fullscreen-footer">
          <button type="button" className="btn-ghost" onClick={onClose}>
            Annuler
          </button>
          {sequence && (
            <button
              className="btn-primary"
              onClick={importer}
              disabled={enImport || !nomDevis.trim()}
            >
              {enImport ? "Import…" : "Importer " + nbLignes + " ligne(s)"}
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}
