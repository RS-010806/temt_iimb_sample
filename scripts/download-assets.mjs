import { mkdir, writeFile } from 'node:fs/promises';
const assets = {
  'fonts/barlow-condensed-700.woff2': 'https://fonts.gstatic.com/s/barlowcondensed/v13/HTxwL3I-JCGChYJ8VI-L6OO_au7B46r2z3bWuYMBYro.woff2',
  'fonts/barlow-condensed-600.woff2': 'https://fonts.gstatic.com/s/barlowcondensed/v13/HTxwL3I-JCGChYJ8VI-L6OO_au7B4873z3bWuYMBYro.woff2',
  'fonts/manrope-variable.woff2': 'https://fonts.gstatic.com/s/manrope/v20/xn7gYHE41ni1AdIRggexSvfedN4.woff2',
  'fonts/ibm-plex-mono-400.woff2': 'https://fonts.gstatic.com/s/ibmplexmono/v20/-F63fjptAgt5VM-kVkqdyU8n1i8q131nj-o.woff2',
  'images/freight-port.webp': 'https://images.unsplash.com/photo-1494412651409-8963ce7935a7?auto=format&fit=crop&fm=webp&q=85&w=2200',
  'images/freight-port-desktop.avif': 'https://images.unsplash.com/photo-1494412651409-8963ce7935a7?fit=crop&fm=avif&q=48&w=1600',
  'images/freight-port-mobile.avif': 'https://images.unsplash.com/photo-1494412651409-8963ce7935a7?fit=crop&fm=avif&q=42&w=700&h=1200',
};
for (const [name, url] of Object.entries(assets)) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${name}: ${res.status}`);
  const target = new URL(`../apps/web/public/${name}`, import.meta.url);
  await mkdir(new URL('.', target), {recursive: true});
  await writeFile(target, new Uint8Array(await res.arrayBuffer()));
  console.log(`Saved ${name}`);
}
