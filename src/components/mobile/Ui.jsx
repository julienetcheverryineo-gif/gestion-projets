import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { useEtatSynchro } from "../../lib/offline";
import { lireResterConnecte } from "../../firebase";
import { IcEnLigne, IcFermer, IcHorsLigne, IcSynchro } from "./Icones";

// ---------- Formats ----------
export const nf0 = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
export const nf1 = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 });
export const eur = (n) => nf0.format(Math.round(Number(n) || 0)) + " €";
// 1 250 000 -> 1,25 M€ ; 348 200 -> 348 k€ ; 4 560 -> 4 560 €
export function eurCourt(n) {
  const v = Number(n) || 0;
  const a = Math.abs(v);
  if (a >= 1e6) return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(v / 1e6) + " M€";
  if (a >= 1e5) return nf0.format(v / 1e3) + " k€";
  return nf0.format(Math.round(v)) + " €";
}
export const pct0 = (n) => nf0.format(Math.round(Number(n) || 0)) + " %";
export const pct1 = (n) => nf1.format(Math.round((Number(n) || 0) * 10) / 10) + " %";
export function depuis(ms) {
  if (!ms) return "jamais";
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 60) return "à l'instant";
  if (s < 3600) return "il y a " + Math.round(s / 60) + " min";
  if (s < 86400) return "il y a " + Math.round(s / 3600) + " h";
  return "le " + new Date(ms).toLocaleDateString("fr-FR");
}

// ---------- Toast (annuler) ----------
let toast = null;
const abonnesToast = new Set();
let minuteurToast = null;
export function afficherToast(texte, action, duree = 5000) {
  toast = { texte, action, id: Date.now() };
  abonnesToast.forEach((f) => f());
  clearTimeout(minuteurToast);
  minuteurToast = setTimeout(() => {
    toast = null;
    abonnesToast.forEach((f) => f());
  }, duree);
}
export function ToastHost() {
  const t = useSyncExternalStore(
    (f) => {
      abonnesToast.add(f);
      return () => abonnesToast.delete(f);
    },
    () => toast
  );
  if (!t) return null;
  return (
    <div className="m-toast" role="status" key={t.id}>
      <span>{t.texte}</span>
      {t.action && (
        <button
          type="button"
          onClick={() => {
            t.action.onClick();
            toast = null;
            abonnesToast.forEach((f) => f());
          }}
        >
          {t.action.label}
        </button>
      )}
    </div>
  );
}

// ---------- Feuille (bottom sheet) ----------
export function Feuille({ titre, sousTitre, onFermer, children, pied }) {
  const ref = useRef(null);
  useEffect(() => {
    const prec = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const touche = (e) => e.key === "Escape" && onFermer();
    window.addEventListener("keydown", touche);
    return () => {
      document.body.style.overflow = prec;
      window.removeEventListener("keydown", touche);
    };
  }, [onFermer]);
  return createPortal(
    <div className="m-feuille-fond" onClick={onFermer}>
      <div className="m-feuille" ref={ref} role="dialog" aria-label={titre} onClick={(e) => e.stopPropagation()}>
        <div className="m-feuille-poignee" aria-hidden="true" />
        <div className="m-feuille-tete">
          <div className="m-feuille-titres">
            <h2>{titre}</h2>
            {sousTitre && <p>{sousTitre}</p>}
          </div>
          <button type="button" className="m-icone-btn" onClick={onFermer} aria-label="Fermer">
            <IcFermer />
          </button>
        </div>
        <div className="m-feuille-corps">{children}</div>
        {pied && <div className="m-feuille-pied">{pied}</div>}
      </div>
    </div>,
    document.body
  );
}

// ---------- Synchronisation ----------
export function PuceSynchro({ onClick }) {
  const { enLigne, enAttente } = useEtatSynchro();
  let classe = "ok";
  let texte = "En ligne";
  let icone = <IcEnLigne taille={15} />;
  if (!enLigne) {
    classe = "off";
    texte = enAttente > 0 ? "Hors ligne · " + enAttente : "Hors ligne";
    icone = <IcHorsLigne taille={15} />;
  } else if (enAttente > 0) {
    classe = "sync";
    texte = "Envoi · " + enAttente;
    icone = <IcSynchro taille={15} />;
  }
  return (
    <button type="button" className={"m-puce-synchro " + classe} onClick={onClick} aria-label={"État de la connexion : " + texte}>
      {icone}
      <span>{texte}</span>
    </button>
  );
}

export function FeuilleSynchro({ onFermer }) {
  const { enLigne, enAttente, derniereSynchro } = useEtatSynchro();
  const rester = lireResterConnecte();
  return (
    <Feuille titre="Connexion et hors-ligne" onFermer={onFermer}>
      <div className={"m-synchro-etat " + (enLigne ? (enAttente ? "sync" : "ok") : "off")}>
        {enLigne ? <IcEnLigne /> : <IcHorsLigne />}
        <div>
          <strong>{enLigne ? (enAttente ? "Envoi des modifications…" : "Connecté et à jour") : "Mode hors ligne"}</strong>
          <span>
            {enLigne
              ? enAttente
                ? enAttente + " modification(s) en cours d'envoi"
                : "Dernière synchronisation : " + depuis(derniereSynchro)
              : "Vous pouvez continuer : tout est enregistré sur le téléphone"}
          </span>
        </div>
      </div>
      {enAttente > 0 && (
        <p className="m-synchro-note">
          <strong>{enAttente}</strong> modification(s) enregistrée(s) sur ce téléphone seront envoyées automatiquement dès que le réseau revient. Ne vous
          déconnectez pas d'ici là.
        </p>
      )}
      <ul className="m-synchro-liste">
        <li>
          <span>Données consultables hors ligne</span>
          <b>Chantiers, devis, suivi, SAP</b>
        </li>
        <li>
          <span>Dernière synchronisation</span>
          <b>{depuis(derniereSynchro)}</b>
        </li>
        <li>
          <span>Rester connecté sur l'appareil</span>
          <b className={rester ? "ok" : "ko"}>{rester ? "Oui" : "Non"}</b>
        </li>
      </ul>
      {!rester && (
        <p className="m-synchro-note warn">
          Sans « Rester connecté », fermer l'appli vous déconnecte et il faudra du réseau pour rouvrir. Déconnectez-vous puis reconnectez-vous en cochant la
          case sur l'écran de connexion.
        </p>
      )}
      <p className="m-synchro-note">
        Astuce : avant de partir sur un chantier sans réseau, ouvrez l'appli une fois en ligne pour charger les données du jour.
      </p>
    </Feuille>
  );
}

// ---------- Visuels ----------
export function Anneau({ valeur, taille = 108, epaisseur = 11, couleur = "var(--m-vert)", children }) {
  const r = (taille - epaisseur) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(100, Number(valeur) || 0));
  return (
    <div className="m-anneau" style={{ width: taille, height: taille }}>
      <svg width={taille} height={taille} viewBox={`0 0 ${taille} ${taille}`} aria-hidden="true">
        <circle cx={taille / 2} cy={taille / 2} r={r} fill="none" stroke="var(--m-trait)" strokeWidth={epaisseur} />
        <circle
          cx={taille / 2}
          cy={taille / 2}
          r={r}
          fill="none"
          stroke={couleur}
          strokeWidth={epaisseur}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - v / 100)}
          transform={`rotate(-90 ${taille / 2} ${taille / 2})`}
          style={{ transition: "stroke-dashoffset .5s ease" }}
        />
      </svg>
      <div className="m-anneau-centre">{children}</div>
    </div>
  );
}

export function Barre({ valeur, couleur, fin }) {
  const v = Math.max(0, Math.min(100, Number(valeur) || 0));
  return (
    <div className={"m-barre" + (fin ? " fin" : "")}>
      <i style={{ width: v + "%", background: couleur || "var(--m-vert)" }} />
    </div>
  );
}

export function Squelette() {
  return <div className="m-chargement">Chargement…</div>;
}

export function useHorloge(ms = 30000) {
  const [, setN] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setN((n) => n + 1), ms);
    return () => clearInterval(t);
  }, [ms]);
}
