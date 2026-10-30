// Retailer CDNs serve resized images from the same URL with a size token. Cards need a
// few hundred pixels, not the 1500px originals (about 120 KB each on Amazon).
export function sizedImage(url: string | undefined, width: number) {
  if (!url) return url;
  const w = Math.max(64, Math.round(width));
  if (/m\.media-amazon\.com\/images\//.test(url))
    return url.replace(/\._[A-Z]{2}[A-Z0-9_,]*_\.(jpe?g|png|webp)$/i, `._SL${w}_.$1`);
  if (/rukminim\d*\.flixcart\.com\/image\/\d+\/\d+\//.test(url))
    return url.replace(/\/image\/\d+\/\d+\//, `/image/${w}/${w}/`);
  if (/images-static\.nykaa\.com\//.test(url) && !/[?&]tr=/.test(url))
    return `${url}${url.includes('?') ? '&' : '?'}tr=w-${w}`;
  return url;
}
