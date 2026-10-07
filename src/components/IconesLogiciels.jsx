// Pastilles « style logiciel » pour les boutons liés à SAP et à Access (GOAT) :
// simples badges colorés dessinés en SVG (pas de logo officiel reproduit).
export function IconeSap({ taille = "1.2em" }) {
  return (
    <svg
      className="icone-logiciel"
      width={taille}
      height={taille}
      viewBox="0 0 24 24"
      aria-hidden="true"
      style={{ verticalAlign: "-0.2em" }}
    >
      <path d="M1 3h22L13 21H1z" fill="#0a6ed1" />
      <text x="2.6" y="14.2" fontSize="7.2" fontWeight="700" fontFamily="Arial, sans-serif" fill="#fff">
        SAP
      </text>
    </svg>
  );
}

export function IconeAccess({ taille = "1.2em" }) {
  return (
    <svg
      className="icone-logiciel"
      width={taille}
      height={taille}
      viewBox="0 0 24 24"
      aria-hidden="true"
      style={{ verticalAlign: "-0.2em" }}
    >
      <rect x="2" y="2" width="20" height="20" rx="3" fill="#a4373a" />
      <rect x="2" y="2" width="6" height="20" rx="3" fill="#7b1f23" />
      <text x="10" y="17" fontSize="12" fontWeight="700" fontFamily="Arial, sans-serif" fill="#fff">
        A
      </text>
    </svg>
  );
}
