export const LIVE_FRAMES: readonly string[] = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

// A frame that turns reads as "running" only when redrawn in place; a console that writes a new
// line per tick needs a glyph that means it on its own.
export const STATIC_FRAME = "↻";

let segmenter: Intl.Segmenter | undefined;

// Graphemes, not code points: a flag or a ZWJ emoji is several code points drawn as one glyph.
export function splitFrames(glyph: string): string[] {
	segmenter ??= new Intl.Segmenter();
	return Array.from(segmenter.segment(glyph), ({ segment }) => segment);
}

export function frameAt(
	frames: readonly string[] | undefined,
	index: number,
	live: boolean,
): string {
	if (frames === undefined)
		return live ? (LIVE_FRAMES[index % LIVE_FRAMES.length] ?? "") : STATIC_FRAME;
	return (live ? frames[index % frames.length] : frames[0]) ?? "";
}
