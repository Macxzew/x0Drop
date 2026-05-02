import { CreditLinkIcon } from "../CreditLinkIcon";
import { CREDIT_PROFILES } from "../../lib/x0";

type AboutModalProps = {
	isOpen: boolean;
	isClosing: boolean;
	onClose: () => void;
	onOpenLink: (target: string) => void;
};

export function AboutModal({ isOpen, isClosing, onClose, onOpenLink }: AboutModalProps) {
	if (!isOpen) return null;

	return (
		<div
			className={`confirmOverlay ${isClosing ? "closing" : ""}`}
			role="dialog"
			aria-modal="true"
			aria-labelledby="about-app-title"
			onClick={(event) => {
				// Fermeture overlay
				if (event.target === event.currentTarget) {
					onClose();
				}
			}}
		>
			<div className="confirmCard infoCard">
				<button className="closeStage" onClick={onClose} aria-label="Close">
					×
				</button>
				<strong className="confirmTitle" id="about-app-title">
					About x0Drop
				</strong>
				<p className="confirmText">Independent desktop client. Credits below are for the service stack, not this app.</p>
				<div className="profileGrid">
					{CREDIT_PROFILES.map((profile) => (
						<div key={profile.name} className="profileCard">
							<button
								className="profileIdentity"
								onClick={() => onOpenLink(profile.profileHref)}
								aria-label={`Open ${profile.name} profile in your browser`}
							>
								<img className="profileAvatar" src={profile.avatar} alt="" loading="lazy" />
								<div className="profileMeta">
									<strong>{profile.name}</strong>
									<span>{profile.role}</span>
								</div>
							</button>
							<p className="profileNote">{profile.note}</p>
							<div className="profileLinks">
								{profile.links.map((link) => (
									<button
										key={link.href}
										className="profileIconLink"
										onClick={() => onOpenLink(link.href)}
										aria-label={`${profile.name} ${link.label}`}
										title={link.label}
									>
										<CreditLinkIcon kind={link.kind} />
									</button>
								))}
							</div>
						</div>
					))}
				</div>
			</div>
		</div>
	);
}
