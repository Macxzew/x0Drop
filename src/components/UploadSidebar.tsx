import type { UploadAccessIssue } from "../appTypes";
import type { RefObject } from "react";

type UploadSidebarProps = {
	fileInputRef: RefObject<HTMLInputElement | null>;
	isSending: boolean;
	isOnline: boolean;
	pending: string[];
	uploadAccessIssue: UploadAccessIssue | null;
	onPickFiles: () => void;
	onFileInputChange: (event: React.ChangeEvent<HTMLInputElement>) => void | Promise<void>;
};

export function UploadSidebar({
	fileInputRef,
	isSending,
	isOnline,
	pending,
	uploadAccessIssue,
	onPickFiles,
	onFileInputChange
}: UploadSidebarProps) {
	const statusClassName = !isOnline ? "offline" : uploadAccessIssue?.kind === "blocked" ? "blocked" : uploadAccessIssue?.kind === "unreachable" ? "unreachable" : "online";
	const statusTitle = !isOnline ? "Offline" : uploadAccessIssue?.kind === "blocked" ? "Blocked" : uploadAccessIssue?.kind === "unreachable" ? "Unreachable" : "Available";

	return (
		<section className="dropzone">
			<div className="sectionTopRow">
				<div className="sectionLabel">Upload</div>
				<div className={`uploadAvailability ${statusClassName}`} aria-label="Upload status">
					<span className="statusDot" aria-hidden="true" />
					<span>{statusTitle}</span>
				</div>
			</div>
			<h1>x0 Desktop</h1>
			<p>Drop files</p>
			<input ref={fileInputRef} className="hiddenFileInput" type="file" multiple onChange={onFileInputChange} />
			<button className="picker" onClick={onPickFiles} disabled={isSending}>
				Select files
			</button>
			{pending.length > 0 && <div className="pending">{pending.join(", ")}</div>}
		</section>
	);
}
