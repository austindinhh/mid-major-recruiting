import { useEffect, useId, useState } from "react";
import { useDarkMode } from "../lib/useDarkMode";
import styles from "./Mermaid.module.css";

// Site colors for Mermaid's "base" theme, one set per color scheme (Mermaid can't read CSS variables).
const THEMES = {
  light: {
    background: "#FFFFFF", primaryColor: "#EFF0F2", primaryTextColor: "#13294B", primaryBorderColor: "#13294B",
    lineColor: "#13294B", secondaryColor: "#EFF0F2", tertiaryColor: "#FFFFFF", clusterBkg: "#F3F4F6",
    clusterBorder: "#C3D0E4", edgeLabelBackground: "#FFFFFF", textColor: "#13294B",
  },
  dark: {
    background: "#0E1A2D", primaryColor: "#222833", primaryTextColor: "#E6EBF3", primaryBorderColor: "#6F8BB8",
    lineColor: "#8FA6CB", secondaryColor: "#222833", tertiaryColor: "#0E1A2D", clusterBkg: "#151D2A",
    clusterBorder: "#2B4268", edgeLabelBackground: "#0E1A2D", textColor: "#E6EBF3",
  },
};
// The highlighted node (the projection) is a navy plate in both schemes.
const STRONG = { light: "fill:#13294B,stroke:#13294B,color:#FFFFFF", dark: "fill:#1B3762,stroke:#6F8BB8,color:#FFFFFF" };

let queue: Promise<unknown> = Promise.resolve();

export function Mermaid({ chart, label }: { chart: string; label: string }) {
  const dark = useDarkMode();
  const id = `m${useId().replace(/[^\w]/g, "")}`;
  const [svg, setSvg] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    const scheme = dark ? "dark" : "light";
    const source = `${chart}\nclassDef strong ${STRONG[scheme]}`;
    // Mermaid keeps global config, so renders run one at a time.
    queue = queue.then(async () => {
      const mermaid = (await import("mermaid")).default;
      mermaid.initialize({
        startOnLoad: false, securityLevel: "strict", theme: "base", look: "classic",
        themeVariables: { ...THEMES[scheme], fontFamily: "Barlow, system-ui, sans-serif", fontSize: "17px" },
        flowchart: { htmlLabels: true, curve: "basis", padding: 14, nodeSpacing: 36, rankSpacing: 48 },
      });
      const out = await mermaid.render(`${id}-${scheme}`, source);
      if (live) setSvg(out.svg);
    }).catch(() => { if (live) setSvg(""); });
    return () => { live = false; };
  }, [chart, dark, id]);

  if (svg === null) return <div className="skeleton" style={{ height: 160 }} aria-busy="true" />;
  return <figure className={styles.diagram} role="img" aria-label={label} dangerouslySetInnerHTML={{ __html: svg }} />;
}
