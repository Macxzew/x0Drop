import type { FileDropItem } from "../../appTypes";
import { formatExpiry, formatFileSize } from "../../lib/x0";
import type { RetentionState } from "../../types";

type StageUploadModalProps = {
	primaryStagedFile: FileDropItem | null;
	stagedCountLabel: string;
	stagedFiles: FileDropItem[];
	stagedRetention: RetentionState | null;
	encryptBeforeUpload: boolean;
	isClosingStage: boolean;
	isSending: boolean;
	onClose: () => void;
	onEncryptBeforeUploadChange: (value: boolean) => void;
	onUpload: (files: FileDropItem[]) => void | Promise<void>;
};

export function StageUploadModal({
	primaryStagedFile,
	stagedCountLabel,
	stagedFiles,
	stagedRetention,
	encryptBeforeUpload,
	isClosingStage,
	isSending,
	onClose,
	onEncryptBeforeUploadChange,
	onUpload
}: StageUploadModalProps) {
	if (!primaryStagedFile) return null;

	return (
		<div
			className={`stageOverlay ${isClosingStage ? "closing" : ""}`}
			onClick={(event) => {
				// Blocage pendant envoi
				if (event.target === event.currentTarget && !isSending) {
					onClose();
				}
			}}
		>
			<div className={`stageCard ${isSending ? "sending" : ""}`}>
				<button className="closeStage" onClick={onClose} disabled={isSending} aria-label="Close">
					×
				</button>

				<div className="stageBody">
					<strong className="stageTitle">{primaryStagedFile.name}</strong>
					<div className="stageFileSize">{formatFileSize(primaryStagedFile.size)}</div>
					{stagedCountLabel && <div className="fileCount">{stagedCountLabel}</div>}

					<div className="fileIcon large" aria-hidden="true">
						<svg viewBox="0 0 64 64" fill="none">
							<path d="M18 8h20l12 12v32a4 4 0 0 1-4 4H18a4 4 0 0 1-4-4V12a4 4 0 0 1 4-4Z" stroke="currentColor" strokeWidth="2.5" />
							<path d="M38 8v12h12" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" />
							<path d="M22 34h20M22 42h20" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
						</svg>
					</div>

					<div className="stageMeta">
						<span>Auto delete</span>
						<strong>{stagedRetention ? formatExpiry(stagedRetention.expiresAt) : "Calculating..."}</strong>
					</div>
					<label className="toggleCard stageToggleCard">
						<input
							type="checkbox"
							checked={encryptBeforeUpload}
							onChange={(event) => onEncryptBeforeUploadChange(event.target.checked)}
							disabled={isSending}
						/>
						<span>
							<strong>Encrypt file before upload</strong>
							<small>x0.at receives only an unreadable `.x0e` payload.</small>
						</span>
					</label>
					{encryptBeforeUpload && <div className="secureCaption">Encrypted container upload enabled</div>}

					<button className="confirm" onClick={() => void onUpload(stagedFiles)} disabled={isSending}>
						{isSending ? (
							<span className="buttonBusy">
								<span className="spinner" aria-hidden="true" />
								Uploading...
							</span>
						) : (
							"Upload"
						)}
					</button>
				</div>
			</div>
		</div>
	);
}
