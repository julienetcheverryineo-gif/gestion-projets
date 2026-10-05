import { useMemo, useState } from "react";
import { useCollection } from "../lib/firestoreHooks";
import { otpDepuisCompte } from "../lib/parseSapExports";
import {
  PARAMS_SAP_DEFAUT,
  genererScriptMe2j,
  genererScriptZcat3,
  listerOtp,
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
  const [otpTexte, setOtpTexte] = useState("");
  const [debut, setDebut] = useState(isoAujourdhui(-1));
  const [fin, setFin] = useState(isoAujourdhui());
  const [erreurs, setErreurs] = useState([]);
  const [ouvert, setOuvert] = useState(false);

  const otpChantiers = useMemo(
    () =>
      (chantiers || [])
        .map((c) => ({ id: c.id, nom: c.nom || c.name || c.compte, otp: otpDepuisCompte(c.compte) }))
        .filter((c) => c.otp)
        .sort((a, b) => a.otp.localeCompare(b.otp)),
    [chantiers]
  );

  const otp = useMemo(() => listerOtp(otpTexte), [otpTexte]);

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

  const basculerOtp = (code) => {
    const liste = listerOtp(otpTexte);
    setOtpTexte((liste.includes(code) ? liste.filter((o) => o !== code) : [...liste, code]).join("\n"));
  };

  const generer = (type) => {
    const options =
      type === "fo"
        ? { fo: true }
        : { mo: true, dates: true, debut, fin };
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
      <h2 style={{ marginTop: 0 }}>Extraire depuis SAP (scripts)</h2>
      <p className="page-subtitle" style={{ marginBottom: 12 }}>
        Génère un script à lancer sur votre poste (double-clic) avec SAP ouvert : il exécute ME2J (achats) ou
        ZCAT3 (heures) pour les affaires choisies et dépose le fichier .txt dans le dossier d'export.
        Importez ensuite ce fichier dans les blocs ci-dessus. Une page web ne pouvant pas piloter SAP
        directement, c'est ce script local qui le fait.
      </p>

      <div style={{ display: "grid", gap: 12 }}>
        <div>
          <strong>Affaires (codes OTP)</strong>
          {otpChantiers.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, margin: "8px 0" }}>
              {otpChantiers.map((c) => (
                <label key={c.id} style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
                  <input
                    type="checkbox"
                    checked={otp.includes(c.otp)}
                    onChange={() => basculerOtp(c.otp)}
                  />
                  {c.otp}
                </label>
              ))}
            </div>
          )}
          <textarea
            rows={3}
            style={{ width: "100%" }}
            placeholder="Un code par ligne (ex. AAQ5JE605), ou cochez les chantiers ci-dessus"
            value={otpTexte}
            onChange={(e) => setOtpTexte(e.target.value)}
          />
          <small className="page-subtitle">{otp.length} affaire(s) sélectionnée(s)</small>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
          <label className="form-field" style={{ display: "grid", gap: 4 }}>
            <span>Date de début (ZCAT3)</span>
            <input type="date" value={debut} onChange={(e) => setDebut(e.target.value)} />
          </label>
          <label className="form-field" style={{ display: "grid", gap: 4 }}>
            <span>Date de fin (ZCAT3)</span>
            <input type="date" value={fin} onChange={(e) => setFin(e.target.value)} />
          </label>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <button type="button" className="btn btn-primary" onClick={() => generer("fo")}>
            ⬇ Script achats (ME2J)
          </button>
          <button type="button" className="btn btn-primary" onClick={() => generer("mo")}>
            ⬇ Script heures (ZCAT3)
          </button>
          <button type="button" className="btn" onClick={() => setOuvert((o) => !o)}>
            {ouvert ? "Masquer" : "Paramètres SAP"}
          </button>
        </div>

        {erreurs.length > 0 && (
          <ul style={{ color: "var(--danger, #c0392b)", margin: 0 }}>
            {erreurs.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        )}

        {ouvert && (
          <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
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
    </div>
  );
}
