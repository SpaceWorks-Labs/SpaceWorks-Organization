import { CARD_ICONS } from "@/lib/cards/design/icons";

/** The icons the logo maker offers: the card icon set (24-unit stroke paths). */
export const LOGO_ICONS = CARD_ICONS;
export const LOGO_ICON_IDS: ReadonlySet<string> = new Set(CARD_ICONS.map((icon) => icon.id));

export function logoIconPath(id: string | null) {
  return (id && CARD_ICONS.find((icon) => icon.id === id)?.d) || null;
}
