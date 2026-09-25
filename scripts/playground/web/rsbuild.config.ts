import { defineConfig } from "@rsbuild/core";

export default defineConfig({
	html: { title: "lololog playground" },
	// Rsbuild 2 binds to localhost ([::1]) by default, which the devcontainer port forward misses.
	server: { host: "0.0.0.0" },
	// Imports ../../../src directly, not dist/, so an edit in src/ hot-reloads the page.
	source: { entry: { index: "./index.ts" } },
});
