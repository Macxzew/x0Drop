import { useEffect, useState } from "react";
import type { FileDropItem } from "../appTypes";
import type { RetentionState } from "../types";
import { calculateRetention } from "../lib/x0";

export function useStagedRetention(stagedFiles: FileDropItem[]) {
	const [stagedRetention, setStagedRetention] = useState<RetentionState | null>(null);

	useEffect(() => {
		if (stagedFiles.length === 0) {
			setStagedRetention(null);
			return;
		}

		const file = stagedFiles[0];
		if (file.size > 0) {
			setStagedRetention(calculateRetention(file.size, new Date().toISOString()));
			return;
		}

		setStagedRetention(null);
	}, [stagedFiles]);

	return { stagedRetention, setStagedRetention };
}
