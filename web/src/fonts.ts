// Self-hosted Barlow. Importing the files lets Vite resolve their final URLs,
// including the GitHub Pages base path, which plain url() in CSS did not.
const files = import.meta.glob<string>("./assets/fonts/*.woff2", { eager: true, query: "?url", import: "default" });

const LATIN = "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD";
const LATIN_EXT = "U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C4, U+2113, U+2C60-2C7F, U+A720-A7FF";

const rules = Object.entries(files).map(([path, url]) => {
  const [, family, weight, subset] = path.match(/(barlow(?:-condensed)?)-(\d+)-(latin(?:-ext)?)\.woff2$/)!;
  const name = family === "barlow" ? "Barlow" : "Barlow Condensed";
  const range = subset === "latin" ? LATIN : LATIN_EXT;
  return `@font-face{font-family:"${name}";font-weight:${weight};font-display:swap;src:url("${url}") format("woff2");unicode-range:${range};}`;
});

const style = document.createElement("style");
style.textContent = rules.join("\n");
document.head.append(style);
