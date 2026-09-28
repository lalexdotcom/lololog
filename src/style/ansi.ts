/**
 * A single number is a standard SGR code; an array is an extended 256-color sequence
 * (e.g. [38, 5, N]).
 */
type ColorRegistry = Record<string, number | number[]>;

// The names are CSS color names, so the browser renderer uses them as CSS values directly.
export const STYLES = {
	color: {
		black: 30,
		grey: 90,
		lightgray: [38, 5, 252],
		white: [38, 5, 15],

		red: 31,
		green: 32,
		yellow: 93,
		orange: 33,
		blue: 94,
		dodgerblue: [38, 5, 33],
		cyan: 36,
		mediumpurple: [38, 5, 135],
		turquoise: [38, 5, 80],
	},
	// green and grey sit on the CSS shade: ANSI 40 and 249 are so light that white text drops to
	// a 2:1 contrast, which VS Code's minimumContrastRatio then silently repaints.
	"background-color": {
		black: 40,
		grey: [48, 5, 244],
		dimgray: [48, 5, 242],
		lightgray: [48, 5, 252],
		white: 107,

		red: [48, 5, 160],
		green: [48, 5, 28],
		yellow: [48, 5, 226],
		orange: [48, 5, 208],
		blue: [48, 5, 21],
		dodgerblue: [48, 5, 33],
		cyan: 46,
		mediumpurple: [48, 5, 135],
	},
} satisfies { color: ColorRegistry; "background-color": ColorRegistry };

export type Color = keyof (typeof STYLES)["color"];
export type BackgroundColor = keyof (typeof STYLES)["background-color"];

export interface Style {
	color?: Color;
	"background-color"?: BackgroundColor;
}

export function colorize(text: string, style: Style): string {
	const codes: number[] = [];
	if (style.color) codes.push(...[STYLES.color[style.color]].flat());
	if (style["background-color"]) {
		codes.push(...[STYLES["background-color"][style["background-color"]]].flat());
	}
	return codes.length > 0 ? `\u001B[${codes.join(";")}m${text}\u001B[0m` : text;
}
