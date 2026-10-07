import logoSap from "../assets/logo-sap.png";
import logoAccess from "../assets/logo-access.png";

// Logos SAP et Access affichés sur les boutons / menus qui y sont liés.
export function IconeSap({ hauteur = "1.15em" }) {
  return (
    <img
      className="icone-logiciel"
      src={logoSap}
      alt=""
      aria-hidden="true"
      style={{ height: hauteur, width: "auto", verticalAlign: "-0.2em" }}
    />
  );
}

export function IconeAccess({ hauteur = "1.25em" }) {
  return (
    <img
      className="icone-logiciel"
      src={logoAccess}
      alt=""
      aria-hidden="true"
      style={{ height: hauteur, width: "auto", verticalAlign: "-0.25em" }}
    />
  );
}
