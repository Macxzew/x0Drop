import { useEffect, useState } from "react";
import { calculateRetention } from "../lib/x0";
import type { RetentionState, UploadRecord } from "../types";

export function useRetentionMap(uploads: UploadRecord[], apiAvailable: boolean) {
	const [retentionMap, setRetentionMap] = useState<Record<number, RetentionState>>({});

	useEffect(() => {
		let cancelled = false;

		async function refreshRetention() {
			// Sync rétention
			const entries = await Promise.all(
				uploads.map(async (upload) => ({
					id: upload.id,
					state: apiAvailable
						? await window.x0Desk.getRetention(upload.fileSize, upload.uploadedAt)
						: calculateRetention(upload.fileSize, upload.uploadedAt)
				}))
			);

			if (!cancelled) {
				setRetentionMap(Object.fromEntries(entries.map((entry) => [entry.id, entry.state])));
			}
		}

		void refreshRetention();
		const interval = window.setInterval(() => {
			void refreshRetention();
		}, 60_000);

		return () => {
			cancelled = true;
			window.clearInterval(interval);
		};
	}, [apiAvailable, uploads]);

	return { retentionMap, setRetentionMap };
}
