import type { Level } from "../levels";

export interface LogRecord {
	level: Level;
	time: number;
	scope: string | undefined;
	datetime: boolean;
	args: readonly unknown[];
}

export type Renderer = (record: LogRecord) => unknown[];
