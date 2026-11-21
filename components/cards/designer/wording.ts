"use client";

import { createContext, useContext } from "react";

/*
 * What the shared editor calls the thing being designed. The card designer is the default; the certificate
 * designer wraps its editor in the provider with "certificate", so "Fit the card" reads "Fit the certificate".
 */

export type DesignerNoun = "card" | "certificate";

const NounContext = createContext<DesignerNoun>("card");

export const DesignerNounProvider = NounContext.Provider;
export const useDesignerNoun = () => useContext(NounContext);

/** The text with "the card" swapped for the thing being designed. Card wording is returned untouched. */
export const reword = (text: string, noun: DesignerNoun) => (noun === "card" ? text : text.replaceAll("the card", `the ${noun}`));
