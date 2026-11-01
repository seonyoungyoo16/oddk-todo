import sharp from "sharp";
import { access, copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = await readFile(path.join(root, "design/brand/oddk-app-icon.png"));
const blue = "#2454e6";
const exists = file => access(file).then(() => true, () => false);
async function save(relative, bytes) {
  const target = path.join(root, relative);
  const backup = path.join(root, ".sync-test-runtime/brand-before-oddk-final", relative);
  if (await exists(target) && !await exists(backup)) { await mkdir(path.dirname(backup), { recursive: true }); await copyFile(target, backup); }
  await mkdir(path.dirname(target), { recursive: true }); await writeFile(target, bytes);
}
const png = (size, alpha = false) => {
  const image = sharp(source).resize(size, size);
  return (alpha ? image.ensureAlpha() : image.flatten({ background: blue }).removeAlpha()).png().toBuffer();
};
for (const size of [180, 192, 512, 1024]) await save(`public/oddk-icon-${size}.png`, await png(size));
const wrapped = await png(512);
await save("public/oddk-icon.svg", `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><image width="512" height="512" href="data:image/png;base64,${wrapped.toString("base64")}"/></svg>\n`);

// Maskable/adaptive variants inset the same approved artwork; no letter redraw.
const maskable = await sharp({ create: { width:512,height:512,channels:3,background:blue } }).composite([{ input:await sharp(source).resize(410,410).toBuffer(),gravity:"centre" }]).png().toBuffer();
await save("public/oddk-icon-maskable-512.png",maskable);
const sizes=[16,24,32,48,64,128,256];
const frames=await Promise.all(sizes.map(size=>png(size,true)));
const header=Buffer.alloc(6+16*sizes.length); header.writeUInt16LE(1,2); header.writeUInt16LE(sizes.length,4);
let offset=header.length;
frames.forEach((frame,index)=>{ const entry=6+16*index;header[entry]=sizes[index]===256?0:sizes[index];header[entry+1]=header[entry];header.writeUInt16LE(1,entry+4);header.writeUInt16LE(32,entry+6);header.writeUInt32LE(frame.length,entry+8);header.writeUInt32LE(offset,entry+12);offset+=frame.length; });
await save("app/favicon.ico",Buffer.concat([header,...frames]));

const android="android/app/src/main/res";
if(await exists(path.join(root,android))){
  // The themed icon uses only the luminance mask of the original ivory letters.
  const raw=await sharp(source).resize(1024,1024).removeAlpha().raw().toBuffer();
  const rgba=Buffer.alloc(1024*1024*4);
  for(let pixel=0;pixel<1024*1024;pixel++){const j=pixel*3,k=pixel*4; const light=Math.min(raw[j],raw[j+1],raw[j+2]);rgba[k]=rgba[k+1]=rgba[k+2]=255;rgba[k+3]=Math.round(Math.max(0,Math.min(1,(light-100)/137))*255);}
  const mono=await sharp(rgba,{raw:{width:1024,height:1024,channels:4}}).resize(758,758).png().toBuffer();
  const foreground=await sharp({create:{width:1024,height:1024,channels:4,background:"#00000000"}}).composite([{input:mono,gravity:"centre"}]).png().toBuffer();
  await save(`${android}/drawable-nodpi/oddk_monochrome_mask.png`,foreground);
  const adaptive=await sharp({create:{width:1024,height:1024,channels:3,background:blue}}).composite([{input:await sharp(source).resize(758,758).toBuffer(),gravity:"centre"}]).png().toBuffer();
  await save(`${android}/drawable-nodpi/oddk_launcher_art.png`,await png(1024));
  await save(`${android}/drawable-nodpi/oddk_launcher_adaptive.png`,adaptive);
  await save(`${android}/drawable/oddk_launcher.xml`,'<bitmap xmlns:android="http://schemas.android.com/apk/res/android" android:src="@drawable/oddk_launcher_art" android:gravity="fill"/>\n');
  await save(`${android}/values/ic_launcher_background.xml`,'<resources><color name="ic_launcher_background">#2454E6</color></resources>\n');
  // Give the bitmap mask its own resource name so the old vector cannot win resolution.
  for(const name of ["ic_launcher","ic_launcher_round"]) await save(`${android}/mipmap-anydpi-v26/${name}.xml`,'<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android"><background android:drawable="@color/ic_launcher_background"/><foreground android:drawable="@drawable/oddk_launcher_adaptive"/><monochrome android:drawable="@drawable/oddk_monochrome_art"/></adaptive-icon>\n');
  await save(`${android}/drawable/oddk_monochrome_art.xml`,'<bitmap xmlns:android="http://schemas.android.com/apk/res/android" android:src="@drawable/oddk_monochrome_mask" android:gravity="fill"/>\n');
  for(const[density,size,fg]of[["mdpi",48,108],["hdpi",72,162],["xhdpi",96,216],["xxhdpi",144,324],["xxxhdpi",192,432]]){
    await save(`${android}/mipmap-${density}/ic_launcher.png`,await png(size));
    const circle=Buffer.from(`<svg width="${size}" height="${size}"><circle cx="${size/2}" cy="${size/2}" r="${size/2}" fill="white"/></svg>`);
    await save(`${android}/mipmap-${density}/ic_launcher_round.png`,await sharp(await png(size,true)).composite([{input:circle,blend:"dest-in"}]).png().toBuffer());
    await save(`${android}/mipmap-${density}/ic_launcher_foreground.png`,await sharp(adaptive).resize(fg,fg).png().toBuffer());
  }
}
const ios="ios/App/App/Assets.xcassets/AppIcon.appiconset";
if(await exists(path.join(root,ios))) await save(`${ios}/AppIcon-512@2x.png`,await png(1024));
console.log("Generated ODDK-with-check favicon, web install, Android and iOS icons from the approved artwork. Horizontal logo unchanged.");
