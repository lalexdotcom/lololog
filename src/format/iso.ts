let cachedSecond = Number.NaN;
let cachedPrefix = "";

// Date#toISOString costs about 310 ns a call (Node 24), the largest share of a json line.
// Everything down to the second is kept from one call to the next, so a busy logger formats
// the milliseconds only. The price is about 50 ns on a line that lands in a new second.
export function isoTime(time: number): string {
	const second = Math.floor(time / 1000);
	if (second !== cachedSecond) {
		cachedSecond = second;
		cachedPrefix = new Date(second * 1000).toISOString().slice(0, 20);
	}
	const ms = time - second * 1000;
	return `${cachedPrefix}${ms < 10 ? "00" : ms < 100 ? "0" : ""}${ms}Z`;
}
