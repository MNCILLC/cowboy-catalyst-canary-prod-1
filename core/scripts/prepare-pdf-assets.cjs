// @ts-check
const { cpSync, mkdirSync } = require('node:fs');
const { dirname, join } = require('node:path');
const { version } = require('pdfjs-dist/package.json');

const pdfjsPath = dirname(require.resolve('pdfjs-dist/package.json'));
const destination = join(__dirname, '../public/pdfjs', version);

mkdirSync(destination, { recursive: true });
cpSync(join(pdfjsPath, 'build/pdf.worker.min.mjs'), join(destination, 'pdf.worker.min.mjs'));

['cmaps', 'standard_fonts', 'wasm'].forEach((directory) => {
  cpSync(join(pdfjsPath, directory), join(destination, directory), { recursive: true });
});
