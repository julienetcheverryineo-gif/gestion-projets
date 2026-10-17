import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { useDonneesElec, useIndicateurs } from "../../lib/useDonneesElec";
import { FeuilleSynchro, PuceSynchro, Squelette } from "../../components/mobile/Ui";
import { IcRetour } from "../../components/mobile/Icones";
import SyntheseMobile from "./SyntheseMobile";
import TourMobile from "./TourMobile";

const CLE_ONGLET = "ficheMobileOnglet";
const lireOnglet = () => {
  try {
    return sessionStorage.getItem(CLE_ONGLET) === "tour" ? "tour" : "synthese";
  } catch {
    return "synthese";
  }
};

// Fiche chantier, version téléphone : deux onglets — Synthèse (comprendre) et
// Tour de chantier (saisir l'avancement).
export default function FicheChantierMobile() {
  const { chantierId } = useParams();
  const navigate = useNavigate();
  const { isAdmin, profile } = useAuth();
  const peutGerer = isAdmin || profile?.role === "ra_electricite";
  const donnees = useDonneesElec();
  const { chantiers, chargement, tousDevis, toutesLignes, tousGroupes, tauxHoraire } = donnees;
  const chantier = chantiers.find((c) => c.id === chantierId) || null;
  const ind = useIndicateurs(chantier, donnees);
  const [onglet, setOnglet] = useState(lireOnglet);
  const [feuilleSynchro, setFeuilleSynchro] = useState(false);

  useEffect(() => {
    try {
      sessionStorage.setItem(CLE_ONGLET, onglet);
    } catch {
      // stockage indisponible
    }
    window.scrollTo?.(0, 0);
  }, [onglet]);

  const devis = useMemo(
    () => tousDevis.filter((d) => d.chantierId === chantierId).sort((a, b) => (a.ordre ?? 0) - (b.ordre ?? 0)),
    [tousDevis, chantierId]
  );
  const tauxMo = tauxHoraire ? tauxHoraire("I205") ?? 0 : 0;

  if (chargement) return <Squelette />;
  if (!chantier) {
    return (
      <div className="m-page">
        <header className="m-entete">
          <button type="button" className="m-retour" onClick={() => navigate("/electricite")}>
            <IcRetour taille={20} /> Chantiers
          </button>
        </header>
        <div className="m-vide">
          <strong>Chantier introuvable</strong>
          <span>Il a peut-être été supprimé, ou n'est pas encore chargé sur ce téléphone.</span>
        </div>
      </div>
    );
  }

  return (
    <div className="m-page m-fiche">
      <header className="m-entete collant">
        <div className="m-entete-ligne">
          <button type="button" className="m-icone-btn" onClick={() => navigate("/electricite")} aria-label="Retour aux chantiers">
            <IcRetour />
          </button>
          <div className="m-fiche-titres">
            <h1>{chantier.nom}</h1>
            <p>{[chantier.client, chantier.compte].filter(Boolean).join(" · ") || "—"}</p>
          </div>
          <PuceSynchro onClick={() => setFeuilleSynchro(true)} />
        </div>
        <div className="m-segments large" role="tablist">
          <button type="button" role="tab" aria-selected={onglet === "synthese"} className={onglet === "synthese" ? "actif" : ""} onClick={() => setOnglet("synthese")}>
            Synthèse
          </button>
          <button type="button" role="tab" aria-selected={onglet === "tour"} className={onglet === "tour" ? "actif" : ""} onClick={() => setOnglet("tour")}>
            Tour de chantier
          </button>
        </div>
      </header>

      {onglet === "synthese" ? (
        <SyntheseMobile chantier={chantier} ind={ind} devis={devis} toutesLignes={toutesLignes} tousGroupes={tousGroupes} onTour={() => setOnglet("tour")} />
      ) : (
        <TourMobile devis={devis} toutesLignes={toutesLignes} tousGroupes={tousGroupes} tauxMo={tauxMo} peutGerer={peutGerer} />
      )}
      {feuilleSynchro && <FeuilleSynchro onFermer={() => setFeuilleSynchro(false)} />}
    </div>
  );
}
