// Icônes de la vue téléphone (traits 24 px, héritent de la couleur du texte).
const base = { width: 22, height: 22, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true };
const I = (enfants) =>
  function Icone({ taille, ...p }) {
    return (
      <svg {...base} {...(taille ? { width: taille, height: taille } : {})} {...p}>
        {enfants}
      </svg>
    );
  };

export const IcChantiers = I(<><path d="M3 21h18" /><path d="M5 21V8l7-4 7 4v13" /><path d="M9 21v-5h6v5" /><path d="M9 11h.01M15 11h.01" /></>);
export const IcCharge = I(<><path d="M4 20V10" /><path d="M10 20V4" /><path d="M16 20v-7" /><path d="M22 20H2" /></>);
export const IcNotes = I(<><path d="M5 3h11l3 3v15H5z" /><path d="M9 9h6M9 13h6M9 17h4" /></>);
export const IcMenu = I(<><circle cx="5" cy="12" r="1.2" /><circle cx="12" cy="12" r="1.2" /><circle cx="19" cy="12" r="1.2" /></>);
export const IcRetour = I(<path d="M15 5l-7 7 7 7" />);
export const IcChevron = I(<path d="M6 9l6 6 6-6" />);
export const IcCheck = I(<path d="M4 12.5l5 5L20 6.5" />);
export const IcRecherche = I(<><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></>);
export const IcFermer = I(<path d="M6 6l12 12M18 6L6 18" />);
export const IcBasDroite = I(<><path d="M7 7l10 10" /><path d="M17 8v9H8" /></>);
export const IcHautDroite = I(<><path d="M7 17L17 7" /><path d="M8 7h9v9" /></>);
export const IcAlerte = I(<><path d="M12 3l10 18H2z" /><path d="M12 10v5M12 18h.01" /></>);
export const IcHorsLigne = I(<><path d="M2 8.8a15 15 0 0 1 4.2-2.6M22 8.8a15 15 0 0 0-8.5-3.7M5.5 12.5a10 10 0 0 1 3-1.8M18.5 12.5a10 10 0 0 0-3.8-2.2M9 16.2a5 5 0 0 1 6 0" /><path d="M12 20h.01" /><path d="M3 3l18 18" /></>);
export const IcSynchro = I(<><path d="M21 12a9 9 0 0 1-15.5 6.2L3 16" /><path d="M3 12A9 9 0 0 1 18.5 5.8L21 8" /><path d="M21 3v5h-5M3 21v-5h5" /></>);
export const IcEnLigne = I(<><path d="M2 8.8a15 15 0 0 1 20 0" /><path d="M5.5 12.5a10 10 0 0 1 13 0" /><path d="M9 16.2a5 5 0 0 1 6 0" /><path d="M12 20h.01" /></>);
export const IcHorloge = I(<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>);
export const IcColis = I(<><path d="M21 8l-9-5-9 5 9 5z" /><path d="M3 8v8l9 5 9-5V8" /><path d="M12 13v8" /></>);
export const IcEuro = I(<><path d="M18 6.5A7 7 0 1 0 18 17.5" /><path d="M4 10h10M4 14h10" /></>);
export const IcNote = I(<><path d="M4 4h16v12H9l-5 4z" /></>);
export const IcEclair = I(<path d="M13 2L4 14h7l-1 8 9-12h-7z" />);
export const IcPlus = I(<path d="M12 5v14M5 12h14" />);
export const IcMoins = I(<path d="M5 12h14" />);
export const IcAccueil = I(<><path d="M3 11l9-8 9 8" /><path d="M5 10v10h14V10" /><path d="M10 20v-6h4v6" /></>);
export const IcTaches = I(<><rect x="4" y="4" width="16" height="16" rx="3" /><path d="M8.5 12.5l2.5 2.5 4.5-5" /></>);
export const IcReserve = I(<><path d="M5 21V4" /><path d="M5 4h13l-2.5 4.5L18 13H5" /></>);
export const IcTest = I(<><path d="M9 3h6" /><path d="M10 3v6L5 19a2 2 0 0 0 1.8 3h10.4A2 2 0 0 0 19 19l-5-10V3" /><path d="M7.5 15h9" /></>);
