import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
	plugins: [react()],
	server: {
		port: 5173,
		strictPort: true,
		proxy: {
			"/__x0_upload__": {
				target: "https://x0.at",
				changeOrigin: true,
				rewrite: () => "/"
			}
		}
	},
	build: {
		outDir: "dist"
	}
});
