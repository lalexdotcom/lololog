import { describe, expect, test } from "@rstest/core";
import { isoTime } from "../src/format/iso";

const SECOND = Date.UTC(2026, 8, 25, 10, 0, 0);

describe("isoTime", () => {
	test("pads milliseconds to three digits", () => {
		expect(isoTime(SECOND)).toBe("2026-09-25T10:00:00.000Z");
		expect(isoTime(SECOND + 7)).toBe("2026-09-25T10:00:00.007Z");
		expect(isoTime(SECOND + 42)).toBe("2026-09-25T10:00:00.042Z");
		expect(isoTime(SECOND + 999)).toBe("2026-09-25T10:00:00.999Z");
	});

	test("follows the clock into another second, forward or back", () => {
		expect(isoTime(SECOND + 999)).toBe("2026-09-25T10:00:00.999Z");
		expect(isoTime(SECOND + 1000)).toBe("2026-09-25T10:00:01.000Z");
		expect(isoTime(SECOND + 86_400_000)).toBe("2026-09-26T10:00:00.000Z");
		expect(isoTime(SECOND - 1)).toBe("2026-09-25T09:59:59.999Z");
	});

	test("matches toISOString before the epoch", () => {
		expect(isoTime(-1)).toBe(new Date(-1).toISOString());
	});
});
