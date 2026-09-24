export const POPUP_CSS = `
.dikduk-popup {
  all: initial;
  display: block;
  box-sizing: border-box;
  width: max-content;
  max-width: 360px;
  font-family: -apple-system, "Segoe UI", Arial, sans-serif;
  direction: rtl; text-align: right;
  background: #ffffff; color: #1a1a1a;
  border: 1px solid #d0d0d0; border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0,0,0,.18);
  padding: 10px 12px; font-size: 15px; line-height: 1.4;
}
.dikduk-popup .dikduk-lemma { font-size: 20px; font-weight: 700; }
.dikduk-popup .dikduk-translation { margin-top: 2px; color: #333; }
.dikduk-popup .dikduk-meta { margin-top: 4px; font-size: 13px; color: #666; }
.dikduk-popup details { margin-top: 8px; border-top: 1px solid #eee; padding-top: 4px; }
.dikduk-popup summary { cursor: pointer; font-size: 12px; font-weight: 600; color: #555; list-style: none; padding: 2px 0; }
.dikduk-popup summary::-webkit-details-marker { display: none; }
.dikduk-popup summary::before { content: "▸ "; }
.dikduk-popup details[open] > summary::before { content: "▾ "; }
.dikduk-popup table { border-collapse: collapse; margin-top: 6px; width: 100%; }
.dikduk-popup th, .dikduk-popup td { border: 1px solid #e3e3e3; padding: 3px 6px; text-align: center; font-size: 14px; }
.dikduk-popup th { background: #f5f5f5; font-weight: 600; font-size: 12px; color: #555; }
.dikduk-popup td.dikduk-rowlabel { background: #fafafa; font-size: 12px; color: #555; }
.dikduk-popup .dikduk-seealso { display: flex; flex-direction: column; gap: 2px; margin-top: 6px; }
.dikduk-popup .dikduk-seealso a { color: #2563eb; text-decoration: none; font-size: 14px; }
.dikduk-popup .dikduk-source { margin-top: 8px; font-size: 12px; }
.dikduk-popup .dikduk-source a { color: #2563eb; text-decoration: none; }
.dikduk-popup.dikduk-error { color: #b00020; }
.dikduk-popup.dikduk-loading { color: #666; }
.dikduk-popup .dikduk-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.dikduk-popup .dikduk-chip { all: unset; cursor: pointer; border: 1px solid #d0d0d0; border-radius: 6px; padding: 4px 10px; font-size: 16px; color: #1a1a1a; background: #f7f7f7; }
.dikduk-popup .dikduk-chip:hover { background: #ececec; }
.dikduk-popup .dikduk-ocr-empty { color: #666; }
.dikduk-popup .dikduk-spell-actions { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; border-top: 1px solid #eee; padding-top: 8px; }
.dikduk-popup .dikduk-spell-action { all: unset; cursor: pointer; font-size: 12px; color: #2563eb; }
.dikduk-popup .dikduk-spell-action:hover { text-decoration: underline; }
.dikduk-popup .dikduk-grammar-evidence { margin-top: 8px; direction: rtl; text-align: right; color: #7a3f00; font-size: 13px; }
.dikduk-popup .dikduk-grammar-replacements { margin-top: 8px; border-top: 1px solid #eee; padding-top: 8px; }
.dikduk-popup .dikduk-grammar-hint { margin-top: 8px; color: #333; font-size: 13px; }
.dikduk-popup .dikduk-grammar-suggestions { margin-top: 8px; border-top: 1px solid #eee; padding-top: 8px; }
.dikduk-popup .dikduk-grammar-suggestions-title { color: #555; font-size: 12px; font-weight: 600; }
.dikduk-popup .dikduk-grammar-suggestion { margin-top: 4px; color: #137333; font-size: 13px; }
.dikduk-popup .dikduk-grammar-replacement { margin-top: 4px; color: #137333; font-size: 13px; }
.dikduk-popup.dikduk-grammar-status { max-width: 320px; background: #fff8ec; color: #7a3f00; border-color: #e3c48f; padding: 6px 10px; font-size: 13px; }
`;
