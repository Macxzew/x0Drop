import { formatFileSize, formatRemaining } from "../lib/x0";
import type { RetentionState, UploadRecord } from "../types";

type HistoryListProps = {
	uploads: UploadRecord[];
	filteredUploads: UploadRecord[];
	latestUploadKey: string | null;
	retentionMap: Record<number, RetentionState>;
	deletingId: number | null;
	searchQuery: string;
	onSearchQueryChange: (value: string) => void;
	onDownloadUpload: (upload: UploadRecord) => void;
	onCopyLink: (upload: UploadRecord) => void;
	onCopySecret: (upload: UploadRecord) => void;
	onDeleteRequest: (upload: UploadRecord) => void;
};

export function HistoryList({
	uploads,
	filteredUploads,
	latestUploadKey,
	retentionMap,
	deletingId,
	searchQuery,
	onSearchQueryChange,
	onDownloadUpload,
	onCopyLink,
	onCopySecret,
	onDeleteRequest
}: HistoryListProps) {
	return (
		<section className="list">
			<div className="sectionLabel">History</div>
			<div className="searchBar">
				<svg className="searchIcon" viewBox="0 0 20 20" fill="none" aria-hidden="true">
					<circle cx="9" cy="9" r="5.75" stroke="currentColor" strokeWidth="1.8" />
					<path d="m13.5 13.5 3.25 3.25" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
				</svg>
				<input
					className="searchInput"
					type="search"
					value={searchQuery}
					onChange={(event) => onSearchQueryChange(event.target.value)}
					placeholder="Search upload history"
					aria-label="Search upload history"
				/>
			</div>

			{uploads.length === 0 ? (
				<div className="empty">No uploads</div>
			) : filteredUploads.length === 0 ? (
				<div className="empty">No matching uploads</div>
			) : (
				<div className="historyScrollArea">
					{filteredUploads.map((upload) => (
						<div className="row" key={upload.id}>
							<div className="meta">
								<div className="metaTopLine">
									<strong>{upload.fileName}</strong>
									<span className="fileSizeInline">{formatFileSize(upload.fileSize)}</span>
									{`${upload.uploadedAt}:${upload.url}` === latestUploadKey && <span className="secureBadge">Latest</span>}
									{upload.encrypted && <span className="secureBadge">Encrypted</span>}
								</div>
								<span>{retentionMap[upload.id] ? formatRemaining(retentionMap[upload.id].remainingMs) : "..."}</span>
							</div>
							<div className="rowActions">
								<button
									className="iconButton"
									onClick={() => onDownloadUpload(upload)}
									aria-label={`Download ${upload.fileName}`}
									title="Download"
								>
									<svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
										<path d="M10 3.5v8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
										<path d="m6.75 8.75 3.25 3.5 3.25-3.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
										<path d="M4.5 14.5v.5A1.5 1.5 0 0 0 6 16.5h8a1.5 1.5 0 0 0 1.5-1.5v-.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
									</svg>
								</button>
								<button
									className="iconButton"
									onClick={() => onCopyLink(upload)}
									aria-label={`Copy link for ${upload.fileName}`}
									title="Copy link"
								>
									<svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
										<rect x="7" y="3.5" width="9.5" height="11" rx="2" stroke="currentColor" strokeWidth="1.6" />
										<path d="M5.5 7.5H5A1.5 1.5 0 0 0 3.5 9v6A1.5 1.5 0 0 0 5 16.5h6A1.5 1.5 0 0 0 12.5 15v-.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
									</svg>
								</button>
								{upload.encrypted && upload.secretKey && (
									<button
										className="iconButton"
										onClick={() => onCopySecret(upload)}
										aria-label={`Copy decryption key for ${upload.fileName}`}
										title="Copy decryption key"
									>
										<svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
											<path d="M11.5 8A3.5 3.5 0 1 0 8 11.5h8.5V9.7h-1.8V8h-1.8V6.3h-1.4Z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
											<circle cx="8" cy="8" r="0.8" fill="currentColor" />
										</svg>
									</button>
								)}
								<button
									className="iconButton dangerButton"
									onClick={() => onDeleteRequest(upload)}
									disabled={deletingId === upload.id}
									aria-label={`Remove ${upload.fileName} from history`}
									title="Remove from history"
								>
									{deletingId === upload.id ? (
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
		</section>
	);
}
