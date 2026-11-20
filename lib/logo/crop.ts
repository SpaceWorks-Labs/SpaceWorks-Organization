/*
 * Square crop for an uploaded logo: the image is scaled and moved under a square frame of `view` px. Zoom 1
 * covers the frame; smaller zooms (down to fitting the whole image) leave transparent room round it, which suits
 * wide logos. Pure, so the cropper's maths is unit-tested.
 */

export type CropState = { zoom: number; x: number; y: number };
export type CropImage = { width: number; height: number };

export const CROP_MAX_ZOOM = 4;

/** Scale at zoom 1: the image covers the frame. */
export function coverScale(image: CropImage, view: number) {
  return view / Math.min(image.width, image.height);
}

/** The smallest zoom: the whole image fits inside the frame. */
export function minZoom(image: CropImage) {
  return Math.min(image.width, image.height) / Math.max(image.width, image.height);
}

/** Zoom inside its range and the image kept over the frame (or inside it, when it is smaller). */
export function clampCrop(state: CropState, image: CropImage, view: number): CropState {
  const zoom = Math.min(CROP_MAX_ZOOM, Math.max(minZoom(image), state.zoom));
  const scale = coverScale(image, view) * zoom;
  const limitX = Math.abs(image.width * scale - view) / 2;
  const limitY = Math.abs(image.height * scale - view) / 2;
  return { zoom, x: Math.min(limitX, Math.max(-limitX, state.x)), y: Math.min(limitY, Math.max(-limitY, state.y)) };
}

/** Where the image is drawn on an output square of `output` px, for a frame of `view` px. */
export function cropRect(state: CropState, image: CropImage, view: number, output: number) {
  const scale = coverScale(image, view) * state.zoom;
  const ratio = output / view;
  const width = image.width * scale;
  const height = image.height * scale;
  return {
    x: (view / 2 + state.x - width / 2) * ratio,
    y: (view / 2 + state.y - height / 2) * ratio,
    width: width * ratio,
    height: height * ratio,
  };
}
