import type { ToastState } from "../appTypes";

type AppToastProps = {
	toast: ToastState | null;
	isClosing: boolean;
};

export function AppToast({ toast, isClosing }: AppToastProps) {
	if (!toast) return null;

	return (
		<div className={`toast ${toast.kind} ${isClosing ? "closing" : ""}`}>
			<div className="toastHead">
				<strong>{toast.title}</strong>
			</div>
			{toast.detail && <div className="toastDetail">{toast.detail}</div>}
		</div>
	);
}
