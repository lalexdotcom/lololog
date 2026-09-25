import { defineConfig } from "@rstest/core";

export default defineConfig({
	projects: [
		{
			name: "node",
			include: ["tests/**/*.test.ts"],
			testEnvironment: "node",
		},
		{
			name: "browser",
			include: ["tests/**/*.test.ts"],
			// The devcontainer has no display; CI is headless by default anyway.
			browser: { enabled: true, provider: "playwright", headless: true },
		},
	],
});
