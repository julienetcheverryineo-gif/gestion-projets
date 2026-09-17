import { useState } from "react";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase";
import { parseSuiviChantiers } from "../lib/parseSuiviChantiers";

export default function ImportSuiviModal({ chantiersExistants, utilisateurs, onClose }) {
  const [chantiers, setChantiers] = useState(null);
  const [nonApparies, setNonApparies] = useState([]);
  const [nomFichier, setNomFichier] = useState("");
  const [erreur, setErreur] = useState("");
  const [enLecture, setEnLecture] = useState(false);
  const [enImport, setEnImport] = useState(false);
  const [resultat, setResultat] = useState(null);

  const trouverExistant = (nom) =>
    chantiersExistants.find((c) => c.nom.trim().toLowerCase() === nom.trim().toLowerCase());

  const handleFichier = async (e) => {
    const fichier = e.target.files?.[0];
    if (!fichier) return;
    setErreur("");
    setEnLecture(true);
    setNomFichier(fichier.name);
    try {
      const buffer = await fichier.arrayBuffer();
      const { chantiers: detectes, nonApparies: manquants } = parseSuiviChantiers(
        buffer,
        utilisateurs
      );
      if (detectes.length === 0) {
        setErreur("Aucun chantier avec des tâches détecté dans ce fichier.");
        setChantiers(null);
      } else {
        setChantiers(detectes);
        setNonApparies(manquants);
      }
    } catch (err) {
      setErreur("Impossible de lire ce fichier : " + err.message);
      setChantiers(null);
    } finally {
      setEnLecture(false);
    }
  };

  const basculer = (index) => {
    setChantiers((prev) =>
      prev.map((c, i) => (i === index ? { ...c, selectionne: !c.selectionne } : c))
    );
  };

  const nbTachesSelectionnees = (chantiers ?? [])
    .filter((c) => c.selectionne)
    .reduce((s, c) => s + c.taches.length, 0);

  const importer = async () => {
    const aImporter = chantiers.filter((c) => c.selectionne);
    if (aImporter.length === 0) return;
    setEnImport(true);
    let nbChantiersCrees = 0;
    let nbTaches = 0;
    try {
      for (const c of aImporter) {
        let chantierId;
        const existant = trouverExistant(c.nom);
        if (existant) {
          chantierId = existant.id;
        } else {
          const ref = await addDoc(collection(db, "sites"), {
            nom: c.nom,
            client: "",
            adresse: "",
            statut: "actif",
            compte: c.compte || "",
            creeLe: serverTimestamp(),
          });
          chantierId = ref.id;
          nbChantiersCrees += 1;
        }
        for (const t of c.taches) {
          await addDoc(collection(db, "tasks"), {
            ...t,
            chantierId,
            statut: "a_faire",
            creeLe: serverTimestamp(),
          });
          nbTaches += 1;
        }
      }
      setResultat({ nbChantiersCrees, nbTaches });
    } catch (err) {
      setErreur("Erreur pendant l'import : " + err.message);
    } finally {
      setEnImport(false);
    }
  };

  if (resultat) {
    return (
      <div className="modal-backdrop" onClick={onClose}>
        <div className="modal" onClick={(e) => e.stopPropagation()}>
          <h2>Import terminé ✓</h2>
          <p className="empty-state-description">
            {resultat.nbChantiersCrees} chantier(s) créé(s), {resultat.nbTaches} tâche(s)
            ajoutée(s). Vous pouvez fermer cette fenêtre et vérifier dans "Chantiers" et
            "Tâches".
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
      <div className="import-popup" onClick={(e) => e.stopPropagation()}>
        <header className="import-fullscreen-header">
          <div>
            <h2>Importer le fichier de suivi (une seule fois)</h2>
            {chantiers && (
              <p className="page-subtitle">
                {nomFichier} — {chantiers.length} chantier(s) détecté(s), {nbTachesSelectionnees}{" "}
                tâche(s) sélectionnée(s)
              </p>
            )}
          </div>
          <button className="btn-ghost" onClick={onClose} aria-label="Fermer">
            Fermer ✕
          </button>
        </header>

        <div className="import-fullscreen-body">
          <div className="qte-poste-banner" style={{ marginTop: 0, marginBottom: 16 }}>
            <span>
              ⚠️ Cet import est prévu pour être utilisé <strong>une seule fois</strong>. Le
              relancer créera des tâches en double (les chantiers déjà existants, eux, sont
              réutilisés automatiquement si le nom correspond exactement).
            </span>
          </div>

          {!chantiers && (
            <div className="import-drop">
              <p className="empty-state-description" style={{ margin: "0 0 16px" }}>
                Sélectionnez votre fichier "Chantiers en cours" (.xlsm/.xlsx). Chaque onglet
                client devient un chantier (ou se rattache à un chantier existant du même
                nom), et chaque ligne devient une tâche.
              </p>
              <label className="file-picker">
                <input type="file" accept=".xlsx,.xls,.xlsm" onChange={handleFichier} />
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

          {chantiers && nonApparies.length > 0 && (
            <div className="form-error" style={{ marginBottom: 16 }}>
              Ces noms du fichier ne correspondent à aucun compte de l'application (repris
              tels quels, à corriger manuellement après import) : {nonApparies.join(", ")}
            </div>
          )}

          {chantiers && (
            <div className="import-poste-list">
              {chantiers.map((c, index) => {
                const existant = trouverExistant(c.nom);
                return (
                  <div key={index} className="import-poste-row">
                    <div className="import-poste-header">
                      <label className="import-checkbox">
                        <input
                          type="checkbox"
                          checked={c.selectionne}
                          onChange={() => basculer(index)}
                        />
                      </label>
                      <strong style={{ flex: "1 1 220px" }}>{c.nom}</strong>
                      <span className="simple-list-meta">
                        {c.taches.length} tâche(s){c.compte ? " · " + c.compte : ""}
                        {existant ? " · chantier existant, réutilisé" : " · nouveau chantier"}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {erreur && chantiers && (
            <div className="form-error" style={{ marginTop: 10 }}>{erreur}</div>
          )}
        </div>

        <footer className="import-fullscreen-footer">
          <button type="button" className="btn-ghost" onClick={onClose}>
            Annuler
          </button>
          {chantiers && (
            <button
              className="btn-primary"
              onClick={importer}
              disabled={enImport || nbTachesSelectionnees === 0}
            >
              {enImport
                ? "Import…"
                : "Importer " + chantiers.filter((c) => c.selectionne).length + " chantier(s)"}
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}
