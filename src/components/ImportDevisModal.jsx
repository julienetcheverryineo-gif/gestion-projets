import { useState } from "react";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase";
import { parseDevisWorkbook } from "../lib/parseDevis";

export default function ImportDevisModal({ chantierId, onClose }) {
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
          "Aucun équipement détecté dans ce fichier. Vérifiez qu'il suit bien le même modèle de minute de devis (colonnes n°, Référence, Description, Unité, Qté, Type de FO, Type MO)."
        );
        setPostes(null);
      } else {
        setPostes(detectes.map((p) => ({ ...p, selectionne: true, nomEdite: p.nom })));
        setPosteOuvert(0);
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
    setPostes((prev) => prev.map((p, i) => (i === index ? { ...p, nomEdite: nom } : p)));
  };

  const modifierItem = (posteIndex, itemId, champ, valeur) => {
    setPostes((prev) =>
      prev.map((p, i) => {
        if (i !== posteIndex) return p;
        return {
          ...p,
          items: p.items.map((it) => (it.id === itemId ? { ...it, [champ]: valeur } : it)),
        };
      })
    );
  };

  const supprimerItem = (posteIndex, itemId) => {
    setPostes((prev) =>
      prev.map((p, i) =>
        i === posteIndex ? { ...p, items: p.items.filter((it) => it.id !== itemId) } : p
      )
    );
  };

  const ajouterItem = (posteIndex, type) => {
    setPostes((prev) =>
      prev.map((p, i) =>
        i === posteIndex
          ? {
              ...p,
              items: [
                ...p.items,
                {
                  id: "manuel-" + Date.now(),
                  type,
                  designation: "",
                  reference: "",
                  unite: "",
                  quantite: 0,
                  detail: "",
                },
              ],
            }
          : p
      )
    );
  };

  const nbItemsSelectionnes = (postes ?? [])
    .filter((p) => p.selectionne)
    .reduce((s, p) => s + p.items.filter((it) => it.designation.trim()).length, 0);

  const importer = async () => {
    const aImporter = postes.filter((p) => p.selectionne);
    if (aImporter.length === 0) return;
    setEnImport(true);
    try {
      for (const poste of aImporter) {
        const regRef = await addDoc(collection(db, "regequipements"), {
          nom: poste.nomEdite,
          chantierId,
          code: poste.code,
          creeLe: serverTimestamp(),
        });
        for (const item of poste.items) {
          if (!item.designation.trim()) continue;
          await addDoc(collection(db, "regitems"), {
            regEquipementId: regRef.id,
            type: item.type,
            designation: item.designation,
            remarque: [item.reference, item.detail].filter(Boolean).join(" — "),
            unite: item.unite || "",
            quantite: item.quantite || 0,
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
    <div className="import-fullscreen">
      <header className="import-fullscreen-header">
        <div>
          <h2>Importer une minute de devis</h2>
          {postes && (
            <p className="page-subtitle">
              {nomFichier} — {postes.length} équipement(s) détecté(s), {nbItemsSelectionnes}{" "}
              ligne(s) sélectionnée(s)
            </p>
          )}
        </div>
        <button className="btn-ghost" onClick={onClose} aria-label="Fermer">
          Fermer ✕
        </button>
      </header>

      <div className="import-fullscreen-body">
        {!postes && (
          <div className="import-drop">
            <p className="empty-state-description" style={{ margin: "0 0 16px" }}>
              Sélectionnez le fichier Excel (.xlsx) de la minute de devis. Chaque poste
              détecté (ex : A.1, A.2…) devient un équipement régulé, avec son matériel et
              ses tâches déjà triés — tout reste modifiable avant import.
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

        {postes && (
          <div className="import-poste-list">
            {postes.map((poste, index) => {
              const materiel = poste.items.filter((it) => it.type === "materiel");
              const taches = poste.items.filter((it) => it.type === "tache");
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
                    <input
                      className="import-poste-nom"
                      value={poste.nomEdite}
                      onChange={(e) => renommerPoste(index, e.target.value)}
                    />
                    <button
                      className="btn-ghost import-poste-toggle"
                      onClick={() => setPosteOuvert(ouvert ? null : index)}
                    >
                      {materiel.length} matériel · {taches.length} tâche(s)
                      {ouvert ? " — Masquer" : " — Modifier"}
                    </button>
                  </div>

                  {ouvert && (
                    <div className="import-item-edit">
                      <ImportItemTable
                        titre="Matériel"
                        items={materiel}
                        onChange={(itemId, champ, valeur) =>
                          modifierItem(index, itemId, champ, valeur)
                        }
                        onDelete={(itemId) => supprimerItem(index, itemId)}
                        onAdd={() => ajouterItem(index, "materiel")}
                        avecQuantite
                      />
                      <ImportItemTable
                        titre="Tâches"
                        items={taches}
                        onChange={(itemId, champ, valeur) =>
                          modifierItem(index, itemId, champ, valeur)
                        }
                        onDelete={(itemId) => supprimerItem(index, itemId)}
                        onAdd={() => ajouterItem(index, "tache")}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {erreur && postes && (
          <div className="form-error" style={{ marginTop: 10 }}>{erreur}</div>
        )}
      </div>

      <footer className="import-fullscreen-footer">
        <button type="button" className="btn-ghost" onClick={onClose}>
          Annuler
        </button>
        {postes && (
          <button
            className="btn-primary"
            onClick={importer}
            disabled={enImport || nbItemsSelectionnes === 0}
          >
            {enImport
              ? "Import…"
              : "Importer " + postes.filter((p) => p.selectionne).length + " équipement(s)"}
          </button>
        )}
      </footer>
    </div>
  );
}

function ImportItemTable({ titre, items, onChange, onDelete, onAdd, avecQuantite }) {
  return (
    <div className="import-item-group">
      <div className="reg-subheading">{titre}</div>
      {items.length === 0 ? (
        <p className="empty-state-description" style={{ margin: "4px 0" }}>
          Aucune ligne.
        </p>
      ) : (
        <table className="data-table import-edit-table">
          <thead>
            <tr>
              <th>Désignation</th>
              {avecQuantite && (
                <>
                  <th style={{ width: 70 }}>Qté</th>
                  <th style={{ width: 70 }}>Unité</th>
                </>
              )}
              <th style={{ width: 32 }}></th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td>
                  <input
                    className="import-edit-input"
                    value={item.designation}
                    onChange={(e) => onChange(item.id, "designation", e.target.value)}
                    placeholder="Désignation"
                  />
                </td>
                {avecQuantite && (
                  <>
                    <td>
                      <input
                        type="number"
                        className="import-edit-input"
                        value={item.quantite}
                        onChange={(e) => onChange(item.id, "quantite", Number(e.target.value))}
                      />
                    </td>
                    <td>
                      <input
                        className="import-edit-input"
                        value={item.unite}
                        onChange={(e) => onChange(item.id, "unite", e.target.value)}
                      />
                    </td>
                  </>
                )}
                <td>
                  <button className="btn-ghost btn-danger" onClick={() => onDelete(item.id)}>
                    ×
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <button className="linkish" style={{ marginTop: 8 }} onClick={onAdd}>
        + Ajouter une ligne
      </button>
    </div>
  );
}
