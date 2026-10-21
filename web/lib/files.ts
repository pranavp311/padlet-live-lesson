import { formatClock, type Sentence } from "@/lib/transcript";

export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "lesson";

export function transcriptText(title: string, startedAt: number, sentences: Sentence[]) {
  const date = new Date(startedAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
  const lines = sentences.map((s) => `[${formatClock(s.t)}] ${s.clean ?? s.raw}`);
  return `${title}\n${date}\n\n${lines.join("\n")}\n`;
}

// Diagrams use CSS variables and the page font; inline the computed values so the file stands alone.
function standaloneSvg(svg: SVGSVGElement): { text: string; w: number; h: number } {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  const src = svg.querySelectorAll("*");
  clone.querySelectorAll("*").forEach((el, i) => {
    const cs = getComputedStyle(src[i]);
    for (const prop of ["fill", "stroke"] as const) {
      const v = el.getAttribute(prop);
      if (v?.includes("var(")) el.setAttribute(prop, cs[prop]);
    }
    (el as SVGElement).style.removeProperty("animation");
  });
  const vb = svg.viewBox.baseVal;
  const scale = 2; // crisp at 2x the diagram's natural size
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("width", String(vb.width * scale));
  clone.setAttribute("height", String(vb.height * scale));
  clone.removeAttribute("style");
  clone.setAttribute("font-family", getComputedStyle(document.body).fontFamily);
  clone.insertAdjacentHTML("afterbegin", `<rect x="${vb.x}" y="${vb.y}" width="${vb.width}" height="${vb.height}" fill="#fff"/>`);
  return { text: new XMLSerializer().serializeToString(clone), w: vb.width * scale, h: vb.height * scale };
}

export function downloadSvg(svg: SVGSVGElement, name: string) {
  downloadBlob(new Blob([standaloneSvg(svg).text], { type: "image/svg+xml" }), `${name}.svg`);
}

export async function downloadPng(svg: SVGSVGElement, name: string) {
  const { text, w, h } = standaloneSvg(svg);
  const img = new Image();
  img.src = URL.createObjectURL(new Blob([text], { type: "image/svg+xml" }));
  await img.decode();
  const canvas = Object.assign(document.createElement("canvas"), { width: w, height: h });
  canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
  URL.revokeObjectURL(img.src);
  canvas.toBlob((b) => b && downloadBlob(b, `${name}.png`), "image/png");
}
