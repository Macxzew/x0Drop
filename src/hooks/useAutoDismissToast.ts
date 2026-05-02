import { useEffect, useState } from "react";
import type { ToastState } from "../appTypes";

export function useAutoDismissToast(toast: ToastState | null, closeToast: () => void) {
	useEffect(() => {
		if (!toast) return;
		const timeout = window.setTimeout(() => {
			closeToast();
		}, 4200);
		return () => window.clearTimeout(timeout);
	}, [closeToast, toast]);
}
