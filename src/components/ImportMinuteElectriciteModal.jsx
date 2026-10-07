import { useRef, useState } from "react";
import { collection, serverTimestamp, updateDoc, doc } from "firebase/firestore";
import { db } from "../firebase";
import { ecrireDevisElec, ecrireParLots, preparerAutomatismeDepuisMinute } from "../lib/importCroise";
import { analyserMinuteElectricite, DESIGNATION_VIDE } from "../lib/parseMinuteElectricite";
import {
  calculerMiseAJour,
  champsDocumentLigne,
  groupesDuFichier,
  trouverDevisCorrespondant,
} from "../lib/majMinuteElectricite";

// Import d'une minute de devis pour un chantier Électricité : contrairement
// à l'Automatisme (qui regroupe les lignes en équipements), on garde ici
// la structure du devis telle quelle et on en fait un nouvel onglet
// ("elecDevis"), avec toutes ses lignes ("elecLignes") prêtes à recevoir un
// % d'avancement.
//
// Un fichier déjà importé peut aussi être ré-importé sur son devis : seules
// les lignes nouvelles ou modifiées sont alors appliquées (voir
// lib/majMinuteElectricite.js), sans toucher aux avancements saisis.
export default function ImportMinuteElectriciteModal({
  chantierId,
  nbDevisExistants,
  devisExistants = [],
  toutesLignes = [],
  onClose,
}) {
  const [sequence, setSequence] = useState(null);
  const [nomFichier, setNomFichier] = useState("");
  const [nomDevis, setNomDevis] = useState("");
  const [erreur, setErreur] = useState("");
  const [enLecture, setEnLecture] = useState(false);
  const [enImport, setEnImport] = useState(false);
  // "nouveau" : crée un onglet de devis ; "maj" : met à jour devisCibleId.
  const [mode, setMode] = useState("nouveau");
  const [devisCibleId, setDevisCibleId] = useState("");
  const [supprimerAbsentes, setSupprimerAbsentes] = useState(false);
  const bufferRef = useRef(null);
  const [preparerAuto, setPreparerAuto] = useState(true);
  const [bilan, setBilan] = useState("");

  const handleFichier = async (e) => {
    const fichier = e.target.files?.[0];
    if (!fichier) return;
    setErreur("");
    setEnLecture(true);
    setNomFichier(fichier.name);
    setNomDevis(fichier.name.replace(/\.[^.]+$/, ""));
    try {
      const buffer = await fichier.arrayBuffer();
      bufferRef.current = buffer;
      const resultat = analyserMinuteElectricite(buffer);
      setSequence(resultat);
      // Même nom de fichier qu'un devis déjà importé : on propose d'emblée
      // la mise à jour de ce devis plutôt que d'en créer un doublon.
      const memeFichier = trouverDevisCorrespondant(fichier.name, devisExistants);
      setMode(memeFichier ? "maj" : "nouveau");
      setDevisCibleId(memeFichier?.id ?? devisExistants[0]?.id ?? "");
      setSupprimerAbsentes(false);
    } catch (err) {
      setErreur("Impossible de lire ce fichier : " + err.message);
      setSequence(null);
    } finally {
      setEnLecture(false);
    }
  };

  const nbLignes = (sequence ?? []).filter((l) => !l.estPoste).length;
  const nbPostes = (sequence ?? []).filter((l) => l.estPoste).length;
  const nbSansDesignation = (sequence ?? []).filter((l) => l.sansDesignation).length;

  const devisCible = devisExistants.find((d) => d.id === devisCibleId) ?? null;
  const modeMaj = mode === "maj" && devisCible !== null;
  const diff =
    modeMaj && sequence
      ? calculerMiseAJour(
          sequence,
          toutesLignes.filter((l) => l.devisId === devisCible.id)
        )
      : null;
  const nbAbsentesAvecAvancement = diff
    ? diff.absentes.filter((l) => (l.avancementFo || 0) > 0 || (l.avancementMo || 0) > 0).length
    : 0;
  const nbChangements = diff ? diff.ajouts.length + diff.modifications.length : 0;
  const nbSuppressions = diff && supprimerAbsentes ? diff.absentes.length : 0;

  const importer = async () => {
    if (!sequence || !nomDevis.trim()) return;
    setEnImport(true);
    try {
      await ecrireDevisElec({
        chantierId,
        nomDevis,
        nomFichier,
        sequence,
        ordre: nbDevisExistants,
      });
      if (preparerAuto && bufferRef.current) {
        const msg = await preparerAutomatismeDepuisMinute(bufferRef.current, chantierId);
        setBilan(msg);
        setEnImport(false);
        return;
      }
      onClose();
    } catch (err) {
      setErreur("Erreur pendant l'import : " + err.message);
    } finally {
      setEnImport(false);
    }
  };

  // Mise à jour d'un devis existant : n'écrit que le delta (lignes
  // ajoutées, champs modifiés, décalages d'ordre, et éventuellement les
  // lignes disparues du fichier). Les % d'avancement, le regroupement et
  // les types FO/MO déjà saisis ne sont jamais touchés.
  const appliquerMiseAJour = async () => {
    if (!diff || !devisCible) return;
    setEnImport(true);
    try {
      // Regroupements du fichier : on ne crée un groupe que si aucune de ses
      // lignes déjà présentes n'est déjà groupée (le groupement fait dans
      // l'appli n'est jamais modifié).
      const refAjout = new Map(diff.ajouts.map((l) => [l, doc(collection(db, "elecLignes"))]));
      const idDe = (i) => diff.idsFichier[i] ?? refAjout.get(sequence[i])?.id ?? null;
      const dejaGroupe = new Set(
        toutesLignes.filter((l) => l.devisId === devisCible.id && l.groupeId).map((l) => l.id)
      );
      const groupeAjout = new Map();
      const groupeExistante = [];
      const creationsGroupes = [];
      groupesDuFichier(sequence).forEach((g) => {
        const ids = g.membres.map(idDe);
        if (ids.some((id) => id == null || dejaGroupe.has(id))) return;
        const ref = doc(collection(db, "elecGroupes"));
        creationsGroupes.push((batch) =>
          batch.set(ref, {
            chantierId,
            devisId: devisCible.id,
            nom: g.nom,
            ligneRepresentativeId: idDe(g.tete),
            creeLe: serverTimestamp(),
          })
        );
        g.membres.forEach((i) => {
          if (refAjout.has(sequence[i])) groupeAjout.set(sequence[i], ref.id);
          else groupeExistante.push({ id: idDe(i), groupeId: ref.id });
        });
      });
      const operations = [
        ...creationsGroupes,
        ...groupeExistante.map((m) => (batch) => {
          batch.update(doc(db, "elecLignes", m.id), { groupeId: m.groupeId });
        }),
        ...diff.ajouts.map((ligne) => (batch) => {
          batch.set(refAjout.get(ligne), {
            ...champsDocumentLigne(ligne),
            ...(groupeAjout.has(ligne) ? { groupeId: groupeAjout.get(ligne) } : {}),
            devisId: devisCible.id,
            chantierId,
            creeLe: serverTimestamp(),
          });
        }),
        ...diff.modifications.map((m) => (batch) => {
          batch.update(doc(db, "elecLignes", m.id), m.patch);
        }),
        ...diff.repositionnees.map((r) => (batch) => {
          batch.update(doc(db, "elecLignes", r.id), { ordre: r.ordre });
        }),
        ...(supprimerAbsentes
          ? diff.absentes.map((l) => (batch) => {
              batch.delete(doc(db, "elecLignes", l.id));
            })
          : []),
      ];
      await ecrireParLots(operations);
      await updateDoc(doc(db, "elecDevis", devisCible.id), { nomFichier });
      onClose();
    } catch (err) {
      setErreur("Erreur pendant la mise à jour : " + err.message);
    } finally {
      setEnImport(false);
    }
  };

  if (bilan) {
    return (
      <div className="modal-backdrop" onClick={onClose}>
        <div className="modal" onClick={(e) => e.stopPropagation()}>
          <h2>Minute importée</h2>
          <p className="simple-list-meta" style={{ margin: "8px 0" }}>✅ Électricité : devis importé.</p>
          <p className="simple-list-meta" style={{ margin: "8px 0 16px" }}>{bilan}</p>
          <div className="modal-actions">
            <button type="button" className="btn-primary" onClick={onClose}>
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

          {sequence && nbSansDesignation > 0 && (
            <p className="empty-state-description" style={{ margin: "0 0 12px" }}>
              ⚠ {nbSansDesignation} ligne(s) sans description dans ce fichier : importée(s) sous
              la désignation « {DESIGNATION_VIDE} ».
            </p>
          )}

          {sequence && devisExistants.length > 0 && (
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap", margin: "0 0 14px" }}>
              <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <input
                  type="radio"
                  checked={mode === "nouveau"}
                  onChange={() => setMode("nouveau")}
                />
                Nouveau devis
              </label>
              <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <input type="radio" checked={mode === "maj"} onChange={() => setMode("maj")} />
                Mettre à jour un devis existant
              </label>
              {mode === "maj" && (
                <select value={devisCibleId} onChange={(e) => setDevisCibleId(e.target.value)}>
                  {devisExistants.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.nom}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          {sequence && diff && (
            <div>
              <p className="page-subtitle" style={{ margin: "0 0 10px" }}>
                {diff.ajouts.length} nouvelle(s) ligne(s) · {diff.modifications.length}{" "}
                modifiée(s) · {diff.inchangees} inchangée(s)
                {diff.absentes.length > 0 && " · " + diff.absentes.length + " absente(s) du fichier"}
              </p>
              {nbChangements === 0 && diff.absentes.length === 0 && (
                <p className="empty-state-description">
                  Ce fichier est identique au devis « {devisCible.nom} » : rien à mettre à jour.
                </p>
              )}
              {nbChangements > 0 && (
                <div className="hscroll-auto" style={{ overflowX: "auto" }}>
                  <table className="data-table import-edit-table">
                    <thead>
                      <tr>
                        <th style={{ width: 90 }}>Changement</th>
                        <th>Ligne</th>
                        <th>Détail</th>
                      </tr>
                    </thead>
                    <tbody>
                      {diff.ajouts.slice(0, 60).map((l, i) => (
                        <tr key={"a" + i}>
                          <td data-label="Changement">Ajoutée</td>
                          <td data-label="Ligne">
                            {l.code ? l.code + " — " : ""}
                            {l.designation}
                          </td>
                          <td data-label="Détail">
                            {l.estPoste ? "Poste" : [l.quantite ? "Qté " + l.quantite : "", l.unite].filter(Boolean).join(" ")}
                          </td>
                        </tr>
                      ))}
                      {diff.modifications.slice(0, 60).map((m) => (
                        <tr key={m.id}>
                          <td data-label="Changement">Modifiée</td>
                          <td data-label="Ligne">
                            {m.ligne.code ? m.ligne.code + " — " : ""}
                            {m.ligne.designation}
                          </td>
                          <td data-label="Détail">
                            {m.details
                              .map((d) => d.label + " : " + (String(d.avant) || "∅") + " → " + (String(d.apres) || "∅"))
                              .join(" ; ")}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {nbChangements > 60 && (
                <p className="empty-state-description" style={{ margin: "8px 0 0" }}>
                  Aperçu limité à 60 lignes par catégorie ; toutes les lignes seront bien mises à
                  jour.
                </p>
              )}
              {diff.absentes.length > 0 && (
                <label style={{ display: "flex", gap: 6, alignItems: "flex-start", marginTop: 12 }}>
                  <input
                    type="checkbox"
                    checked={supprimerAbsentes}
                    onChange={(e) => setSupprimerAbsentes(e.target.checked)}
                  />
                  <span>
                    Supprimer les {diff.absentes.length} ligne(s) du devis qui ne sont plus dans le
                    fichier
                    {nbAbsentesAvecAvancement > 0 &&
                      " (dont " + nbAbsentesAvecAvancement + " avec un avancement déjà saisi)"}
                    . Sinon elles sont conservées telles quelles.
                  </span>
                </label>
              )}
              <p className="empty-state-description" style={{ margin: "10px 0 0" }}>
                Les % d'avancement, le regroupement et les types FO/MO déjà saisis ne sont pas
                modifiés.
              </p>
            </div>
          )}

          {sequence && !diff && (
            <div>
              <label>
                Nom du devis (visible comme onglet)
                <input value={nomDevis} onChange={(e) => setNomDevis(e.target.value)} required />
              </label>
              <label style={{ display: "flex", gap: 6, alignItems: "flex-start", marginTop: 10 }}>
                <input
                  type="checkbox"
                  checked={preparerAuto}
                  onChange={(e) => setPreparerAuto(e.target.checked)}
                />
                <span>
                  Préparer aussi l'Automatisme avec cette minute (équipements, matériel et tâches), si le
                  chantier n'en a pas encore.
                </span>
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
                          {ligne.estPoste ? "" : ligne.coutTotalFo ? ligne.coutTotalFo.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €" : ""}
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
          {sequence && !diff && (
            <button
              className="btn-primary"
              onClick={importer}
              disabled={enImport || !nomDevis.trim()}
            >
              {enImport ? "Import…" : "Importer " + nbLignes + " ligne(s)"}
            </button>
          )}
          {sequence && diff && (
            <button
              className="btn-primary"
              onClick={appliquerMiseAJour}
              disabled={
                enImport ||
                nbChangements + diff.repositionnees.length + nbSuppressions === 0
              }
            >
              {enImport
                ? "Mise à jour…"
                : "Appliquer la mise à jour (" +
                  nbChangements +
                  " changement" +
                  (nbChangements > 1 ? "s" : "") +
                  ")"}
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}
