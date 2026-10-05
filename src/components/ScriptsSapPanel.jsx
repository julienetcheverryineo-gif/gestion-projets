import { useEffect, useMemo, useRef, useState } from "react";
import { useCollection } from "../lib/firestoreHooks";
import { otpDepuisCompte } from "../lib/parseSapExports";
import {
  PARAMS_SAP_DEFAUT,
  genererScriptMe2j,
  genererScriptZcat3,
  validerParametres,
} from "../lib/sapScripts";

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

  const generer = (type) => {
    const options = type === "fo" ? { fo: true } : { mo: true, dates: true, debut, fin };
    const problemes = validerParametres(params, otp, options);
    setErreurs(problemes);
    if (problemes.length > 0) return;
    if (type === "fo") telecharger("extraction-sap-me2j-achats.vbs", genererScriptMe2j(params, otp));
    else telecharger("extraction-sap-zcat3-heures.vbs", genererScriptZcat3(params, otp, debut, fin));
  };

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

        <button type="button" className="btn btn-primary" onClick={() => generer("fo")}>
          ⬇ Achats (ME2J)
        </button>
        <button type="button" className="btn btn-primary" onClick={() => generer("mo")}>
          ⬇ Heures (ZCAT3)
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
