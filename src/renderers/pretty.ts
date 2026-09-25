import { formatDatetime, LABELS, prepend } from "./prefix";
import type { Renderer } from "./record";

export const renderPretty: Renderer = ({ level, time, scope, datetime, args }) => {
	let prefix = scope === undefined ? `[${LABELS[level]}]` : `[${LABELS[level]} <${scope}>]`;
	if (datetime) prefix += ` [${formatDatetime(time)}]`;
	return prepend(prefix, args);
};
