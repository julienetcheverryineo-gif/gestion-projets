import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import {
  marquerNotificationLue,
  marquerNotificationsLues,
  supprimerNotification,
  useNotifications,
} from "../lib/notifications";
import {
  activerNotificationsPush,
  etatPermissionPush,
  mettreAJourPastilleAppli,
} from "../lib/push";

function formatRelatif(creeLe) {
  if (!creeLe?.toDate) return "";
  const diffMs = Date.now() - creeLe.toDate().getTime();
  const minutes = Math.round(diffMs / 60000);
  if (minutes < 1) return "à l'instant";
  if (minutes < 60) return "il y a " + minutes + " min";
  const heures = Math.round(minutes / 60);
  if (heures < 24) return "il y a " + heures + " h";
  const jours = Math.round(heures / 24);
  return "il y a " + jours + " j";
}

export default function NotificationsBell() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { documents: notifications } = useNotifications(user?.uid);
  const [ouvert, setOuvert] = useState(false);
  const [activationPush, setActivationPush] = useState("inactif"); // inactif | en_cours | ok | erreur
  const boutonRef = useRef(null);
  const [positionPanneau, setPositionPanneau] = useState(null);

  // La cloche vit dans la barre latérale, qui a overflow-x:hidden (pour
  // bannir tout ascenseur horizontal involontaire) : un panneau en
  // position:absolute y serait tronqué dès qu'il dépasse la largeur de la
  // colonne. On le sort donc du DOM de la sidebar via un portail, et on
  // calcule sa position en fixed à partir du bouton — ce qui l'affranchit
  // de tout ancêtre à overflow:hidden. Sur mobile, la cloche est dans le
  // bandeau du haut (pas concerné par ce souci) : on y laisse le CSS gérer
  // la position (bannière pleine largeur), d'où le repli sur `null` ci-dessous.
  useEffect(() => {
    if (!ouvert) return;
    const calculerPosition = () => {
      if (!boutonRef.current) return;
      if (window.innerWidth <= 860) {
        setPositionPanneau(null);
        return;
      }
      const rect = boutonRef.current.getBoundingClientRect();
      const largeurPanneau = 320;
      const marge = 12;
      const gauche = Math.min(rect.left, window.innerWidth - largeurPanneau - marge);
      setPositionPanneau({ top: rect.bottom + 8, left: Math.max(marge, gauche) });
    };
    calculerPosition();
    window.addEventListener("resize", calculerPosition);
    return () => window.removeEventListener("resize", calculerPosition);
  }, [ouvert]);

  const nonLues = notifications.filter((n) => !n.lu);

  // Tant que l'appli est ouverte (même en arrière-plan tant que le
  // processus n'est pas suspendu), on tient la pastille de l'icône à jour
  // en direct. Quand l'appli est fermée, c'est le service worker qui prend
  // le relais à la réception d'un push (voir onBackgroundMessage).
  useEffect(() => {
    mettreAJourPastilleAppli(nonLues.length);
  }, [nonLues.length]);

  const permissionPush = etatPermissionPush();
  const proposerActivationPush =
    permissionPush !== "indisponible" && permissionPush !== "granted";

  const ouvrirNotification = async (n) => {
    if (!n.lu) await marquerNotificationLue(n.id);
    setOuvert(false);
    if (n.lien) navigate(n.lien);
  };

  const toutMarquerLu = async () => {
    await marquerNotificationsLues(nonLues.map((n) => n.id));
  };

  // Suppression d'une notification précise : stopPropagation indispensable,
  // le bouton est imbriqué dans la ligne cliquable (qui, elle, ouvre la
  // notification) — sans ça, cliquer la croix déclencherait aussi l'ouverture.
  const supprimerUne = async (e, id) => {
    e.stopPropagation();
    await supprimerNotification(id);
  };

  const toutEffacer = async () => {
    if (!confirm("Supprimer toutes les notifications de la liste ?")) return;
    await Promise.all(notifications.map((n) => supprimerNotification(n.id)));
  };

  const activerPush = async () => {
    setActivationPush("en_cours");
    const ok = await activerNotificationsPush(user?.uid);
    setActivationPush(ok ? "ok" : "erreur");
  };

  return (
    <div className="notif-bell-wrap">
      <button
        ref={boutonRef}
        type="button"
        className="btn-ghost notif-bell-bouton"
        onClick={() => setOuvert((v) => !v)}
        aria-label="Notifications"
        title="Notifications"
      >
        🔔
        {nonLues.length > 0 && <span className="notif-badge">{nonLues.length}</span>}
      </button>

      {ouvert &&
        createPortal(
          <>
            <div className="notif-bell-backdrop" onClick={() => setOuvert(false)} />
            <div
              className="notif-bell-panel"
              style={
                positionPanneau
                  ? { position: "fixed", top: positionPanneau.top, left: positionPanneau.left }
                  : undefined
              }
            >
            <div className="notif-bell-entete">
              <strong>Notifications</strong>
              <div style={{ display: "flex", gap: 10 }}>
                {nonLues.length > 0 && (
                  <button type="button" className="link" onClick={toutMarquerLu}>
                    Tout marquer comme lu
                  </button>
                )}
                {notifications.length > 0 && (
                  <button type="button" className="link notif-bell-tout-effacer" onClick={toutEffacer}>
                    Tout effacer
                  </button>
                )}
              </div>
            </div>

            {proposerActivationPush && (
              <div className="notif-bell-push">
                <span className="simple-list-meta">
                  Recevez une alerte même l'appli fermée.
                </span>
                <button
                  type="button"
                  className="btn-accent"
                  onClick={activerPush}
                  disabled={activationPush === "en_cours" || activationPush === "ok"}
                >
                  {activationPush === "en_cours"
                    ? "Activation…"
                    : activationPush === "ok"
                      ? "Activé ✓"
                      : activationPush === "erreur"
                        ? "Réessayer"
                        : "Activer les notifications push"}
                </button>
              </div>
            )}

            {notifications.length === 0 ? (
              <p className="empty-state-description" style={{ margin: "10px 0" }}>
                Aucune notification pour l'instant.
              </p>
            ) : (
              <div className="notif-bell-liste">
                {notifications.slice(0, 30).map((n) => (
                  <div
                    key={n.id}
                    className={"notif-bell-item-row" + (n.lu ? "" : " notif-bell-item-non-lue")}
                  >
                    <button
                      type="button"
                      className="notif-bell-item"
                      onClick={() => ouvrirNotification(n)}
                    >
                      <div className="notif-bell-item-titre">{n.titre}</div>
                      {n.message && <div className="notif-bell-item-message">{n.message}</div>}
                      <div className="simple-list-meta">{formatRelatif(n.creeLe)}</div>
                    </button>
                    <button
                      type="button"
                      className="notif-bell-item-supprimer"
                      onClick={(e) => supprimerUne(e, n.id)}
                      aria-label="Supprimer cette notification"
                      title="Supprimer"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
          </>,
          document.body
        )}
    </div>
  );
}
