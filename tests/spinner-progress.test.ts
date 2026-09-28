import { describe, expect, test } from "@rstest/core";
import {
	completed,
	filled,
	NO_PROGRESS,
	nextProgress,
	percent,
	progressLabel,
	ratioOf,
} from "../src/spinner/progress";

describe("nextProgress", () => {
	test("keeps the current progress when the input carries none", () => {
		const current = { kind: "ratio", ratio: 0.3 } as const;
		expect(nextProgress(current, undefined)).toBe(current);
		expect(nextProgress(current, {})).toBe(current);
	});

	test("reads progress as a ratio clamped to [0, 1]", () => {
		expect(nextProgress(NO_PROGRESS, { progress: 0.42 })).toEqual({ kind: "ratio", ratio: 0.42 });
		expect(nextProgress(NO_PROGRESS, { progress: 1.5 })).toEqual({ kind: "ratio", ratio: 1 });
		expect(nextProgress(NO_PROGRESS, { progress: -1 })).toEqual({ kind: "ratio", ratio: 0 });
		expect(nextProgress(NO_PROGRESS, { progress: Number.NaN })).toEqual({
			kind: "ratio",
			ratio: 0,
		});
	});

	test("reads a count, done defaulting to 0 and clamped to [0, total]", () => {
		expect(nextProgress(NO_PROGRESS, { total: 10 })).toEqual({ kind: "count", done: 0, total: 10 });
		expect(nextProgress(NO_PROGRESS, { done: 12, total: 10 })).toEqual({
			kind: "count",
			done: 10,
			total: 10,
		});
		expect(nextProgress(NO_PROGRESS, { done: Number.NaN, total: 10 })).toEqual({
			kind: "count",
			done: 0,
			total: 10,
		});
	});

	test("turns a total that is not a positive finite number into 0", () => {
		expect(nextProgress(NO_PROGRESS, { done: 3, total: 0 })).toEqual({
			kind: "count",
			done: 0,
			total: 0,
		});
		expect(nextProgress(NO_PROGRESS, { total: Number.NaN })).toEqual({
			kind: "count",
			done: 0,
			total: 0,
		});
		expect(nextProgress(NO_PROGRESS, { total: -5 })).toEqual({ kind: "count", done: 0, total: 0 });
	});

	test("lets total win over progress when a plain JS caller sends both", () => {
		expect(nextProgress(NO_PROGRESS, { progress: 0.5, total: 4 })).toEqual({
			kind: "count",
			done: 0,
			total: 4,
		});
	});
});

describe("completed", () => {
	test("fills a ratio or a count, leaves an unbounded progress alone", () => {
		expect(completed({ kind: "ratio", ratio: 0.2 })).toEqual({ kind: "ratio", ratio: 1 });
		expect(completed({ kind: "count", done: 2, total: 7 })).toEqual({
			kind: "count",
			done: 7,
			total: 7,
		});
		expect(completed(NO_PROGRESS)).toBe(NO_PROGRESS);
	});
});

describe("ratioOf", () => {
	test("divides a count and never returns NaN", () => {
		expect(ratioOf({ kind: "count", done: 3, total: 12 })).toBe(0.25);
		expect(ratioOf({ kind: "count", done: 0, total: 0 })).toBe(0);
		expect(ratioOf(NO_PROGRESS)).toBe(0);
	});
});

describe("filled", () => {
	test("is empty at 0 and full at 1 only", () => {
		expect(filled(0, 10)).toBe(0);
		expect(filled(1, 10)).toBe(10);
		expect(filled(1, 8)).toBe(8);
	});

	test("spreads (0, 1) evenly over the cells between, keeping one full and one empty", () => {
		expect(filled(0.001, 10)).toBe(1);
		expect(filled(0.11, 10)).toBe(1);
		expect(filled(0.12, 10)).toBe(2);
		expect(filled(0.42, 10)).toBe(4);
		expect(filled(0.999, 10)).toBe(9);
		expect(filled(7 / 120, 8)).toBe(1);
		expect(filled(119 / 120, 8)).toBe(7);
	});
});

describe("percent", () => {
	test("floors, but never reads 0 above 0 nor 100 below 1", () => {
		expect(percent(0)).toBe(0);
		expect(percent(0.004)).toBe(1);
		expect(percent(0.42)).toBe(42);
		expect(percent(0.999)).toBe(99);
		expect(percent(1)).toBe(100);
	});
});

describe("progressLabel", () => {
	test("pads a percent to 4 characters on request", () => {
		expect(progressLabel({ kind: "ratio", ratio: 0.07 }, true)).toBe("  7%");
		expect(progressLabel({ kind: "ratio", ratio: 1 }, true)).toBe("100%");
		expect(progressLabel({ kind: "ratio", ratio: 0.07 }, false)).toBe("7%");
	});

	test("right-aligns done on the width of total on request", () => {
		expect(progressLabel({ kind: "count", done: 7, total: 120 }, true)).toBe("  7/120");
		expect(progressLabel({ kind: "count", done: 7, total: 120 }, false)).toBe("7/120");
		expect(progressLabel({ kind: "count", done: 0, total: 0 }, true)).toBe("0/0");
	});
});
