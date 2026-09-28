import { describe, expect, test } from "@rstest/core";
import { BADGE_CSS, renderBrowser } from "../src/renderers/browser";
import { formatDatetime, LABELS, prepend } from "../src/renderers/prefix";
import { renderPretty } from "../src/renderers/pretty";
import type { LogRecord } from "../src/renderers/record";
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
