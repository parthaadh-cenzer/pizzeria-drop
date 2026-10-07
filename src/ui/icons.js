// Inline SVG icon set (currentColor), shared by menu and HUD.
const svg = (body, vb = "0 0 24 24") =>
  `<svg viewBox="${vb}" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
export const ICONS = {
  logo: `<svg viewBox="0 0 48 48" aria-hidden="true"><rect x="3" y="3" width="42" height="42" rx="12" fill="#ffb54d"/><circle cx="24" cy="24" r="13" fill="#1b1d2b"/><path d="M11 24h26" stroke="#ffb54d" stroke-width="4"/><circle cx="24" cy="24" r="13" fill="none" stroke="#1b1d2b" stroke-width="3"/></svg>`,
  host: svg(`<path d="M12 5v14M5 12h14"/>`),
  join: svg(`<path d="M10 17l5-5-5-5"/><path d="M15 12H3"/><path d="M14 4h5a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-5"/>`),
  bolt: svg(`<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>`),
  back: svg(`<path d="M15 18l-6-6 6-6"/>`),
  share: svg(`<path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7"/><path d="M12 3v12"/><path d="M8 7l4-4 4 4"/>`),
  jump: svg(`<path d="M6 15l6-6 6 6"/><path d="M6 20l6-6 6 6" opacity=".55"/>`),
  dive: svg(`<path d="M12 4v13"/><path d="M6 12l6 6 6-6"/><path d="M5 21h14" opacity=".55"/>`),
  rocket: svg(`<path d="M14.5 3.5c3 0 6 3 6 6l-8.5 8.5-6-6z"/><path d="M6 12l-2.5 1 1.5 1.5"/><path d="M12 18l-1 2.5-1.5-1.5"/><path d="M8.5 15.5L4 20"/><circle cx="15" cy="9" r="1.6"/>`),
  fullscreen: svg(`<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>`),
  help: svg(`<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .9-1 1.6v.6"/><path d="M12 17.5v.01"/>`),
  exit: svg(`<path d="M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4"/><path d="M10 16l-4-4 4-4"/><path d="M6 12h10"/>`),
  rotate: svg(`<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M2 14a9 9 0 0 0 7 7"/><path d="M2 18v-4h4"/>`, "0 0 24 24"),
  person: svg(`<circle cx="12" cy="8" r="3.5"/><path d="M5 20a7 7 0 0 1 14 0"/>`),
};
