import { describe, expect, test } from "@rstest/core";
import { describeRuntime } from "../src/index";

describe("describeRuntime", () => {
	test("names the runtime, with the platform under Node", () => {
		if (typeof window === "undefined") {
			expect(describeRuntime()).toMatch(/^node:\w+$/);
			expect(describeRuntime()).not.toBe("node:unknown");
		} else {
			expect(describeRuntime()).toBe("browser");
		}
	});
});
