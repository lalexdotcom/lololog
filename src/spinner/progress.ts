export type Progress =
	| { kind: "none" }
	| { kind: "ratio"; ratio: number }
	| { kind: "count"; done: number; total: number };

export interface ProgressInput {
	progress?: number;
	done?: number;
	total?: number;
}

export const NO_PROGRESS: Progress = Object.freeze({ kind: "none" });

// Not Math.max(0, …): NaN would pass through it, and every label would read NaN.
function clamp(value: number, max: number): number {
	return value > 0 ? Math.min(value, max) : 0;
}

export function nextProgress(current: Progress, input: ProgressInput | undefined): Progress {
	if (input?.total !== undefined) {
		const total = Number.isFinite(input.total) && input.total > 0 ? input.total : 0;
		return { kind: "count", done: clamp(input.done ?? 0, total), total };
	}
	if (input?.progress !== undefined) return { kind: "ratio", ratio: clamp(input.progress, 1) };
	return current;
}

export function completed(progress: Progress): Progress {
	if (progress.kind === "ratio") return { kind: "ratio", ratio: 1 };
	if (progress.kind === "count")
		return { kind: "count", done: progress.total, total: progress.total };
	return progress;
}

export function ratioOf(progress: Progress): number {
	if (progress.kind === "ratio") return progress.ratio;
	if (progress.kind === "count") return progress.total > 0 ? progress.done / progress.total : 0;
	return 0;
}

// A plain floor would give the first cell two steps; spreading (0, 1) over the cells between
// keeps every step equal while any progress shows a cell and none short of 1 fills the bar.
export function filled(ratio: number, width: number): number {
	if (ratio <= 0) return 0;
	if (ratio >= 1) return width;
	return 1 + Math.floor(ratio * (width - 1));
}

export function percent(ratio: number): number {
	if (ratio <= 0) return 0;
	if (ratio >= 1) return 100;
	return Math.max(1, Math.floor(ratio * 100));
}

export function progressLabel(progress: Progress, pad: boolean): string {
	if (progress.kind === "count") {
		const done = String(progress.done);
		const total = String(progress.total);
		return `${pad ? done.padStart(total.length) : done}/${total}`;
	}
	const value = String(percent(ratioOf(progress)));
	return `${pad ? value.padStart(3) : value}%`;
}
