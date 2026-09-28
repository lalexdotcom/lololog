import { progressLabel } from "../spinner/progress";
import { formatDatetime, LABELS, prepend } from "./prefix";
import type { Renderer, SpinnerView } from "./record";

export function prettyIndicator({ status, progress, glyph }: SpinnerView): string {
	if (progress.kind === "none") return `(${glyph})`;
	const label = `(${progressLabel(progress, false)})`;
	return status === "running" ? label : `${glyph} ${label}`;
}

export const renderPretty: Renderer = ({ level, time, scope, datetime, args, spinner }) => {
	let prefix = `[${LABELS[level]}]`;
	if (scope !== undefined) prefix += ` <${scope}>`;
	if (datetime) prefix += ` [${formatDatetime(time)}]`;
	if (spinner !== undefined) prefix += ` ${prettyIndicator(spinner)}`;
	return prepend(prefix, args);
};
