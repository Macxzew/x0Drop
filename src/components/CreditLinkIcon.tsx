import type { CreditProfile } from "../lib/x0";

export function CreditLinkIcon({ kind }: { kind: CreditProfile["links"][number]["kind"] }) {
	if (kind === "project") {
		return (
			<svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
				<path d="M7 5.5H5.5A2.5 2.5 0 0 0 3 8v6.5A2.5 2.5 0 0 0 5.5 17h9A2.5 2.5 0 0 0 17 14.5v-9A2.5 2.5 0 0 0 14.5 3H8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
				<path d="M8 3h4v4H8z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
			</svg>
		);
	}

	if (kind === "site") {
		return (
			<svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
				<circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.6" />
				<path d="M3.5 10h13M10 3.2c1.8 1.9 2.8 4.3 2.8 6.8 0 2.5-1 4.9-2.8 6.8M10 3.2C8.2 5.1 7.2 7.5 7.2 10c0 2.5 1 4.9 2.8 6.8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
			</svg>
		);
	}

	return (
		<svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
			<path d="M10 3.2a6.8 6.8 0 0 0-2.15 13.25c.34.06.47-.15.47-.34v-1.2c-1.92.42-2.33-.81-2.33-.81-.32-.8-.78-1.01-.78-1.01-.64-.43.05-.42.05-.42.7.05 1.08.72 1.08.72.63 1.06 1.64.76 2.04.58.06-.45.24-.76.44-.94-1.54-.17-3.15-.76-3.15-3.4 0-.75.27-1.36.71-1.84-.07-.18-.31-.9.07-1.87 0 0 .58-.18 1.9.7a6.7 6.7 0 0 1 3.46 0c1.32-.88 1.9-.7 1.9-.7.38.97.14 1.69.07 1.87.45.48.71 1.09.71 1.84 0 2.65-1.61 3.23-3.16 3.39.25.21.48.62.48 1.25v1.86c0 .19.12.4.48.34A6.8 6.8 0 0 0 10 3.2Z" fill="currentColor" />
		</svg>
	);
}
