import { useEffect, useState } from "react";

// Même seuil que le point de bascule mobile de styles.css
// (@media max-width: 860px) : sert à remplacer certains contenus trop
// complexes pour un petit écran (le Gantt, par exemple) par une liste,
// plutôt que d'essayer de faire rentrer la même mise en page en plus
// étroit.
const REQUETE = "(max-width: 860px)";

function lireEtat() {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia(REQUETE).matches;
}

export function useEcranEtroit() {
  const [etroit, setEtroit] = useState(lireEtat);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia(REQUETE);
    const onChange = (e) => setEtroit(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return etroit;
}
