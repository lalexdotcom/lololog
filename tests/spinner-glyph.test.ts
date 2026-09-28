import { describe, expect, test } from "@rstest/core";
import { frameAt, LIVE_FRAMES, STATIC_FRAME, splitFrames } from "../src/spinner/glyph";

describe("splitFrames", () => {
	test("splits into grapheme clusters, so a composed emoji stays one frame", () => {
		expect(splitFrames("◐◓◑◒")).toEqual(["◐", "◓", "◑", "◒"]);
		expect(splitFrames("👩‍💻🇫🇷")).toEqual(["👩‍💻", "🇫🇷"]);
		expect(splitFrames("")).toEqual([]);
	});
});

describe("frameAt", () => {
	test("cycles the live default frames, and shows the static one elsewhere", () => {
		expect(LIVE_FRAMES).toEqual(["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"]);
		expect(frameAt(undefined, 0, true)).toBe("⠋");
		expect(frameAt(undefined, 11, true)).toBe("⠙");
		expect(frameAt(undefined, 11, false)).toBe(STATIC_FRAME);
	});

	test("cycles custom frames live, and keeps the first one elsewhere", () => {
		expect(frameAt(["a", "b", "c"], 4, true)).toBe("b");
		expect(frameAt(["a", "b", "c"], 4, false)).toBe("a");
	});
});
