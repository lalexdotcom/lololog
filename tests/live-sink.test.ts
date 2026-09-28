import { describe, expect, test } from "@rstest/core";
import { LiveSink, truncate } from "../src/sinks/live";
import { fakeTerminal } from "./fake-terminal";

const HIDE = "\u001B[?25l";
const SHOW = "\u001B[?25h";
const up = (n: number) => `\u001B[${n}A\u001B[0J`;

function sink(options?: { columns?: number; rows?: number }) {
	const fake = fakeTerminal(options);
	return { fake, live: new LiveSink(fake.terminal, true) };
}

describe("truncate", () => {
	test("cuts at the visible width, skipping ANSI sequences, and resets a cut style", () => {
		expect(truncate("abcdefgh", 5)).toBe("abcde");
		expect(truncate("abc", 5)).toBe("abc");
		expect(truncate("\u001B[31mabcdefgh\u001B[0m", 5)).toBe("\u001B[31mabcde\u001B[0m");
		expect(truncate("\u001B[31mab\u001B[0m", 5)).toBe("\u001B[31mab\u001B[0m");
		expect(truncate("abc", 0)).toBe("");
	});
});

describe("LiveSink zone", () => {
	test("is live", () => {
		expect(sink().live.live).toBe(true);
	});

	test("writes plain lines when no zone is drawn", () => {
		const { fake, live } = sink();
		live.log(["hello %s", "you"]);
		expect(fake.out).toEqual(["hello you\n"]);
	});

	test("hides the cursor with the first zone line, and shows it when the zone empties", () => {
		const { fake, live } = sink();
		live.draw([["a"]]);
		live.draw([["b"], ["c"]]);
		live.draw([]);
		expect(fake.out).toEqual([`${HIDE}a\n`, `${up(1)}b\nc\n`, `${up(2)}${SHOW}`]);
	});

	test("writes a log above the zone in one write", () => {
		const { fake, live } = sink();
		live.draw([["a"]]);
		live.log(["x"]);
		expect(fake.out[1]).toBe(`${up(1)}x\na\n`);
	});

	test("replaces the zone along with a log when given one", () => {
		const { fake, live } = sink();
		live.draw([["a"], ["b"]]);
		live.log(["done"], [["b"]]);
		expect(fake.out[1]).toBe(`${up(2)}done\nb\n`);
	});

	test("caps the zone at rows - 1, folding the rest into a count", () => {
		const { fake, live } = sink({ rows: 3 });
		live.draw([["a"], ["b"], ["c"], ["d"]]);
		expect(fake.out).toEqual([`${HIDE}a\n… +3\n`]);
	});

	test("survives a terminal one row high or a few columns wide", () => {
		const { fake, live } = sink({ rows: 1, columns: 2 });
		live.draw([["abc"], ["def"]]);
		live.draw([]);
		expect(fake.out).toEqual([`${HIDE}… \n`, `${up(1)}${SHOW}`]);
	});

	test("truncates each zone line to the columns", () => {
		const { fake, live } = sink({ columns: 4 });
		live.draw([["abcdefgh"]]);
		expect(fake.out).toEqual([`${HIDE}abcd\n`]);
	});

	test("reads rows and columns at every draw", () => {
		const { fake, live } = sink({ columns: 80 });
		live.draw([["abcdefgh"]]);
		fake.terminal.stdout.columns = 3;
		live.draw([["abcdefgh"]]);
		expect(fake.out[1]).toBe(`${up(1)}abc\n`);
	});

	test("shows the cursor on exit while the zone is drawn, and only then", () => {
		const { fake, live } = sink();
		live.draw([["a"]]);
		fake.exit();
		expect(fake.out.at(-1)).toBe(SHOW);
		live.draw([]);
		const written = fake.out.length;
		fake.exit();
		expect(fake.out).toHaveLength(written);
	});

	test("erases its zone and shows the cursor when disposed", () => {
		const { fake, live } = sink();
		live.draw([["a"]]);
		live.dispose();
		expect(fake.out.at(-1)).toBe(`${up(1)}${SHOW}`);
	});
});
