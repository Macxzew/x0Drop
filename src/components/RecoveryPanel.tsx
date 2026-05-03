import type { DownloadRecord } from "../types";
import { formatFileSize } from "../lib/x0";

type RecoveryPanelProps = {
	source: string;
	secretKey: string;
	searchQuery: string;
	isDownloading: boolean;
	downloads: DownloadRecord[];
	filteredDownloads: DownloadRecord[];
	latestDownloadKey: string | null;
	deletingDownloadId: number | null;
	onSourceChange: (value: string) => void;
	onSecretKeyChange: (value: string) => void;
	onSearchQueryChange: (value: string) => void;
	onDownload: () => void;
	onDownloadFromHistory: (download: DownloadRecord) => void;
	onCopySourceLink: (download: DownloadRecord) => void;
	onCopySecretKey: (download: DownloadRecord) => void;
	onDeleteDownload: (download: DownloadRecord) => void;
};

export function RecoveryPanel({
	source,
	secretKey,
	searchQuery,
	isDownloading,
	downloads,
	filteredDownloads,
	latestDownloadKey,
	deletingDownloadId,
	onSourceChange,
	onSecretKeyChange,
	onSearchQueryChange,
	onDownload,
	onDownloadFromHistory,
	onCopySourceLink,
	onCopySecretKey,
	onDeleteDownload
}: RecoveryPanelProps) {
	return (
		<section className="recoveryPanel">
			<div className="sectionTopRow">
				<div className="sectionLabel">Recover</div>
			</div>
			<div className="recoveryForm">
				<input
					className="recoveryInput"
					type="text"
					value={source}
					onChange={(event) => onSourceChange(event.target.value)}
					placeholder="https://x0.at/... or raw ID"
					aria-label="x0.at link or ID"
				/>
				<input
					className="recoveryInput"
					type="text"
					value={secretKey}
					onChange={(event) => onSecretKeyChange(event.target.value)}
					placeholder="Optional decryption key"
					aria-label="Decryption key"
				/>
				<button className="confirm" onClick={onDownload} disabled={isDownloading}>
					{isDownloading ? "Downloading..." : "Download"}
				</button>
			</div>

			<div className="recoveryHistory">
				<div className="recoveryHistoryTitle">Local recovery history</div>
				<div className="searchBar compactSearchBar">
					<svg className="searchIcon" viewBox="0 0 20 20" fill="none" aria-hidden="true">
						<circle cx="9" cy="9" r="5.75" stroke="currentColor" strokeWidth="1.8" />
						<path d="m13.5 13.5 3.25 3.25" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
					</svg>
					<input
						className="searchInput"
						type="search"
						value={searchQuery}
						onChange={(event) => onSearchQueryChange(event.target.value)}
						placeholder="Search recovered files"
						aria-label="Search recovered files"
					/>
				</div>
				{downloads.length === 0 ? (
					<div className="empty">No recovered files yet</div>
				) : filteredDownloads.length === 0 ? (
					<div className="empty">No matching recovered files</div>
				) : (
					<div className="historyScrollArea">
						{filteredDownloads.map((download) => (
							<div className="row" key={download.id}>
								<div className="meta">
									<div className="metaTopLine">
										<strong>{download.fileName}</strong>
										{`${download.downloadedAt}:${download.sourceUrl}:${download.fileName}` === latestDownloadKey && <span className="secureBadge">Latest</span>}
										{download.encrypted && <span className="secureBadge">Decrypted</span>}
									</div>
									<span>{formatFileSize(download.fileSize)}</span>
								</div>
								<div className="rowActions">
									<button
										className="iconButton"
										onClick={() => onDownloadFromHistory(download)}
										aria-label={`Download ${download.fileName} again`}
										title="Download again"
									>
										<svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
											<path d="M10 3.5v8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
											<path d="m6.75 8.75 3.25 3.5 3.25-3.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
											<path d="M4.5 14.5v.5A1.5 1.5 0 0 0 6 16.5h8a1.5 1.5 0 0 0 1.5-1.5v-.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
										</svg>
									</button>
									<button
										className="iconButton"
										onClick={() => onCopySourceLink(download)}
										aria-label={`Copy source link for ${download.fileName}`}
										title="Copy link"
									>
										<svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
											<rect x="7" y="3.5" width="9.5" height="11" rx="2" stroke="currentColor" strokeWidth="1.6" />
											<path d="M5.5 7.5H5A1.5 1.5 0 0 0 3.5 9v6A1.5 1.5 0 0 0 5 16.5h6A1.5 1.5 0 0 0 12.5 15v-.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
										</svg>
									</button>
									{download.encrypted && download.secretKey && (
										<button
											className="iconButton"
											onClick={() => onCopySecretKey(download)}
											aria-label={`Copy decryption key for ${download.fileName}`}
											title="Copy decryption key"
										>
											<svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
												<path
													d="M11.5 8A3.5 3.5 0 1 0 8 11.5h8.5V9.7h-1.8V8h-1.8V6.3h-1.4Z"
													stroke="currentColor"
													strokeWidth="1.6"
													strokeLinecap="round"
													strokeLinejoin="round"
												/>
												<circle cx="8" cy="8" r="0.8" fill="currentColor" />
											</svg>
										</button>
									)}
									<button
										className="iconButton dangerButton"
										onClick={() => onDeleteDownload(download)}
										disabled={deletingDownloadId === download.id}
										aria-label={`Remove ${download.fileName} from recovery history`}
										title="Remove from recovery history"
									>
										{deletingDownloadId === download.id ? (
											<span className="miniSpinner" aria-hidden="true" />
										) : (
											<svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
												<path d="M4.5 6h11" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
												<path d="M7.5 3.5h5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
												<path d="M6.5 6l.6 8.1A1.5 1.5 0 0 0 8.6 15.5h2.8a1.5 1.5 0 0 0 1.5-1.4l.6-8.1" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
												<path d="M8.5 8.5v4M11.5 8.5v4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
											</svg>
										)}
									</button>
								</div>
							</div>
						))}
					</div>
				)}
			</div>
		</section>
	);
}
