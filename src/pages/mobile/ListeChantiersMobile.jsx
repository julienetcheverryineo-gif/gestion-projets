import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { estChantierElectricite, formatStatutChantier } from "../../components/SiteFormModal";
import { alertesChantier, nbAttention, scoreAlertes } from "../../lib/alertesChantier";
import { calculerIndicateursChantier } from "../ElectriciteSiteDetail";
import { useDonneesElec } from "../../lib/useDonneesElec";
import { Barre, FeuilleSynchro, PuceSynchro, Squelette, eurCourt, nf1, pct0 } from "../../components/mobile/Ui";
import { IcBasDroite, IcChantiers, IcCheck, IcColis, IcHautDroite, IcHorloge, IcRecherche } from "../../components/mobile/Icones";

const norm = (t) =>
  String(t || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

// Liste des chantiers Électricité, version téléphone : une carte par chantier
// avec les trois jauges (avancement / facturé / dépensé) et les alertes.
export default function ListeChantiersMobile() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const donnees = useDonneesElec();
  const { chantiers: tousChantiers, chargement, tousDevis, toutesLignes, tousGroupes, sapLignesFo, sapLignesMo, tauxHoraire } = donnees;
  const [tous, setTous] = useState(false);
  const [recherche, setRecherche] = useState("");
  const [tri, setTri] = useState("alertes");
  const [feuilleSynchro, setFeuilleSynchro] = useState(false);

  const cartes = useMemo(() => {
    const elec = tousChantiers.filter(estChantierElectricite);
    const visibles = tous ? elec : elec.filter((c) => (c.ra || "") === (profile?.nom || ""));
    return visibles.map((c) => {
      let ind = null;
      try {
        ind = calculerIndicateursChantier(c, { tousDevis, toutesLignes, tousGroupes, sapLignesFo, sapLignesMo, tauxHoraire });
      } catch (err) {
        console.error("Indicateurs " + c.nom, err);
      }
      const alertes = alertesChantier(ind);
      return { chantier: c, ind, alertes, score: scoreAlertes(alertes) };
    });
  }, [tousChantiers, tous, profile?.nom, tousDevis, toutesLignes, tousGroupes, sapLignesFo, sapLignesMo, tauxHoraire]);

  const filtrees = useMemo(() => {
    const q = norm(recherche).trim();
    const liste = q ? cartes.filter(({ chantier: c }) => norm([c.nom, c.client, c.compte, c.ra].join(" ")).includes(q)) : cartes.slice();
    const parCompte = (a, b) => {
      const ca = String(a.chantier.compte || "").trim();
      const cb = String(b.chantier.compte || "").trim();
      if (!ca !== !cb) return ca ? -1 : 1;
      return ca.localeCompare(cb, "fr", { numeric: true, sensitivity: "base" }) || String(a.chantier.nom || "").localeCompare(String(b.chantier.nom || ""), "fr");
    };
    liste.sort(tri === "alertes" ? (a, b) => b.score - a.score || parCompte(a, b) : parCompte);
    return liste;
  }, [cartes, recherche, tri]);

  const nbAAttention = cartes.filter((c) => nbAttention(c.alertes) > 0).length;

  return (
    <div className="m-page">
      <header className="m-entete">
        <div className="m-entete-ligne">
          <h1>Chantiers</h1>
          <PuceSynchro onClick={() => setFeuilleSynchro(true)} />
        </div>
        <p className="m-entete-sous">
          {chargement ? "Chargement…" : cartes.length + " chantier(s)"}
          {!chargement && nbAAttention > 0 && (
            <>
              {" · "}
              <b className="m-txt-alerte">{nbAAttention} à surveiller</b>
            </>
          )}
        </p>
        <label className="m-recherche">
          <IcRecherche taille={18} />
          <input type="search" inputMode="search" placeholder="Chantier, client, n° de compte…" value={recherche} onChange={(e) => setRecherche(e.target.value)} />
        </label>
        <div className="m-segments" role="tablist">
          <button type="button" className={!tous ? "actif" : ""} onClick={() => setTous(false)}>
            Mes chantiers
          </button>
          <button type="button" className={tous ? "actif" : ""} onClick={() => setTous(true)}>
            Tous
          </button>
        </div>
        <div className="m-filtres">
          <span>Trier par</span>
          <button type="button" className={tri === "alertes" ? "actif" : ""} onClick={() => setTri("alertes")}>
            À surveiller
          </button>
          <button type="button" className={tri === "compte" ? "actif" : ""} onClick={() => setTri("compte")}>
            N° de compte
          </button>
        </div>
      </header>

      {chargement ? (
        <Squelette />
      ) : filtrees.length === 0 ? (
        <div className="m-vide">
          <IcChantiers taille={34} />
          <strong>{recherche ? "Aucun résultat" : !tous ? "Aucun chantier dont vous êtes RA" : "Aucun chantier"}</strong>
          <span>{recherche ? "Essayez un autre mot-clé." : !tous ? "Passez sur « Tous » pour voir l'ensemble des chantiers." : ""}</span>
        </div>
      ) : (
        <ul className="m-cartes">
          {filtrees.map(({ chantier: c, ind, alertes }) => (
            <CarteChantier key={c.id} chantier={c} ind={ind} alertes={alertes} onOuvrir={() => navigate("/electricite/chantiers/" + c.id)} />
          ))}
        </ul>
      )}
      {feuilleSynchro && <FeuilleSynchro onFermer={() => setFeuilleSynchro(false)} />}
    </div>
  );
}

function CarteChantier({ chantier: c, ind, alertes, onOuvrir }) {
  const attention = alertes.filter((a) => a.niveau !== "info");
  const danger = alertes.some((a) => a.niveau === "danger");
  const pctFact = ind && ind.marche > 0 ? (ind.facture / ind.marche) * 100 : null;
  const pctDep = ind && ind.budget > 0 && ind.sapDisponible ? (ind.reelSap / ind.budget) * 100 : null;
  const pctAv = ind?.avancementPct ?? null;
  return (
    <li>
      <button type="button" className={"m-carte" + (danger ? " danger" : attention.length ? " warn" : "")} onClick={onOuvrir}>
        <div className="m-carte-tete">
          <span className={"m-pastille-statut status-" + (c.statut ?? "actif")} title={formatStatutChantier(c.statut)} />
          <div className="m-carte-titres">
            <strong>{c.nom}</strong>
            <span>{[c.client, c.compte].filter(Boolean).join(" · ") || "—"}</span>
          </div>
          {attention.length > 0 ? (
            <span className={"m-badge-alerte" + (danger ? " danger" : "")}>{attention.length}</span>
          ) : ind ? (
            <span className="m-badge-ok" title="Rien à signaler">
              <IcCheck taille={15} />
            </span>
          ) : null}
        </div>

        {ind ? (
          <>
            <div className="m-trio">
              <Jauge label="Avancement" valeur={pctAv} couleur="var(--m-vert)" />
              <Jauge label="Facturé" valeur={pctFact} couleur="var(--m-bleu)" />
              <Jauge label="Dépensé" valeur={pctDep} couleur="var(--m-ambre)" />
            </div>
            {(ind.marche > 0 || attention.length > 0) && (
              <div className="m-carte-pied">
                {ind.marche > 0 && (
                  <span className="m-carte-montant">
                    {eurCourt(ind.facture)} <small>/ {eurCourt(ind.marche)}</small>
                  </span>
                )}
                <span className="m-puces">
                  {ind.factVsReel && ind.factVsReel.etat !== "ok" && <PuceIcone etat={ind.factVsReel.etat} titre="vs dépenses" />}
                  {ind.factVsAvancement && ind.factVsAvancement.etat !== "ok" && <PuceIcone etat={ind.factVsAvancement.etat} titre="vs avancement" />}
                  {ind.etat?.paiement === "retard" && <span className="m-puce danger">Paiement en retard</span>}
                  {ind.heuresNonAffectees > 0 && (
                    <span className="m-puce violet">
                      <IcHorloge taille={13} /> {nf1.format(ind.heuresNonAffectees)} h
                    </span>
                  )}
                  {ind.fournituresNonAffectees > 0.005 && (
                    <span className="m-puce violet">
                      <IcColis taille={13} /> {eurCourt(ind.fournituresNonAffectees)}
                    </span>
                  )}
                </span>
              </div>
            )}
          </>
        ) : (
          <p className="m-carte-vide">Pas de devis importé</p>
        )}
      </button>
    </li>
  );
}

function Jauge({ label, valeur, couleur }) {
  return (
    <div className="m-jauge">
      <b className="m-jauge-val">{valeur == null ? "—" : pct0(valeur)}</b>
      <span className="m-jauge-lib">{label}</span>
      <Barre valeur={valeur ?? 0} couleur={couleur} fin />
    </div>
  );
}

function PuceIcone({ etat, titre }) {
  const retard = etat === "retard";
  return (
    <span className={"m-puce " + (retard ? "warn" : "info")} title={(retard ? "Sous-facturé " : "Sur-facturé ") + titre}>
      {retard ? <IcBasDroite taille={13} /> : <IcHautDroite taille={13} />}
      {titre}
    </span>
  );
}
