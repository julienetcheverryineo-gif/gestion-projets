import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Barre, FeuilleSynchro, PuceSynchro, Squelette } from "../../components/mobile/Ui";
import { IcCharge } from "../../components/mobile/Icones";

const a1 = (n) => new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 }).format(Math.round(n * 10) / 10);

// Plan de charge Électricité en cartes : charge par période (avec effectif
// nécessaire), puis par électricien, puis chantiers pris en compte.
export default function PlanDeChargeMobile({ vue, setVue, chargement, vide, colonnes, libelle, cle, lignes, totaux, effectifs, detail }) {
  const navigate = useNavigate();
  const [synchro, setSynchro] = useState(false);
  const maxTotal = Math.max(1, ...totaux);
  const maxPersonne = Math.max(1, ...lignes.flatMap((p) => colonnes.map((c) => p.parColonne.get(cle(c)) || 0)));
  return (
    <div className="m-page">
      <header className="m-entete">
        <div className="m-entete-ligne">
          <h1>Plan de charge</h1>
          <PuceSynchro onClick={() => setSynchro(true)} />
        </div>
        <p className="m-entete-sous">Reste à faire en main d'œuvre, réparti par électricien</p>
        <div className="m-segments" role="tablist">
          <button type="button" className={vue === "semaine" ? "actif" : ""} onClick={() => setVue("semaine")}>
            Semaine
          </button>
          <button type="button" className={vue === "mois" ? "actif" : ""} onClick={() => setVue("mois")}>
            Mois
          </button>
        </div>
      </header>
      {chargement ? (
        <Squelette />
      ) : vide ? (
        <div className="m-vide">
          <IcCharge taille={34} />
          <strong>{vide.titre}</strong>
          <span>{vide.texte}</span>
        </div>
      ) : (
        <div className="m-tour">
          <h2 className="m-titre-section">Charge et effectif nécessaire</h2>
          <div className="m-carte-blanche m-charge-periodes">
            {colonnes.map((col, i) => {
              const ratio = maxTotal > 0 ? (totaux[i] / maxTotal) * 100 : 0;
              return (
                <div key={cle(col)} className="m-charge-ligne">
                  <span className="m-charge-lib">{libelle(col)}</span>
                  <Barre valeur={ratio} fin couleur="var(--m-bleu)" />
                  <b>{totaux[i] > 0 ? a1(totaux[i]) + " h" : "—"}</b>
                  <small>{effectifs[i] !== null ? a1(effectifs[i]) + " ETP" : ""}</small>
                </div>
              );
            })}
          </div>

          <h2 className="m-titre-section">Par électricien</h2>
          {lignes.map((p) => (
            <div key={p.nom} className="m-carte-blanche m-charge-personne">
              <div className="m-charge-personne-tete">
                <strong>{p.nom}</strong>
                <b>{a1(p.total)} h</b>
              </div>
              {colonnes
                .filter((c) => (p.parColonne.get(cle(c)) || 0) > 0)
                .map((c) => {
                  const h = p.parColonne.get(cle(c)) || 0;
                  return (
                    <div key={cle(c)} className="m-charge-ligne">
                      <span className="m-charge-lib">{libelle(c)}</span>
                      <Barre valeur={(h / maxPersonne) * 100} fin />
                      <b>{a1(h)} h</b>
                    </div>
                  );
                })}
            </div>
          ))}

          <h2 className="m-titre-section">Chantiers pris en compte</h2>
          <ul className="m-liste-simple">
            {detail.map(({ chantier, resteAFaire, equipe, dateFinDepassee, sansDevis }) => (
              <li key={chantier.id}>
                <button type="button" className="m-ligne-auto" onClick={() => navigate("/electricite/chantiers/" + chantier.id)}>
                  <div className="m-ligne-auto-tete">
                    <strong>{chantier.nom}</strong>
                    <span className="m-statut-tache">{resteAFaire} h</span>
                  </div>
                  <span className="m-ligne-auto-sous">{equipe.join(", ")}</span>
                  <span className={"m-ligne-auto-sous" + (dateFinDepassee ? " m-txt-alerte" : "")}>
                    fin prévue le {new Date(chantier.dateFin).toLocaleDateString("fr-FR")}
                    {dateFinDepassee ? " · dépassée, reporté sur la semaine en cours" : ""}
                    {sansDevis ? " · heures saisies à la main" : ""}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {synchro && <FeuilleSynchro onFermer={() => setSynchro(false)} />}
    </div>
  );
}
