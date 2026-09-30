import { describe, expect, test } from "@rstest/core";
import { nodeOutput, streamSink } from "../src/sinks/stream";

function capture() {
	const chunks: unknown[] = [];
	const sink = streamSink({
		write: (chunk) => {
			chunks.push(chunk);
			return true;
		},
	});
	return { chunks, sink };
}

describe("streamSink", () => {
	test("writes each line and its newline as one chunk", () => {
		const { chunks, sink } = capture();
		sink.log(['{"msg":"a"}']);
		sink.log(["level=info msg=b"]);
		expect(chunks).toEqual(['{"msg":"a"}\n', "level=info msg=b\n"]);
	});

	test("is not live and pins nothing", () => {
		const { chunks, sink } = capture();
		expect(sink.live).toBe(false);
		sink.draw([["spinning"]]);
		sink.dispose();
		expect(chunks).toEqual([]);
	});
});

describe("nodeOutput", () => {
	test("is process.stdout, TTY or not", () => {
		const stdout = { write: () => true };
		const scope = { process: { getBuiltinModule: () => ({ stdout }) } };
		expect(nodeOutput(scope)).toBe(stdout);
	});

	test("is undefined outside Node", () => {
		expect(nodeOutput({})).toBeUndefined();
	});
});
