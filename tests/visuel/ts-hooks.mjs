// Permet d'importer les fichiers .ts du Worker sans extension (comme le fait le bundler).
export async function resolve(spec, ctx, next) {
  if (/^\.{1,2}\//.test(spec) && !/\.[a-z]+$/.test(spec)) spec += '.ts';
  return next(spec, ctx);
}
