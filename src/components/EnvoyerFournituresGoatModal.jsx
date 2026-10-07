import { useRef, useState } from "react";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "../firebase";
import { autoriser, choisirDossier, dossierSupporte, lireDossierMemorise } from "../lib/dossierExportSap";
import { envoyerFournituresGoat } from "../lib/extractionSap";
import { CHEMIN_GOAT_DEFAUT } from "../lib/goatScripts";

const formatEuro = (n) => Number(n || 0).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const CLE_CHEMIN = "goatCheminBase";

function cheminMemorise() {
  try {
    return localStorage.getItem(CLE_CHEMIN) || CHEMIN_GOAT_DEFAUT;
  } catch {
    return CHEMIN_GOAT_DEFAUT;
  }
}

// Envoi des lignes Fourniture du chantier (une par type de FO) vers la table
// Fourniture de la base GOAT, via le gestionnaire installé sur le poste.
// Une ligne existante (même AffaireID + Code) est mise à jour, sinon ajoutée.
export default function EnvoyerFournituresGoatModal({ chantierId, chantier, lignes, mode = "fourniture", onClose }) {
  const estMo = mode === "mo";
  const [affaireId, setAffaireId] = useState(String(chantier?.affaireIdGoat ?? ""));
  const [chemin, setChemin] = useState(cheminMemorise);
  const [cochees, setCochees] = useState(() => new Set(lignes.map((l) => l.code)));
  const [etat, setEtat] = useState(null);
  const annule = useRef(false);
  const enCours = etat?.phase === "attente";

  const bascule = (code) =>
    setCochees((prev) => {
      const s = new Set(prev);
      if (s.has(code)) s.delete(code);
      else s.add(code);
      return s;
    });

  const selection = lignes.filter((l) => cochees.has(l.code));
  const idValide = /^\d{1,9}$/.test(affaireId.trim());
  const cheminValide = /^([A-Za-z]:|\\\\).{3,}\.(accdb|mdb)$/i.test(chemin.trim());

  const envoyer = async () => {
    if (!dossierSupporte()) {
      return setEtat({ phase: "erreur", message: "Ce navigateur ne permet pas d'accéder au dossier d'export (utilisez Chrome ou Edge)." });
    }
    let h = null;
    try {
      h = await lireDossierMemorise();
      if (!h) h = await choisirDossier();
      if (!(await autoriser(h))) return setEtat({ phase: "erreur", message: "Accès au dossier d'export refusé." });
    } catch (e) {
      if (e?.name !== "AbortError") setEtat({ phase: "erreur", message: "Dossier non accessible : " + e.message });
      return;
    }
    try {
      localStorage.setItem(CLE_CHEMIN, chemin.trim());
    } catch {
      /* ignoré */
    }
    if (String(chantier?.affaireIdGoat ?? "") !== affaireId.trim()) {
      try {
        await updateDoc(doc(db, "sites", chantierId), { affaireIdGoat: Number(affaireId.trim()) });
      } catch (e) {
        return setEtat({ phase: "erreur", message: "AffaireID non enregistré : " + e.message });
      }
    }
    annule.current = false;
    await envoyerFournituresGoat({
      handle: h,
      cheminBase: chemin,
      affaireId: affaireId.trim(),
      lignes: selection,
      mode,
      onEtat: setEtat,
      estAnnule: () => annule.current,
    });
  };

  return (
    <div className="modal-backdrop" onClick={enCours ? undefined : onClose}>
      <div className="modal" style={{ maxWidth: 720 }} onClick={(e) => e.stopPropagation()}>
        <h2>{estMo ? "Envoyer la main d'œuvre vers GOAT" : "Envoyer les fournitures vers GOAT"}</h2>
        <p className="simple-list-meta" style={{ marginBottom: 10 }}>
          {estMo ? (
            <>
              Table <strong>MainOeuvre</strong> de la base GOAT : AffaireID, SegmentCode (poste, 8 caractères),
              SegmentLibelle, HeuresBudget (heures prévues).
            </>
          ) : (
            <>
              Table <strong>Fourniture</strong> de la base GOAT : AffaireID, TypeID (1 fourniture, 2 sous-traitant),
              Code et Libellé SAP, Budget matériel.
            </>
          )}{" "}
          Une ligne déjà présente (même affaire + même code) est mise à jour. Une copie de sauvegarde de la base
          est faite avant l'écriture.
        </p>
        <div className="form-inline" style={{ marginBottom: 10 }}>
          <label>
            AffaireID GOAT
            <input
              value={affaireId}
              disabled={enCours}
              inputMode="numeric"
              onChange={(e) => setAffaireId(e.target.value)}
              placeholder="ex : 111"
            />
          </label>
          <label style={{ flex: 3 }}>
            Fichier GOAT
            <input value={chemin} disabled={enCours} onChange={(e) => setChemin(e.target.value)} />
          </label>
        </div>
        {lignes.length === 0 ? (
          <p className="simple-list-meta">Aucune donnée à envoyer dans les devis de ce chantier.</p>
        ) : (
          <div style={{ maxHeight: "40vh", overflow: "auto", marginBottom: 10 }}>
            {lignes.map((l) => (
              <label key={l.code} className="team-checklist-item">
                <input type="checkbox" disabled={enCours} checked={cochees.has(l.code)} onChange={() => bascule(l.code)} />
                <span style={{ width: 70, display: "inline-block" }}>{l.code}</span>
                {!estMo && (
                  <span style={{ width: 24, display: "inline-block" }} title={l.typeId === 2 ? "Sous-traitant" : "Fourniture"}>
                    {l.typeId}
                  </span>
                )}
                {l.libelle} — {estMo ? formatEuro(l.heures) + " h" : formatEuro(l.budget) + " €"}
              </label>
            ))}
          </div>
        )}
        {etat && (
          <div className={etat.phase === "erreur" ? "form-error" : "simple-list-meta"} style={{ marginBottom: 10 }}>
            {etat.phase === "ok" ? "✅ " : etat.phase === "erreur" ? "⚠ " : "⏳ "}
            {etat.message}
          </div>
        )}
        <div className="modal-actions">
          {enCours ? (
            <button type="button" className="btn-ghost" onClick={() => (annule.current = true)}>
              Arrêter d'attendre
            </button>
          ) : (
            <button type="button" className="btn-ghost" onClick={onClose}>
              Fermer
            </button>
          )}
          <button
            type="button"
            className="btn-primary"
            disabled={enCours || selection.length === 0 || !idValide || !cheminValide}
            onClick={envoyer}
          >
            📤 Envoyer {selection.length} ligne(s) vers GOAT
          </button>
        </div>
      </div>
    </div>
  );
}
