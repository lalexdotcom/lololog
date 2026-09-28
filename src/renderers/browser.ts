import { LEVEL_NAMES, LEVEL_STYLES, type Level } from "../levels";
import { percent, progressLabel, ratioOf } from "../spinner/progress";
import type { Color } from "../style/ansi";
import { formatDatetime, LABELS, prepend } from "./prefix";
import type { Renderer, SpinnerView } from "./record";

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

// On every segment: %c styles only the text up to the next %c, and devtools fonts vary.
const MONO = "font-family: monospace";

function tint(color: Color | undefined): string {
	return color === undefined ? MONO : `${MONO}; color: ${color}`;
}

function barCss(color: Color | undefined, pct: number): string {
	const c = color ?? "currentColor";
	return `${MONO}; background: linear-gradient(to right, ${c} 0%, ${c} ${pct}%, lightgrey ${pct}%, lightgrey 100%); padding: 0px 48px; line-height: 0.5; border-radius: 2px`;
}

export function browserIndicator({ status, progress, glyph, color }: SpinnerView): {
	format: string;
	values: string[];
} {
	if (progress.kind === "none") return { format: "%c(%s)%c", values: [tint(color), glyph, ""] };
	const format = "%c %c %c%s%c";
	const values = [
		barCss(color, percent(ratioOf(progress))),
		"",
		MONO,
		progressLabel(progress, true),
		"",
	];
	if (status === "running") return { format, values };
	return { format: `%c%s%c ${format}`, values: [tint(color), glyph, "", ...values] };
}

export const renderBrowser: Renderer = ({ level, time, scope, datetime, args, spinner }) => {
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
	if (spinner !== undefined) {
		const indicator = browserIndicator(spinner);
		format += ` ${indicator.format}`;
		styles.push(...indicator.values);
	}
	return prepend(format, args, styles);
};
