import type { Level } from "../levels";
import type { Progress } from "../spinner/progress";
import type { Color } from "../style/ansi";

export interface SpinnerView {
	status: string;
	progress: Progress;
	glyph: string;
	// undefined draws in the terminal's or the console's own text colour.
	color: Color | undefined;
}

export interface LogRecord {
	level: Level;
	time: number;
	scope: string | undefined;
	datetime: boolean;
	args: readonly unknown[];
	spinner?: SpinnerView;
}

export type Renderer = (record: LogRecord) => unknown[];
