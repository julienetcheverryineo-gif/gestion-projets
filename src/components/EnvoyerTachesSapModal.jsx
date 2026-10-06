import { useRef, useState } from "react";
import { autoriser, choisirDossier, dossierSupporte, lireDossierMemorise } from "../lib/dossierExportSap";
import { envoyerTachesSap, lireParamsSap } from "../lib/extractionSap";

// Envoi des tâches du chantier vers SAP (transaction ZCA_TACHES) : on liste
// les tâches utilisées dans les devis, l'utilisateur coche celles à créer,
// puis le gestionnaire SAP installé sur le poste les saisit et les enregistre.
// Les tâches déjà présentes dans SAP pour ce compte ne sont pas recréées.
export default function EnvoyerTachesSapModal({ compte, taches, onClose }) {
  const [cochees, setCochees] = useState(() => new Set(taches.map((t) => t.code)));
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
    annule.current = false;
    await envoyerTachesSap({
      handle: h,
      params: lireParamsSap(),
      compte,
      taches: taches.filter((t) => cochees.has(t.code)).map((t) => ({ code: t.code, libelle: t.libelle.slice(0, 40) })),
      onEtat: setEtat,
      estAnnule: () => annule.current,
    });
  };

  return (
    <div className="modal-backdrop" onClick={enCours ? undefined : onClose}>
      <div className="modal" style={{ maxWidth: 640 }} onClick={(e) => e.stopPropagation()}>
        <h2>Envoyer les tâches vers SAP</h2>
        <p className="simple-list-meta" style={{ marginBottom: 10 }}>
          Transaction ZCA_TACHES, compte <strong>{compte}</strong>. Les tâches déjà présentes dans SAP
          ne sont pas recréées. Libellés limités à 40 caractères.
        </p>
        {taches.length === 0 ? (
          <p className="simple-list-meta">Aucune tâche (type de FO) n'est utilisée dans les devis de ce chantier.</p>
        ) : (
          <div style={{ maxHeight: "45vh", overflow: "auto", marginBottom: 10 }}>
            {taches.map((t) => (
              <label key={t.code} className="team-checklist-item">
                <input
                  type="checkbox"
                  disabled={enCours}
                  checked={cochees.has(t.code)}
                  onChange={() => bascule(t.code)}
                />
                <span style={{ width: 60, display: "inline-block" }}>{t.code}</span>
                {t.libelle}
                {t.libelle.length > 40 ? " ⚠ tronqué" : ""}
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
            disabled={enCours || cochees.size === 0 || !compte}
            onClick={envoyer}
          >
            📤 Envoyer {cochees.size} tâche(s) vers SAP
          </button>
        </div>
      </div>
    </div>
  );
}
