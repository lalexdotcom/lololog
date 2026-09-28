import { describe, expect, test } from "@rstest/core";
import { BADGE_CSS, renderBrowser } from "../src/renderers/browser";
import { formatDatetime, LABELS, prepend } from "../src/renderers/prefix";
import { renderPretty } from "../src/renderers/pretty";
import type { LogRecord, SpinnerView } from "../src/renderers/record";
import { BADGES, center, renderTty } from "../src/renderers/tty";

const TIME = Date.UTC(2026, 8, 25, 10);
const DATE = new Intl.DateTimeFormat(undefined, { dateStyle: "short", timeStyle: "medium" }).format(
	TIME,
);

function record(overrides: Partial<LogRecord> = {}): LogRecord {
	return {
		level: "warn",
		time: TIME,
		scope: undefined,
		datetime: false,
		args: ["hi"],
		...overrides,
	};
}

const T = "\u001B[38;5;80m";
const GR = "\u001B[32m";
const RD = "\u001B[31m";
const LG = "\u001B[38;5;252m";
const R = "\u001B[0m";

function view(overrides: Partial<SpinnerView> = {}): SpinnerView {
	return {
		id: 1,
		status: "running",
		progress: { kind: "none" },
		glyph: "⠋",
		color: "turquoise",
		...overrides,
	};
}

function spinning(spinner: SpinnerView): LogRecord {
	return record({ args: ["%s", "load"], spinner });
}

describe("prefix helpers", () => {
	test("labels are the level keys in upper case", () => {
		expect(LABELS.success).toBe("SUCCESS");
		expect(LABELS.wth).toBe("WTH");
	});

	test("formatDatetime uses the runtime locale, short date and medium time", () => {
		expect(formatDatetime(TIME)).toBe(DATE);
	});

	test("prepend joins a string first argument so its specifiers stay live", () => {
		expect(prepend("[P]", ["user %s", "bob"])).toEqual(["[P] user %s", "bob"]);
	});

	test("prepend passes the prefix alone before a non-string first argument", () => {
		const data = { id: 1 };
		expect(prepend("[P]", [data, "x"])).toEqual(["[P]", data, "x"]);
		expect(prepend("[P]", [])).toEqual(["[P]"]);
	});

	test("prepend puts the prefix styles right after the format", () => {
		expect(prepend("%cP%c", ["hi", 1], ["a", "b"])).toEqual(["%cP%c hi", "a", "b", 1]);
		expect(prepend("%cP%c", [1], ["a", "b"])).toEqual(["%cP%c", "a", "b", 1]);
	});
});

describe("renderPretty", () => {
	test("brackets the label without padding", () => {
		expect(renderPretty(record())).toEqual(["[WARN] hi"]);
	});

	test("puts the scope after the brackets", () => {
		expect(renderPretty(record({ scope: "db" }))).toEqual(["[WARN] <db> hi"]);
	});

	test("adds the date as its own bracketed block", () => {
		expect(renderPretty(record({ datetime: true }))).toEqual([`[WARN] [${DATE}] hi`]);
	});
});

describe("renderTty", () => {
	test("centres labels on the longest label plus one space each side", () => {
		expect(center("WARN", 9)).toBe("  WARN   ");
		expect(center("SUCCESS", 9)).toBe(" SUCCESS ");
	});

	test("paints the badge in the level colours", () => {
		expect(BADGES.warn).toBe("\u001B[30;48;5;208m  WARN   \u001B[0m");
		expect(renderTty(record())).toEqual([`${BADGES.warn} hi`]);
	});

	test("paints the scope in chevrons as a badge in the wth colours, one space each side", () => {
		expect(renderTty(record({ scope: "db" }))).toEqual([
			`${BADGES.warn} \u001B[30;48;5;252m <db> \u001B[0m hi`,
		]);
	});

	test("writes the date in lightgray", () => {
		expect(renderTty(record({ datetime: true }))).toEqual([
			`${BADGES.warn} \u001B[38;5;252m[${DATE}]\u001B[0m hi`,
		]);
	});
});

describe("renderBrowser", () => {
	test("draws the label as a padded, rounded badge", () => {
		expect(BADGE_CSS.warn).toBe(
			"color: black; background-color: orange; padding: 1px 4px; border-radius: 4px",
		);
		expect(renderBrowser(record({ args: ["user %s", "bob"] }))).toEqual([
			"%cWARN%c user %s",
			BADGE_CSS.warn,
			"",
			"bob",
		]);
	});

	test("draws the scope in chevrons, outlined in the wth background colour", () => {
		expect(renderBrowser(record({ scope: "db" }))).toEqual([
			"%cWARN%c %c<db>%c hi",
			BADGE_CSS.warn,
			"",
			"border: 1px solid lightgray; padding: 0 4px; border-radius: 4px",
			"",
		]);
	});

	test("puts the scope before the date", () => {
		expect(renderBrowser(record({ scope: "db", datetime: true }))).toEqual([
			`%cWARN%c %c<db>%c %c[${DATE}]%c hi`,
			BADGE_CSS.warn,
			"",
			"border: 1px solid lightgray; padding: 0 4px; border-radius: 4px",
			"",
			"color: lightgray",
			"",
		]);
	});

	test("adds the date in lightgray after the badge", () => {
		expect(renderBrowser(record({ datetime: true }))).toEqual([
			`%cWARN%c %c[${DATE}]%c hi`,
			BADGE_CSS.warn,
			"",
			"color: lightgray",
			"",
		]);
	});
});

describe("renderTty spinner", () => {
	test("draws an unbounded spinner as its glyph in parentheses, in its colour", () => {
		expect(renderTty(spinning(view()))).toEqual([`${BADGES.warn} ${T}(⠋)${R} %s`, "load"]);
	});

	test("leaves the default text colour alone", () => {
		expect(renderTty(spinning(view({ status: "closed", glyph: "●", color: undefined })))).toEqual([
			`${BADGES.warn} (●) %s`,
			"load",
		]);
	});

	test("draws a running bounded spinner as a 10-cell bar and a padded label, no glyph", () => {
		const progress = { kind: "ratio", ratio: 0.42 } as const;
		expect(renderTty(spinning(view({ progress })))).toEqual([
			`${BADGES.warn} ${T}━━━━${R}${LG}──────${R}  42% %s`,
			"load",
		]);
	});

	test("puts the final glyph before an 8-cell bar", () => {
		const done = { kind: "ratio", ratio: 1 } as const;
		expect(
			renderTty(spinning(view({ status: "success", progress: done, glyph: "✔", color: "green" }))),
		).toEqual([`${BADGES.warn} ${GR}✔${R} ${GR}━━━━━━━━${R} 100% %s`, "load"]);
		const count = { kind: "count", done: 7, total: 120 } as const;
		expect(
			renderTty(spinning(view({ status: "fail", progress: count, glyph: "✖", color: "red" }))),
		).toEqual([`${BADGES.warn} ${RD}✖${R} ${RD}━${R}${LG}───────${R}   7/120 %s`, "load"]);
	});
});

describe("renderPretty spinner", () => {
	test("draws an unbounded spinner as its glyph in parentheses", () => {
		expect(renderPretty(spinning(view({ glyph: "↻" })))).toEqual(["[WARN] (↻) %s", "load"]);
	});

	test("draws a running bounded spinner as its unpadded label in parentheses", () => {
		expect(renderPretty(spinning(view({ progress: { kind: "ratio", ratio: 0.42 } })))).toEqual([
			"[WARN] (42%) %s",
			"load",
		]);
	});

	test("puts the final glyph before the label", () => {
		const count = { kind: "count", done: 7, total: 120 } as const;
		expect(renderPretty(spinning(view({ status: "fail", progress: count, glyph: "✖" })))).toEqual([
			"[WARN] ✖ (7/120) %s",
			"load",
		]);
	});
});

function barCss(color: string, pct: number): string {
	return `font-family: monospace; background: linear-gradient(to right, ${color} 0%, ${color} ${pct}%, lightgrey ${pct}%, lightgrey 100%); padding: 0px 48px; line-height: 0.5; border-radius: 2px`;
}

describe("renderBrowser spinner", () => {
	test("draws an unbounded spinner as a monospace glyph in its colour", () => {
		expect(renderBrowser(spinning(view({ glyph: "↻" })))).toEqual([
			"%cWARN%c %c(%s)%c %s",
			BADGE_CSS.warn,
			"",
			"font-family: monospace; color: turquoise",
			"↻",
			"",
			"load",
		]);
	});

	test("draws a running bounded spinner as a gradient bar and a padded monospace label", () => {
		expect(renderBrowser(spinning(view({ progress: { kind: "ratio", ratio: 0.42 } })))).toEqual([
			"%cWARN%c %c %c %c%s%c %s",
			BADGE_CSS.warn,
			"",
			barCss("turquoise", 42),
			"",
			"font-family: monospace",
			" 42%",
			"",
			"load",
		]);
	});

	test("puts the final glyph before the full-width bar, currentColor without a colour", () => {
		const count = { kind: "count", done: 7, total: 120 } as const;
		expect(
			renderBrowser(
				spinning(view({ status: "closed", progress: count, glyph: "●", color: undefined })),
			),
		).toEqual([
			"%cWARN%c %c%s%c %c %c %c%s%c %s",
			BADGE_CSS.warn,
			"",
			"font-family: monospace",
			"●",
			"",
			barCss("currentColor", 5),
			"",
			"font-family: monospace",
			"  7/120",
			"",
			"load",
		]);
	});
});
