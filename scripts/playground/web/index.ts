import { L, LEVELS, type Level } from "../../../src/index";
import { demo, spinnerDemo } from "../demo";

const levels = Object.keys(LEVELS) as Level[];

document.body.innerHTML = `
<main style="font: 14px system-ui; max-width: 720px; margin: 2rem auto; line-height: 1.6">
	<h1>lololog playground</h1>
	<p>Open the devtools console (F12), then click.</p>
	<p><button id="demo">Run the full demo</button></p>
	<p><button id="spinners">Run the spinners</button> <label>spinnerInterval <input id="interval" type="number" min="0" value="1000" placeholder="5000" style="width: 6em"></label></p>
	<p>Root: ${levels.map((level) => `<button data-level="${level}">${level}</button>`).join(" ")}</p>
	<p>Scope <code>db</code>: ${levels.map((level) => `<button data-scope-level="${level}">${level}</button>`).join(" ")}</p>
	<p>
		<label><input type="checkbox" id="datetime"> datetime</label>
		<label><input type="checkbox" id="color" checked> color</label>
		<label><input type="checkbox" id="enabled" checked> enabled</label>
		<label>root level <select id="level">${levels.map((level) => `<option>${level}</option>`).join("")}</select></label>
	</p>
</main>`;

// The 5 s default would show a single heartbeat in this 6 s scenario.
L.spinnerInterval = 1000;

const db = L.scope("db");
const $ = <T extends HTMLElement>(selector: string) => document.querySelector(selector) as T;

$("#demo").onclick = () => demo(L);
$("#spinners").onclick = () => {
	void spinnerDemo(L);
};
$<HTMLInputElement>("#interval").onchange = (event) => {
	const { value } = event.target as HTMLInputElement;
	L.spinnerInterval = value === "" ? undefined : Number(value);
};
for (const button of document.querySelectorAll<HTMLButtonElement>("[data-level]")) {
	const level = button.dataset.level as Level;
	button.onclick = () => L[level]("root %s", level, { at: new Date().toISOString() });
}
for (const button of document.querySelectorAll<HTMLButtonElement>("[data-scope-level]")) {
	const level = button.dataset.scopeLevel as Level;
	button.onclick = () => db[level]("scoped %s", level, { at: new Date().toISOString() });
}
$<HTMLInputElement>("#datetime").onchange = (event) => {
	L.datetime = (event.target as HTMLInputElement).checked;
};
$<HTMLInputElement>("#color").onchange = (event) => {
	L.color = (event.target as HTMLInputElement).checked;
};
$<HTMLInputElement>("#enabled").onchange = (event) => {
	L.enabled = (event.target as HTMLInputElement).checked;
};
$<HTMLSelectElement>("#level").onchange = (event) => {
	L.level = (event.target as HTMLSelectElement).value as Level;
};
