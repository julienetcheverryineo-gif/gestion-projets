import { useState } from "react";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase";
import { analyserClasseur, grouperParProfondeur } from "../lib/parseDevis";

export default function ImportDevisModal({ chantierId, onClose }) {
  const [analyse, setAnalyse] = useState(null); // { sequence, niveaux }
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
      const resultat = analyserClasseur(buffer);
      if (resultat.niveaux.length === 0) {
        setErreur(
          "Aucun équipement détecté dans ce fichier. Vérifiez qu'il suit bien le même modèle de minute de devis (colonnes n°, Référence, Description, Unité, Qté, Type de FO, Type MO)."
        );
        setAnalyse(null);
      } else if (resultat.niveaux.length === 1) {
        // Un seul niveau de regroupement possible : on saute directement à l'aperçu
        genererPostes(resultat, resultat.niveaux[0].profondeur);
        setAnalyse(resultat);
      } else {
        setAnalyse(resultat);
      }
    } catch (err) {
      setErreur("Impossible de lire ce fichier : " + err.message);
      setAnalyse(null);
    } finally {
      setEnLecture(false);
    }
  };

  const genererPostes = (resultat, profondeur) => {
    const detectes = grouperParProfondeur(resultat.sequence, profondeur);
    setPostes(
      detectes.map((p) => ({
        ...p,
        selectionne: true,
        nomEdite: p.nom,
        qteResolu: (p.facteur || 1) <= 1,
      }))
    );
    setPosteOuvert(0);
  };

  const multiplierQuantites = (index) => {
    setPostes((prev) =>
      prev.map((p, i) => {
        if (i !== index) return p;
        return {
          ...p,
          qteResolu: true,
          items: p.items.map((it) =>
            it.type === "materiel" ? { ...it, quantite: (it.quantite || 0) * p.facteur } : it
          ),
        };
      })
    );
  };

  const dupliquerPoste = (index) => {
    setPostes((prev) => {
      const poste = prev[index];
      const copies = Array.from({ length: poste.facteur }, (_, n) => ({
        ...poste,
        nomEdite: poste.nomEdite + " (" + (n + 1) + "/" + poste.facteur + ")",
        facteur: 1,
        qteResolu: true,
        items: poste.items.map((it) => ({ ...it, id: it.id + "-copie" + n })),
      }));
      return [...prev.slice(0, index), ...copies, ...prev.slice(index + 1)];
    });
    setPosteOuvert(null);
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

  const etapeChoixNiveau = analyse && !postes;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="import-popup" onClick={(e) => e.stopPropagation()}>
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
          {!analyse && (
            <div className="import-drop">
              <p className="empty-state-description" style={{ margin: "0 0 16px" }}>
                Sélectionnez le fichier Excel (.xlsx) de la minute de devis. Chaque poste
                détecté devient un équipement régulé, avec son matériel et ses tâches déjà
                triés — tout reste modifiable avant import.
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

          {etapeChoixNiveau && (
            <div>
              <p className="empty-state-description" style={{ margin: "0 0 16px" }}>
                Ce fichier a plusieurs niveaux de regroupement. À quel niveau se trouve le nom
                de vos équipements ? Tout ce qui est en dessous (sous-groupes, matériel,
                tâches) sera rattaché à l'équipement choisi.
              </p>
              <div className="niveau-choix-list">
                {analyse.niveaux.map((n) => (
                  <button
                    key={n.profondeur}
                    className="niveau-choix-card"
                    onClick={() => genererPostes(analyse, n.profondeur)}
                  >
                    <div className="niveau-choix-titre">
                      Niveau {n.profondeur + 1} — {n.count} équipement(s)
                    </div>
                    <div className="niveau-choix-exemple">Exemple : « {n.exemple} »</div>
                  </button>
                ))}
              </div>
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

                    {!poste.qteResolu && (
                      <div className="qte-poste-banner">
                        <span>
                          Ce poste a une quantité de <strong>{poste.facteur}</strong> dans le
                          devis. Comment l'importer ?
                        </span>
                        <div style={{ display: "flex", gap: 8 }}>
                          <button
                            className="btn-ghost"
                            onClick={() => multiplierQuantites(index)}
                          >
                            Multiplier le matériel ×{poste.facteur}
                          </button>
                          <button className="btn-ghost" onClick={() => dupliquerPoste(index)}>
                            Créer {poste.facteur} équipements séparés
                          </button>
                        </div>
                      </div>
                    )}

                    {ouvert && (
                      <div className="import-item-edit">
                        <ImportItemTable
                          titre="Matériel"
                          type="materiel"
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
                          type="tache"
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
    </div>
  );
}

function ImportItemTable({ titre, type, items, onChange, onDelete, onAdd, avecQuantite }) {
  return (
    <div className={"import-item-group item-section-" + type}>
      <div className={"reg-subheading reg-subheading-" + type}>
        <span className="reg-subheading-icon">{type === "materiel" ? "🔧" : "☑"}</span>
        {titre}
      </div>
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
