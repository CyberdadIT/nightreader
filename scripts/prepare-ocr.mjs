import {mkdir,copyFile,readdir} from 'node:fs/promises';
const dir='public/ocr';await mkdir(dir,{recursive:true});
await copyFile('node_modules/tesseract.js/dist/worker.min.js',`${dir}/worker.min.js`);
for(const name of await readdir('node_modules/tesseract.js-core')) {
  if(name.endsWith('.wasm.js')||name.endsWith('.wasm'))await copyFile(`node_modules/tesseract.js-core/${name}`,`${dir}/${name}`);
}
await copyFile('node_modules/@tesseract.js-data/eng/4.0.0/eng.traineddata.gz',`${dir}/eng.traineddata.gz`);
console.log('Prepared local OCR worker, WebAssembly cores and English language data.');
