import { renderBrowser } from "./browser";
import { renderJson } from "./json";
import { renderLogfmt } from "./logfmt";
import { renderPretty } from "./pretty";
import type { Renderer } from "./record";
import { renderTty } from "./tty";

export const FORMATS = ["pretty", "json", "logfmt"] as const;

export type Format = (typeof FORMATS)[number];

export function isFormat(value: unknown): value is Format {
	return (FORMATS as readonly unknown[]).includes(value);
}

export interface Output {
	isBrowser: boolean;
	tty: boolean;
	color: boolean;
	format: Format | undefined;
}

export function selectRenderer({ isBrowser, tty, color, format }: Output): Renderer {
	// Without colour the browser output is the pretty one: same bracketed prefix, no %c.
	if (isBrowser) return color ? renderBrowser : renderPretty;
	if (format === "json" || (format === undefined && !tty)) return renderJson;
	if (format === "logfmt") return renderLogfmt;
	if (tty && color) return renderTty;
	return renderPretty;
}
