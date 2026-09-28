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

// No colour: black text, as in the wth badge, would vanish on a dark devtools theme once the
// background is gone.
const SCOPE_CSS = `border: 1px solid ${LEVEL_STYLES.wth["background-color"]}; padding: 0 4px; border-radius: 4px`;
const DATE_CSS = "color: lightgray";

export const renderBrowser: Renderer = ({ level, time, scope, datetime, args }) => {
	let format = `%c${LABELS[level]}%c`;
	const styles = [BADGE_CSS[level], ""];
	if (scope !== undefined) {
		format += ` %c<${scope}>%c`;
		styles.push(SCOPE_CSS, "");
	}
	if (datetime) {
		format += ` %c[${formatDatetime(time)}]%c`;
		styles.push(DATE_CSS, "");
	}
	return prepend(format, args, styles);
};
