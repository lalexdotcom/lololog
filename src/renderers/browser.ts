import { LEVEL_NAMES, LEVEL_STYLES, type Level } from "../levels";
import { formatDatetime, LABELS, prepend } from "./prefix";
import type { Renderer } from "./record";

export const BADGE_CSS = Object.fromEntries(
	LEVEL_NAMES.map((level) => {
		const style = LEVEL_STYLES[level];
		return [
			level,
			`color: ${style.color}; background-color: ${style["background-color"]}; padding: 1px 4px; border-radius: 4px`,
		];
	}),
) as Record<Level, string>;

const DATE_CSS = "color: lightgray";

export const renderBrowser: Renderer = ({ level, time, scope, datetime, args }) => {
	const label = scope === undefined ? LABELS[level] : `${LABELS[level]} <${scope}>`;
	if (!datetime) return prepend(`%c${label}%c`, args, [BADGE_CSS[level], ""]);
	return prepend(`%c${label}%c %c[${formatDatetime(time)}]%c`, args, [
		BADGE_CSS[level],
		"",
		DATE_CSS,
		"",
	]);
};
