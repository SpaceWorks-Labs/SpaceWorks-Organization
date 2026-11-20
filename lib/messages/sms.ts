/**
 * How many text-message segments a message takes, so the editor can show the cost of a long message. GSM-7 text
 * (the basic Latin set and a few extensions) fits 160 characters in one segment and 153 in each of a longer one;
 * anything else (₹, Malayalam, Devanagari, emoji) switches the whole message to UCS-2: 70 and 67.
 */
const GSM_BASIC = "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
const GSM_EXTENSION = "^{}\\[~]|€\f";

export function smsSegments(text: string): { characters: number; segments: number; unicode: boolean } {
  let units = 0;
  let unicode = false;
  for (const char of text) {
    if (GSM_BASIC.includes(char)) units += 1;
    else if (GSM_EXTENSION.includes(char)) units += 2;
    else unicode = true;
  }
  if (unicode) {
    const length = text.length;
    return { characters: length, segments: length === 0 ? 0 : length <= 70 ? 1 : Math.ceil(length / 67), unicode };
  }
  return { characters: units, segments: units === 0 ? 0 : units <= 160 ? 1 : Math.ceil(units / 153), unicode };
}
