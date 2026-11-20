/*
 * Code 128 (code set B) for a card number as a movable barcode layer. Pure: returns the bars as module
 * runs, which the canvas, the PNG and the PDF all draw as the same rectangles. Ten quiet modules sit on
 * either side, as scanners need.
 */

/** Bar and space widths of each symbol value, bar first; every pattern is 11 modules wide. */
export const CODE128_PATTERNS = [
  "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213",
  "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132",
  "221231", "213212", "223112", "312131", "311222", "321122", "321221", "312212", "322112", "322211",
  "212123", "212321", "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313",
  "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121", "313121", "211331",
  "231131", "213113", "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111",
  "314111", "221411", "431111", "111224", "111422", "121124", "121421", "141122", "141221", "112214",
  "112412", "122114", "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111",
  "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141",
  "214121", "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311", "113141",
  "114131", "311141", "411131", "211412", "211214", "211232",
] as const;
const STOP = "2331112";
const START_B = 104;
export const QUIET_MODULES = 10;
export const BARCODE_MAX_CHARS = 40;

/** Only printable ASCII can be encoded in code set B; anything else is dropped. */
export function barcodeText(value: string | null | undefined) {
  return (value ?? "").replace(/[^\x20-\x7E]/g, "").slice(0, BARCODE_MAX_CHARS);
}

/** The bars of `value` as [first module, width in modules], and the total width including quiet zones. */
export function code128(value: string): { bars: Array<[number, number]>; modules: number } {
  const text = barcodeText(value);
  if (!text) return { bars: [], modules: 0 };
  const codes = [START_B, ...[...text].map((char) => char.charCodeAt(0) - 32)];
  const checksum = codes.reduce((sum, code, index) => sum + code * Math.max(1, index), 0) % 103;
  const widths = [...codes, checksum].map((code) => CODE128_PATTERNS[code]!).join("") + STOP;
  const bars: Array<[number, number]> = [];
  let at = QUIET_MODULES;
  for (let index = 0; index < widths.length; index += 1) {
    const width = Number(widths[index]);
    if (index % 2 === 0) bars.push([at, width]);
    at += width;
  }
  return { bars, modules: at + QUIET_MODULES };
}
