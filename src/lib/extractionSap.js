import {
  PARAMS_SAP_DEFAUT,
  construireUrlLancement,
  construireUrlLotTaches,
  dateSap,
  grouperParAgence,
  validerParametres,
} from "./sapScripts";
import { lireFichier, ouvrirLien } from "./dossierExportSap";
import { construireUrlGoat } from "./goatScripts";
import { importerExportSap } from "./importSapAuto";

const CLE_PARAMS = "scriptsSapParams";

export function lireParamsSap() {
  try {
    const brut = localStorage.getItem(CLE_PARAMS);
    if (brut) return { ...PARAMS_SAP_DEFAUT, ...JSON.parse(brut) };
  } catch {
    /* stockage indisponible */
  }
  return { ...PARAMS_SAP_DEFAUT };
}

export function sauverParamsSap(params) {
  try {
    localStorage.setItem(CLE_PARAMS, JSON.stringify(params));
  } catch {
    /* ignoré */
  }
}

export function isoAujourdhui(decalageAnnees = 0) {
  const d = new Date();
  d.setFullYear(d.getFullYear() + decalageAnnees);
  return d.toISOString().slice(0, 10);
}

export function optionsValidation(type, debut, fin, chemins = false) {
  return type === "fo" ? { fo: true, chemins } : { mo: true, dates: true, debut, fin, chemins };
}

// Une passe = une extraction (ME2J ou ZCAT3) pour les affaires d'UNE agence :
// lance SAP via le gestionnaire installé sur le poste, attend la fin, lit le
// fichier exporté et l'importe.
async function executerPasse({ handle, type, codes, titre, params, debut, fin, onEtat, estAnnule }) {
  const libelle = type === "fo" ? "achats (ME2J)" : "heures (ZCAT3)";
  const t0 = Date.now();
  onEtat({ phase: "attente", type, message: `${titre}Lancement de l'extraction ${libelle}…` });
  ouvrirLien(construireUrlLancement(type, params, codes, debut, fin));

  const limite = t0 + 10 * 60 * 1000;
  let reponse = false;
  let fini = false;
  while (!estAnnule() && Date.now() < limite) {
    await new Promise((r) => setTimeout(r, 1000));
    const st = await lireFichier(handle, `statut-${type}.txt`);
    if (st && st.modifieLe >= t0 - 2000) {
      reponse = true;
      const [code, ...reste] = st.texte.split(/\r?\n/);
      const detail = reste.join(" ").trim();
      if (code.trim() === "ERREUR") return { ok: false, message: detail || "L'extraction SAP a échoué." };
      if (code.trim() === "VIDE") return { ok: true, resume: `${type === "fo" ? "Achats" : "Heures"} : aucune ligne` };
      if (code.trim() === "OK") {
        fini = true;
        break;
      }
      onEtat({
        phase: "attente",
        type,
        message: titre + (detail && detail !== "Lancement" ? detail : `Extraction ${libelle} en cours dans SAP…`),
      });
    } else if (!reponse && Date.now() - t0 > 15000) {
      onEtat({
        phase: "attente",
        type,
        message:
          "Aucune réponse du poste. Le gestionnaire SAP est-il installé (Paramètres SAP > Installation) et le lien autorisé dans le navigateur ?",
      });
    }
  }
  if (estAnnule()) return { ok: false, annule: true };
  if (!fini) return { ok: false, message: "Délai dépassé : l'extraction SAP n'a pas abouti." };

  onEtat({ phase: "import", type, message: `${titre}Lecture et import du fichier exporté…` });
  try {
    const nomFichier = `export-${type}-sap.txt`;
    const fichier = await lireFichier(handle, nomFichier);
    if (!fichier) throw new Error("Fichier d'export introuvable dans le dossier choisi.");
    const res = await importerExportSap({
      type,
      texte: fichier.texte,
      nomFichier,
      otpDemandes: codes,
      debut: type === "mo" ? dateSap(debut) : "",
      fin: type === "mo" ? dateSap(fin) : "",
    });
    return {
      ok: true,
      resume:
        `${type === "fo" ? "Achats" : "Heures"} : ` +
        (res.nbLignes === 0 ? "aucune ligne" : `${res.nbLignes} ligne(s)`) +
        (res.nbRemplacees > 0 ? ` (${res.nbRemplacees} remplacée(s))` : ""),
    };
  } catch (e) {
    return { ok: false, message: "Import impossible : " + e.message };
  }
}

// Une ou deux extractions (types = ["fo"], ["mo"] ou les deux), chacune
// découpée par agence (AAQ5, AAQ2… ne se saisissent pas ensemble dans SAP),
// exécutées l'une après l'autre. Appelle onEtat({phase, message}) au fil de
// l'eau ; phase finale : "ok" ou "erreur" (rien si annulé).
export async function executerExtraction({ handle, types, otp, debut, fin, params, onEtat, estAnnule }) {
  const groupes = grouperParAgence(otp);
  const passes = groupes.flatMap((g) => types.map((type) => ({ type, ...g })));
  const resumes = [];
  const echecs = [];
  for (let i = 0; i < passes.length; i++) {
    const { type, prefixe, codes } = passes[i];
    const nom = (groupes.length > 1 ? `${prefixe} ` : "") + (type === "fo" ? "Achats" : "Heures");
    const titre =
      (passes.length > 1 ? `[${i + 1}/${passes.length}] ` : "") + (groupes.length > 1 ? `${prefixe} — ` : "");
    const r = await executerPasse({ handle, type, codes, titre, params, debut, fin, onEtat, estAnnule });
    if (r.annule) return { ok: false, annule: true };
    // Une passe en échec (ou sans donnée) ne bloque pas les suivantes : on
    // avance et on récapitule à la fin.
    if (r.ok) resumes.push((groupes.length > 1 ? `${prefixe} ` : "") + r.resume);
    else echecs.push(`${nom} : ${r.message}`);
  }
  const message = [...resumes, ...echecs.map((e) => "⚠ " + e)].join(" ; ") + (echecs.length ? "" : ".");
  onEtat({ phase: echecs.length > 0 && resumes.length === 0 ? "erreur" : "ok", message });
  return { ok: echecs.length === 0, message };
}

export { validerParametres };

// Déclenchement automatique de l'import SAP à la connexion (par poste).
const CLE_AUTO = "sapAutoConnexion";
export const autoActif = () => {
  try {
    return localStorage.getItem(CLE_AUTO) !== "0";
  } catch {
    return true;
  }
};
export const definirAutoActif = (actif) => {
  try {
    localStorage.setItem(CLE_AUTO, actif ? "1" : "0");
  } catch {
    /* ignoré */
  }
};

// Envoi d'un lot de tâches vers ZCA_TACHES : l'appli écrit le lot dans le
// dossier d'export (UTF-16, pour garder les accents), lance le gestionnaire
// SAP puis attend son compte rendu. Doit être appelée depuis un clic (la
// permission d'écriture sur le dossier est demandée au navigateur).
export async function envoyerTachesSap({ handle, params, compte, taches, onEtat, estAnnule }) {
  try {
    if ((await handle.requestPermission({ mode: "readwrite" })) !== "granted") {
      return onEtat({ phase: "erreur", message: "Écriture dans le dossier d'export refusée." });
    }
    const texte =
      compte + "\r\n" + taches.map((t) => t.code + "\t" + String(t.libelle).replace(/[\t\r\n]+/g, " ")).join("\r\n") + "\r\n";
    const octets = new Uint8Array(2 + texte.length * 2);
    octets[0] = 0xff;
    octets[1] = 0xfe;
    for (let i = 0; i < texte.length; i++) {
      const c = texte.charCodeAt(i);
      octets[2 + i * 2] = c & 0xff;
      octets[3 + i * 2] = c >> 8;
    }
    const fh = await handle.getFileHandle("taches-entree.txt", { create: true });
    const w = await fh.createWritable();
    await w.write(octets);
    await w.close();
  } catch (e) {
    return onEtat({ phase: "erreur", message: "Préparation impossible : " + e.message });
  }
  const t0 = Date.now();
  onEtat({ phase: "attente", type: "taches", message: "Envoi vers SAP : lancement…" });
  ouvrirLien(construireUrlLotTaches(params));
  while (!estAnnule() && Date.now() < t0 + 8 * 60 * 1000) {
    await new Promise((r) => setTimeout(r, 1000));
    const st = await lireFichier(handle, "statut-taches.txt");
    if (st && st.modifieLe >= t0 - 2000) {
      const [c, ...reste] = st.texte.split(/\r?\n/);
      const detail = reste.join(" ").trim();
      if (c.trim() === "OK") return onEtat({ phase: "ok", message: detail });
      if (c.trim() === "ERREUR") return onEtat({ phase: "erreur", message: detail || "Échec de l'envoi." });
      onEtat({ phase: "attente", type: "taches", message: "Envoi vers SAP : " + (detail || "en cours…") });
    }
  }
  if (!estAnnule()) onEtat({ phase: "erreur", message: "Délai dépassé (gestionnaire SAP installé et à jour ?)." });
}

// Envoi des lignes Fourniture vers la base GOAT (Access) : même principe que
// les tâches SAP (lot UTF-16 dans le dossier d'export, lien ineo-goat://,
// compte rendu dans statut-goat.txt).
export async function envoyerFournituresGoat({ handle, cheminBase, affaireId, lignes, mode = "fourniture", onEtat, estAnnule }) {
  try {
    if ((await handle.requestPermission({ mode: "readwrite" })) !== "granted") {
      return onEtat({ phase: "erreur", message: "Écriture dans le dossier d'export refusée." });
    }
    const nettoie = (v) => String(v ?? "").replace(/[\t\r\n]+/g, " ");
    const texte =
      cheminBase.trim() +
      "\r\n" +
      String(affaireId).trim() +
      "\r\n" +
      lignes
        .map((l) =>
          (mode === "mo"
            ? [nettoie(l.code), nettoie(l.libelle), Number(l.heures).toFixed(2)]
            : [l.typeId, nettoie(l.code), nettoie(l.libelle), Number(l.budget).toFixed(2)]
          ).join("\t")
        )
        .join("\r\n") +
      "\r\n";
    const octets = new Uint8Array(2 + texte.length * 2);
    octets[0] = 0xff;
    octets[1] = 0xfe;
    for (let i = 0; i < texte.length; i++) {
      const c = texte.charCodeAt(i);
      octets[2 + i * 2] = c & 0xff;
      octets[3 + i * 2] = c >> 8;
    }
    const fh = await handle.getFileHandle("goat-entree.txt", { create: true });
    const w = await fh.createWritable();
    await w.write(octets);
    await w.close();
  } catch (e) {
    return onEtat({ phase: "erreur", message: "Préparation impossible : " + e.message });
  }
  const t0 = Date.now();
  onEtat({ phase: "attente", message: "Envoi vers GOAT : lancement…" });
  ouvrirLien(construireUrlGoat(mode));
  while (!estAnnule() && Date.now() < t0 + 3 * 60 * 1000) {
    await new Promise((r) => setTimeout(r, 1000));
    const st = await lireFichier(handle, "statut-goat.txt");
    if (st && st.modifieLe >= t0 - 2000) {
      const [c, ...reste] = st.texte.split(/\r?\n/);
      const detail = reste.join(" ").trim();
      if (c.trim() === "OK") return onEtat({ phase: "ok", message: detail });
      if (c.trim() === "ERREUR") return onEtat({ phase: "erreur", message: detail || "Échec de l'envoi." });
      onEtat({ phase: "attente", message: "Envoi vers GOAT : " + (detail || "en cours…") });
    }
  }
  if (!estAnnule()) onEtat({ phase: "erreur", message: "Délai dépassé (gestionnaire GOAT installé et à jour ?)." });
}
