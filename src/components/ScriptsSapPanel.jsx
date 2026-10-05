import { useEffect, useMemo, useRef, useState } from "react";
import { useCollection } from "../lib/firestoreHooks";
import { otpDepuisCompte } from "../lib/parseSapExports";
import {
  DOSSIER_EXPORT_LOCAL,
  dateSap,
  PARAMS_SAP_DEFAUT,
  construireUrlLancement,
  genererInstallateur,
  genererScriptManuel,
  validerParametres,
} from "../lib/sapScripts";
import {
  autoriser,
  choisirDossier,
  dossierSupporte,
  lireDossierMemorise,
  lireFichier,
  ouvrirLien,
} from "../lib/dossierExportSap";
import { importerExportSap } from "../lib/importSapAuto";

const CLE_STOCKAGE = "scriptsSapParams";

function lireParams() {
  try {
    const brut = localStorage.getItem(CLE_STOCKAGE);
    if (brut) return { ...PARAMS_SAP_DEFAUT, ...JSON.parse(brut) };
  } catch {
    /* stockage indisponible */
  }
  return { ...PARAMS_SAP_DEFAUT };
}

function isoAujourdhui(decalageAnnees = 0) {
  const d = new Date();
  d.setFullYear(d.getFullYear() + decalageAnnees);
  return d.toISOString().slice(0, 10);
}

function telecharger(nom, contenu) {
  // .vbs encodé en ASCII : pas de BOM, saut de ligne CRLF déjà inclus.
  const blob = new Blob([contenu], { type: "text/plain;charset=us-ascii" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nom;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function ScriptsSapPanel() {
  const { documents: chantiers } = useCollection("sites");
  const [params, setParams] = useState(lireParams);
  const [otp, setOtp] = useState([]);
  const [menuOuvert, setMenuOuvert] = useState(false);
  const [recherche, setRecherche] = useState("");
  const [debut, setDebut] = useState(isoAujourdhui(-1));
  const [fin, setFin] = useState(isoAujourdhui());
  const [erreurs, setErreurs] = useState([]);
  const [ouvert, setOuvert] = useState(false);
  const refMenu = useRef(null);
  const [dossier, setDossier] = useState(null);
  const [etat, setEtat] = useState(null); // { phase, type, message }
  const annule = useRef(false);

  useEffect(() => {
    let actif = true;
    lireDossierMemorise().then((h) => actif && h && setDossier(h));
    return () => {
      actif = false;
      annule.current = true;
    };
  }, []);

  // Un code OTP par affaire SAP : plusieurs chantiers peuvent partager le
  // même compte (ex. JE601), on ne le propose qu'une fois.
  const otpDisponibles = useMemo(() => {
    const parCode = new Map();
    (chantiers || []).forEach((c) => {
      const code = otpDepuisCompte(c.compte);
      if (!code) return;
      if (!parCode.has(code)) parCode.set(code, []);
      const nom = c.nom || c.name;
      if (nom) parCode.get(code).push(nom);
    });
    return [...parCode.entries()]
      .map(([code, noms]) => ({ code, noms }))
      .sort((a, b) => a.code.localeCompare(b.code));
  }, [chantiers]);

  useEffect(() => {
    if (!menuOuvert) return undefined;
    const fermer = (e) => {
      if (refMenu.current && !refMenu.current.contains(e.target)) setMenuOuvert(false);
    };
    document.addEventListener("mousedown", fermer);
    return () => document.removeEventListener("mousedown", fermer);
  }, [menuOuvert]);

  const maj = (champ, valeur) => {
    setParams((p) => {
      const suivant = { ...p, [champ]: valeur };
      try {
        localStorage.setItem(CLE_STOCKAGE, JSON.stringify(suivant));
      } catch {
        /* ignoré */
      }
      return suivant;
    });
  };

  const basculerOtp = (code) =>
    setOtp((liste) => (liste.includes(code) ? liste.filter((o) => o !== code) : [...liste, code]));

  const filtre = recherche.trim().toUpperCase();
  const visibles = otpDisponibles.filter(
    (o) =>
      !filtre ||
      o.code.includes(filtre) ||
      o.noms.some((n) => n.toUpperCase().includes(filtre))
  );
  const codeLibre = filtre.replace(/\s+/g, "");
  const peutAjouterLibre =
    codeLibre.length >= 4 && !otpDisponibles.some((o) => o.code === codeLibre) && !otp.includes(codeLibre);
  const libres = otp.filter((c) => !otpDisponibles.some((o) => o.code === c));

  const libelleMenu =
    otp.length === 0
      ? "Choisir les affaires…"
      : otp.length <= 2
        ? otp.join(", ")
        : `${otp.length} affaires sélectionnées`;

  const optionsValidation = (type, chemins = false) =>
    type === "fo" ? { fo: true, chemins } : { mo: true, dates: true, debut, fin, chemins };

  // Script à télécharger (secours, si le gestionnaire n'est pas installé).
  const telechargerManuel = (type) => {
    const problemes = validerParametres(params, otp, optionsValidation(type, true));
    setErreurs(problemes);
    if (problemes.length > 0) return;
    telecharger(
      type === "fo" ? "extraction-sap-me2j-achats.vbs" : "extraction-sap-zcat3-heures.vbs",
      genererScriptManuel(type, params, otp, debut, fin)
    );
  };

  const choisirDossierExport = async () => {
    try {
      setDossier(await choisirDossier());
    } catch (e) {
      if (e?.name !== "AbortError") setEtat({ phase: "erreur", message: "Dossier non accessible : " + e.message });
    }
  };

  // Un clic : lance SAP via le gestionnaire installé sur le poste, attend
  // la fin de l'extraction, lit le fichier exporté et l'importe.
  const lancer = async (type) => {
    if (etat && (etat.phase === "attente" || etat.phase === "import")) return;
    const problemes = validerParametres(params, otp, optionsValidation(type));
    setErreurs(problemes);
    if (problemes.length > 0) return;
    if (!dossierSupporte()) {
      setEtat({
        phase: "erreur",
        message:
          "Ce navigateur ne permet pas de lire le dossier d'export. Utilisez Chrome ou Edge, ou le script manuel (Paramètres SAP).",
      });
      return;
    }

    let h = dossier;
    try {
      if (!h) {
        h = await choisirDossier();
        setDossier(h);
      }
      if (!(await autoriser(h))) {
        setEtat({ phase: "erreur", message: "Accès au dossier d'export refusé." });
        return;
      }
    } catch (e) {
      if (e?.name !== "AbortError") setEtat({ phase: "erreur", message: "Dossier non accessible : " + e.message });
      return;
    }

    const libelle = type === "fo" ? "achats (ME2J)" : "heures (ZCAT3)";
    const t0 = Date.now();
    annule.current = false;
    setEtat({ phase: "attente", type, message: `Lancement de l'extraction ${libelle}…` });
    ouvrirLien(construireUrlLancement(type, params, otp, debut, fin));

    const limite = t0 + 10 * 60 * 1000;
    let reponse = false;
    let fini = false;
    while (!annule.current && Date.now() < limite) {
      await new Promise((r) => setTimeout(r, 1000));
      const st = await lireFichier(h, `statut-${type}.txt`);
      if (st && st.modifieLe >= t0 - 2000) {
        reponse = true;
        const [code, ...reste] = st.texte.split(/\r?\n/);
        const detail = reste.join(" ").trim();
        if (code.trim() === "ERREUR") {
          setEtat({ phase: "erreur", message: detail || "L'extraction SAP a échoué." });
          return;
        }
        if (code.trim() === "OK") {
          fini = true;
          break;
        }
        setEtat({ phase: "attente", type, message: `Extraction ${libelle} en cours dans SAP…` });
      } else if (!reponse && Date.now() - t0 > 15000) {
        setEtat({
          phase: "attente",
          type,
          message:
            "Aucune réponse du poste. Le gestionnaire SAP est-il installé (Paramètres SAP > Installation) et le lien autorisé dans le navigateur ?",
        });
      }
    }
    if (annule.current) return;
    if (!fini) {
      setEtat({ phase: "erreur", message: "Délai dépassé : l'extraction SAP n'a pas abouti." });
      return;
    }

    setEtat({ phase: "import", type, message: "Lecture et import du fichier exporté…" });
    try {
      const nomFichier = `export-${type}-sap.txt`;
      const fichier = await lireFichier(h, nomFichier);
      if (!fichier) throw new Error("Fichier d'export introuvable dans le dossier choisi.");
      const res = await importerExportSap({
        type,
        texte: fichier.texte,
        nomFichier,
        otpDemandes: otp,
        debut: type === "mo" ? dateSap(debut) : "",
        fin: type === "mo" ? dateSap(fin) : "",
      });
      setEtat({
        phase: "ok",
        message:
          `${res.nbLignes} ligne(s) importée(s)` +
          (res.nbRemplacees > 0 ? ` (${res.nbRemplacees} ancienne(s) ligne(s) remplacée(s))` : "") +
          ".",
      });
    } catch (e) {
      setEtat({ phase: "erreur", message: "Import impossible : " + e.message });
    }
  };

  const enCours = etat && (etat.phase === "attente" || etat.phase === "import");

  const champ = (label, nom, aide) => (
    <label className="form-field" style={{ display: "grid", gap: 4 }}>
      <span>{label}</span>
      <input value={params[nom] ?? ""} onChange={(e) => maj(nom, e.target.value)} />
      {aide && <small className="page-subtitle">{aide}</small>}
    </label>
  );

  return (
    <div className="card" style={{ padding: 16 }}>
      <h2 style={{ marginTop: 0 }}>Extraire depuis SAP</h2>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        <div className="person-multiselect" ref={refMenu} style={{ width: 260 }}>
          <button
            type="button"
            className="person-multiselect-btn"
            onClick={() => setMenuOuvert((o) => !o)}
            style={{ padding: "8px 10px" }}
          >
            {libelleMenu} ▾
          </button>
          {menuOuvert && (
            <div className="person-multiselect-panel chantier-multiselect-panel">
              <input
                className="chantier-multiselect-recherche"
                placeholder="Rechercher ou saisir un code…"
                value={recherche}
                onChange={(e) => setRecherche(e.target.value)}
                autoFocus
              />
              <div className="chantier-multiselect-liste">
                {libres.map((code) => (
                  <label key={code} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <input type="checkbox" checked onChange={() => basculerOtp(code)} />
                    {code}
                  </label>
                ))}
                {visibles.map((o) => (
                  <label
                    key={o.code}
                    title={o.noms.join("\n")}
                    style={{ display: "flex", gap: 6, alignItems: "center" }}
                  >
                    <input type="checkbox" checked={otp.includes(o.code)} onChange={() => basculerOtp(o.code)} />
                    {o.code}
                  </label>
                ))}
                {peutAjouterLibre && (
                  <button
                    type="button"
                    className="btn"
                    onClick={() => {
                      basculerOtp(codeLibre);
                      setRecherche("");
                    }}
                  >
                    + Ajouter « {codeLibre} »
                  </button>
                )}
                {visibles.length === 0 && !peutAjouterLibre && (
                  <span className="page-subtitle">Aucune affaire</span>
                )}
              </div>
            </div>
          )}
        </div>

        <input type="date" value={debut} onChange={(e) => setDebut(e.target.value)} title="Début (ZCAT3)" />
        <span>→</span>
        <input type="date" value={fin} onChange={(e) => setFin(e.target.value)} title="Fin (ZCAT3)" />

        <button type="button" className="btn btn-primary" disabled={enCours} onClick={() => lancer("fo")}>
          ▶ Achats (ME2J)
        </button>
        <button type="button" className="btn btn-primary" disabled={enCours} onClick={() => lancer("mo")}>
          ▶ Heures (ZCAT3)
        </button>
        <button type="button" className="btn" onClick={() => setOuvert((o) => !o)}>
          {ouvert ? "Masquer" : "Paramètres SAP"}
        </button>
      </div>

      {erreurs.length > 0 && (
        <ul style={{ color: "var(--danger, #c0392b)", margin: "8px 0 0" }}>
          {erreurs.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}

      {etat && (
        <div
          className={etat.phase === "erreur" ? "form-error" : "page-subtitle"}
          style={{ marginTop: 10, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}
        >
          <span>
            {etat.phase === "ok" && "✅ "}
            {etat.phase === "erreur" && "⚠ "}
            {(etat.phase === "attente" || etat.phase === "import") && "⏳ "}
            {etat.message}
          </span>
          {etat.phase === "attente" && (
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
          )}
        </div>
      )}

      {ouvert && (
        <div className="sap-installation" style={{ marginTop: 12, display: "grid", gap: 8 }}>
          <strong>Installation sur ce poste (une seule fois)</strong>
          <ol style={{ margin: 0, paddingLeft: 20, display: "grid", gap: 6 }}>
            <li>
              <button
                type="button"
                className="btn"
                onClick={() => telecharger("installer-pilotage-sap.vbs", genererInstallateur())}
              >
                ⬇ Télécharger l'installateur
              </button>{" "}
              puis double-clic dessus (sans droits administrateur).
            </li>
            <li>
              <button type="button" className="btn" onClick={choisirDossierExport}>
                📁 {dossier ? "Changer le dossier d'export" : "Choisir le dossier d'export"}
              </button>{" "}
              {dossier ? `Dossier choisi : ${dossier.name}. ` : ""}Dans la fenêtre, tapez{" "}
              <code>{DOSSIER_EXPORT_LOCAL}</code> dans la barre d'adresse (Chrome ou Edge).
            </li>
            <li>
              Au premier lancement, le navigateur demande d'autoriser le lien « Pilotage SAP » : cochez
              « toujours autoriser ».
            </li>
          </ol>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
            <span className="page-subtitle">Secours, sans installation :</span>
            <button type="button" className="btn" onClick={() => telechargerManuel("fo")}>
              ⬇ Script achats
            </button>
            <button type="button" className="btn" onClick={() => telechargerManuel("mo")}>
              ⬇ Script heures
            </button>
            <span className="page-subtitle">(à lancer par double-clic ; le fichier .txt s'importe ensuite ci-dessous)</span>
          </div>
        </div>
      )}

      {ouvert && (
        <div
          style={{
            display: "grid",
            gap: 12,
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            marginTop: 12,
          }}
        >
          {champ("Code société SAP", "societeSap", "ZCAT3 — propre à l'agence (ex. 2726 pour IAQ1 à IAQX)")}
          {champ("Organisation d'achats", "organisationAchats", "ME2J — I001 (INEO), G001 (AXIMA), B001 (BYES)")}
          {champ("Variante de sélection ME2J", "varianteListeFo")}
          {champ("Mise en forme ALV ME2J", "miseEnFormeFo", "Laisser vide pour ne pas en charger")}
          {champ("Mise en forme ALV ZCAT3", "varianteAlvMo", "Nom de votre mise en forme (ex. IAQ2_GUEST)")}
          {champ("Ligne de la mise en forme ZCAT3", "ligneVarianteMo", "Ligne (à partir de 0) lue en priorité dans la liste, 50 comme GOAT ; vide = ignorer")}
          {champ("Dossier d'export achats", "dossierFo")}
          {champ("Fichier d'export achats", "fichierFo")}
          {champ("Dossier d'export heures", "dossierMo")}
          {champ("Fichier d'export heures", "fichierMo")}
          <label style={{ display: "grid", gap: 4 }}>
            <span>
              <input
                type="checkbox"
                checked={Boolean(params.afficherSap)}
                onChange={(e) => maj("afficherSap", e.target.checked)}
              />{" "}
              Afficher la fenêtre SAP pendant l'extraction (dépannage)
            </span>
          </label>
          <label style={{ display: "grid", gap: 4 }}>
            <span>
              <input
                type="checkbox"
                checked={Boolean(params.popupProjet)}
                onChange={(e) => maj("popupProjet", e.target.checked)}
              />{" "}
              Popup « profil projet » ME2J
            </span>
            {params.popupProjet && (
              <input value={params.profilProjet} onChange={(e) => maj("profilProjet", e.target.value)} />
            )}
          </label>
        </div>
      )}
    </div>
  );
}
