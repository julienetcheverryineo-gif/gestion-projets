import { useRef, useState } from "react";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase";
import { parseDevisWorkbook } from "../lib/parseDevis";

export default function ImportDevisModal({ chantierId, onClose }) {
  const fileInputRef = useRef(null);
  const [postes, setPostes] = useState(null);
  const [nomFichier, setNomFichier] = useState("");
  const [erreur, setErreur] = useState("");
  const [enLecture, setEnLecture] = useState(false);
  const [enImport, setEnImport] = useState(false);
  const [posteOuvert, setPosteOuvert] = useState(null);

  const handleFichier = async (e) => {
    const fichier = e.target.files?.[0];
    if (!fichier) return;
    setErreur("");
    setEnLecture(true);
    setNomFichier(fichier.name);
    try {
      const buffer = await fichier.arrayBuffer();
      const detectes = parseDevisWorkbook(buffer);
      if (detectes.length === 0) {
        setErreur(
          "Aucun poste détecté dans ce fichier. Vérifiez qu'il suit bien le même modèle de minute de devis (colonnes n°, Référence, Description, Unité, Qté)."
        );
        setPostes(null);
      } else {
        setPostes(
          detectes.map((p) => ({ ...p, selectionne: true, nomEdite: p.nom }))
        );
      }
    } catch (err) {
      setErreur("Impossible de lire ce fichier : " + err.message);
      setPostes(null);
    } finally {
      setEnLecture(false);
    }
  };

  const basculerPoste = (index) => {
    setPostes((prev) =>
      prev.map((p, i) => (i === index ? { ...p, selectionne: !p.selectionne } : p))
    );
  };

  const renommerPoste = (index, nom) => {
    setPostes((prev) =>
      prev.map((p, i) => (i === index ? { ...p, nomEdite: nom } : p))
    );
  };

  const nbEquipementsSelectionnes = (postes ?? [])
    .filter((p) => p.selectionne)
    .reduce((s, p) => s + p.items.filter((it) => !it.estTitre).length, 0);

  const importer = async () => {
    const aImporter = postes.filter((p) => p.selectionne);
    if (aImporter.length === 0) return;
    setEnImport(true);
    try {
      for (const poste of aImporter) {
        const lotRef = await addDoc(collection(db, "lots"), {
          nom: poste.code + " — " + poste.nomEdite,
          chantierId,
          creeLe: serverTimestamp(),
        });
        for (const item of poste.items) {
          if (item.estTitre) continue;
          await addDoc(collection(db, "equipments"), {
            designation: item.designation,
            remarque: [item.reference, item.detail].filter(Boolean).join(" — "),
            unite: item.unite || "",
            quantite: item.quantite || 0,
            lotId: lotRef.id,
            statut: "a_faire",
            creeLe: serverTimestamp(),
          });
        }
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
      <div className="modal modal-large" onClick={(e) => e.stopPropagation()}>
        <h2>Importer une minute de devis</h2>

        {!postes && (
          <div className="import-drop">
            <p className="empty-state-description" style={{ margin: "0 0 12px" }}>
              Sélectionnez le fichier Excel (.xlsx) de la minute de devis. L'outil
              détecte automatiquement les postes (ex : A.1, A.2…) et le matériel
              listé sous chacun.
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={handleFichier}
            />
            {enLecture && <p className="page-loading">Analyse du fichier…</p>}
            {erreur && <div className="form-error" style={{ marginTop: 10 }}>{erreur}</div>}
          </div>
        )}

        {postes && (
          <>
            <p className="page-subtitle" style={{ margin: "0 0 14px" }}>
              {nomFichier} — {postes.length} poste(s) détecté(s),{" "}
              {nbEquipementsSelectionnes} équipement(s)/tâche(s) sélectionné(s)
            </p>

            <div className="import-poste-list">
              {postes.map((poste, index) => {
                const nbItems = poste.items.filter((it) => !it.estTitre).length;
                const ouvert = posteOuvert === index;
                return (
                  <div key={index} className="import-poste-row">
                    <div className="import-poste-header">
                      <label className="import-checkbox">
                        <input
                          type="checkbox"
                          checked={poste.selectionne}
                          onChange={() => basculerPoste(index)}
                        />
                      </label>
                      <span className="import-poste-code">{poste.code}</span>
                      <input
                        className="import-poste-nom"
                        value={poste.nomEdite}
                        onChange={(e) => renommerPoste(index, e.target.value)}
                      />
                      <span className="simple-list-meta">{nbItems} item(s)</span>
                      <button
                        className="linkish"
                        onClick={() => setPosteOuvert(ouvert ? null : index)}
                      >
                        {ouvert ? "Masquer" : "Détail"}
                      </button>
                    </div>
                    {ouvert && (
                      <ul className="import-item-list">
                        {poste.items.map((item, i) =>
                          item.estTitre ? (
                            <li key={i} className="import-item-titre">
                              {item.designation}
                            </li>
                          ) : (
                            <li key={i}>
                              <span>{item.designation}</span>
                              <span className="simple-list-meta">
                                {item.quantite ? item.quantite + " " + item.unite : ""}
                              </span>
                            </li>
                          )
                        )}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>

            {erreur && <div className="form-error" style={{ marginTop: 10 }}>{erreur}</div>}
          </>
        )}

        <div className="modal-actions">
          <button type="button" className="btn-ghost" onClick={onClose}>
            Annuler
          </button>
          {postes && (
            <button
              className="btn-primary"
              onClick={importer}
              disabled={enImport || nbEquipementsSelectionnes === 0}
            >
              {enImport
                ? "Import…"
                : "Importer " + postes.filter((p) => p.selectionne).length + " poste(s)"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
