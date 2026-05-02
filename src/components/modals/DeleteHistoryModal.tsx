import type { UploadRecord } from "../../types";

type DeleteHistoryModalProps = {
	pendingDeleteUpload: UploadRecord | null;
	deletingId: number | null;
	isClosing: boolean;
	onCancel: () => void;
	onConfirm: () => void | Promise<void>;
};

export function DeleteHistoryModal({
	pendingDeleteUpload,
	deletingId,
	isClosing,
	onCancel,
	onConfirm
}: DeleteHistoryModalProps) {
	if (!pendingDeleteUpload) return null;

	return (
		<div
			className={`confirmOverlay ${isClosing ? "closing" : ""}`}
			role="dialog"
			aria-modal="true"
			aria-labelledby="delete-history-title"
			onClick={(event) => {
				if (event.target === event.currentTarget && deletingId !== pendingDeleteUpload.id) {
					onCancel();
				}
			}}
		>
			<div className="confirmCard">
				<strong className="confirmTitle" id="delete-history-title">
					Remove history entry?
				</strong>
				<p className="confirmText">
					<span className="confirmFileName">{pendingDeleteUpload.fileName}</span> will be removed from this app's local history
					only.
				</p>
				<p className="confirmText">
					The x0.at link can still remain accessible, and the file will still expire on its original remote expiry date.
				</p>
				<div className="confirmActions">
					<button onClick={onCancel} disabled={deletingId === pendingDeleteUpload.id}>
						Cancel
					</button>
					<button className="dangerSolidButton" onClick={() => void onConfirm()} disabled={deletingId === pendingDeleteUpload.id}>
						{deletingId === pendingDeleteUpload.id ? "Removing..." : "Remove from history"}
					</button>
				</div>
			</div>
		</div>
	);
}
