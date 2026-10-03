/**
 * Renders never show a payload's real images: a pull request could link anything, and its renders
 * end up public on cdn.block-kit.dev and in the pull request. Each image is replaced by a striped
 * placeholder of the same size, so layout, scaling and cropping still show in a diff.
 */

export type Size = { width: number; height: number };

/** Reads the size of a PNG or JPEG from its header. Other formats have no known size. */
export function imageSize(bytes: Uint8Array): Size | undefined {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // PNG: signature, then the IHDR chunk's width and height.
  if (bytes.length >= 24 && view.getUint32(0) === 0x89504e47) {
    return { width: view.getUint32(16), height: view.getUint32(20) };
  }
  // JPEG: walk the segments to the first start-of-frame marker (SOF0–SOF15, except DHT, JPG, DAC).
  if (bytes.length >= 4 && view.getUint16(0) === 0xffd8) {
    let offset = 2;
    while (offset + 9 <= bytes.length && bytes[offset] === 0xff) {
      const marker = bytes[offset + 1] as number;
      if (
        marker >= 0xc0 &&
        marker <= 0xcf &&
        marker !== 0xc4 &&
        marker !== 0xc8 &&
        marker !== 0xcc
      ) {
        return { width: view.getUint16(offset + 7), height: view.getUint16(offset + 5) };
      }
      offset += 2 + view.getUint16(offset + 2);
    }
  }
  return undefined;
}

/** A neutral striped image of `size`, readable on the light and the dark theme. */
export function placeholderSvg({ width, height }: Size): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
    '<defs><pattern id="p" width="16" height="16" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">' +
    '<rect width="16" height="16" fill="#c9ccd1"/><rect width="8" height="16" fill="#b7bbc2"/></pattern></defs>' +
    '<rect width="100%" height="100%" fill="url(#p)"/></svg>'
  );
}
