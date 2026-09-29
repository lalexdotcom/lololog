import { defineConfig } from "@rstest/core";

export default defineConfig({
	projects: [
		{
			name: "node",
			include: ["tests/**/*.test.ts"],
			testEnvironment: "node",
		},
		// One project per engine: V8 (Chromium), SpiderMonkey (Firefox), JavaScriptCore (WebKit)
		// format stacks differently, and limit's call-site keys depend on it. Run one at a time
		// (`pnpm test` does): rstest 0.12 refuses two browsers in one run ("Browser launch config
		// mismatch between projects").
		...(["chromium", "firefox", "webkit"] as const).map((browser) => ({
			name: `browser-${browser}`,
			include: ["tests/**/*.test.ts"],
			// The devcontainer has no display; CI is headless by default anyway.
			browser: { enabled: true, provider: "playwright" as const, browser, headless: true },
		})),
	],
});
