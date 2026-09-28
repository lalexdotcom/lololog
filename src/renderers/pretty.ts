import { formatDatetime, LABELS, prepend } from "./prefix";
import type { Renderer } from "./record";

export const renderPretty: Renderer = ({ level, time, scope, datetime, args }) => {
	let prefix = `[${LABELS[level]}]`;
	if (scope !== undefined) prefix += ` <${scope}>`;
	if (datetime) prefix += ` [${formatDatetime(time)}]`;
	return prepend(prefix, args);
};
