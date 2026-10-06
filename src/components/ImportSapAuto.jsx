import { useEffect, useRef, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useCollection } from "../lib/firestoreHooks";
import { otpDepuisCompte } from "../lib/parseSapExports";
import { autoriser, dossierSupporte, lireDossierMemorise } from "../lib/dossierExportSap";
import {
  autoActif,
  executerExtraction,
  isoAujourdhui,
  lireParamsSap,
  optionsValidation,
  validerParametres,
} from "../lib/extractionSap";

// Import SAP automatique à la connexion des profils RA Électricité et admin :
// achats (ME2J) puis heures (ZCAT3) de tous les chantiers ayant un compte,
// sur les 12 derniers mois pour les heures. Une fois par connexion (onglet)
// et au plus toutes les 4 h par poste ; désactivable dans Import SAP >
// Paramètres SAP > Réglages SAP.
//
// Le navigateur n'autorise la lecture du dossier d'export qu'après un clic
// tant que l'autorisation n'est pas « persistante » (Chrome/Edge proposent
// « Autoriser à chaque visite ») : dans ce cas un bandeau propose de lancer
// l'import d'un clic au lieu de le démarrer seul.
const DELAI_MINI = 4 * 60 * 60 * 1000;
const CLE_DERNIERE = "sapAutoDerniere";

// Le composant interne (qui charge les chantiers) n'est monté que pour les
// profils concernés, pour ne pas lire la collection inutilement ailleurs.
export default function ImportSapAuto() {
  const { user, profile, isAdmin } = useAuth();
  if (!user || !(isAdmin || profile?.role === "ra_electricite")) return null;
  return <ImportSapAutoInterne user={user} />;
}

function ImportSapAutoInterne({ user }) {
  const autorise = true;
  const { documents: chantiers, chargement } = useCollection("sites");
  const [etat, setEtat] = useState(null);
  const [enAttenteClic, setEnAttenteClic] = useState(null);
  const annule = useRef(false);
  const tente = useRef(false);

  const demarrer = async (handle, otp) => {
    const debut = isoAujourdhui(-1);
    const fin = isoAujourdhui();
    const params = lireParamsSap();
    const problemes = ["fo", "mo"].flatMap((t) =>
      validerParametres(params, otp, optionsValidation(t, debut, fin))
    );
    if (problemes.length > 0) return;
    annule.current = false;
    const res = await executerExtraction({
      handle,
      types: ["fo", "mo"],
      otp,
      debut,
      fin,
      params,
      onEtat: setEtat,
      estAnnule: () => annule.current,
    });
    if (res.ok) {
      try {
        localStorage.setItem(CLE_DERNIERE, String(Date.now()));
      } catch {
        /* ignoré */
      }
    }
  };

  useEffect(() => {
    if (!autorise || chargement || tente.current) return;
    if (!chantiers || chantiers.length === 0) return;
    tente.current = true;
    if (!dossierSupporte() || !autoActif()) return;
    const cleSession = "sapAutoFait:" + user.uid;
    try {
      if (sessionStorage.getItem(cleSession)) return;
      sessionStorage.setItem(cleSession, "1");
      const derniere = Number(localStorage.getItem(CLE_DERNIERE) || 0);
      if (Date.now() - derniere < DELAI_MINI) return;
    } catch {
      /* stockage indisponible : on tente quand même */
    }
    const otp = [...new Set(chantiers.map((c) => otpDepuisCompte(c.compte)).filter(Boolean))].sort();
    if (otp.length === 0) return;

    (async () => {
      const handle = await lireDossierMemorise();
      if (!handle) return; // gestionnaire non configuré sur ce poste
      let accorde = false;
      try {
        accorde = (await handle.queryPermission({ mode: "read" })) === "granted";
      } catch {
        return;
      }
      if (accorde) demarrer(handle, otp);
      else setEnAttenteClic({ handle, otp });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autorise, chargement, chantiers, user]);

  useEffect(
    () => () => {
      annule.current = true;
    },
    []
  );

  if (!autorise) return null;

  if (enAttenteClic) {
    return (
      <div className="sap-auto-toast" role="status">
        <span>Import SAP automatique prêt (achats et heures).</span>
        <div className="sap-auto-actions">
          <button
            type="button"
            className="btn btn-primary"
            onClick={async () => {
              const { handle, otp } = enAttenteClic;
              setEnAttenteClic(null);
              if (await autoriser(handle)) demarrer(handle, otp);
              else setEtat({ phase: "erreur", message: "Accès au dossier d'export refusé." });
            }}
          >
            ▶ Lancer
          </button>
          <button type="button" className="btn" onClick={() => setEnAttenteClic(null)}>
            Plus tard
          </button>
        </div>
      </div>
    );
  }

  if (!etat) return null;
  const enCours = etat.phase === "attente" || etat.phase === "import";
  return (
    <div className={"sap-auto-toast" + (etat.phase === "erreur" ? " erreur" : "")} role="status">
      <span>
        {etat.phase === "ok" && "✅ Import SAP : "}
        {etat.phase === "erreur" && "⚠ Import SAP : "}
        {enCours && "⏳ Import SAP : "}
        {etat.message}
      </span>
      <div className="sap-auto-actions">
        {enCours ? (
          <button
            type="button"
            className="btn"
            onClick={() => {
              annule.current = true;
              setEtat(null);
            }}
          >
            Annuler
          </button>
        ) : (
          <button type="button" className="btn" onClick={() => setEtat(null)}>
            Fermer
          </button>
        )}
      </div>
    </div>
  );
}
