/**
 * Node.js ESM module loader hook untuk test runner Kayla Finance.
 * Mengalihkan 'next/server' -> 'next/server.js' dan alias '@/' -> 'src/'.
 */
export function resolve(specifier, context, nextResolve) {
  if (specifier === 'next/server') {
    return nextResolve('next/server.js', context);
  }
  if (specifier === 'next/headers') {
    return nextResolve('next/headers.js', context);
  }
  if (specifier.startsWith('@/')) {
    const sub = specifier.slice(2);
    const withExt = sub.endsWith('.js') || sub.endsWith('.mjs') || sub.endsWith('.json') ? sub : `${sub}.js`;
    return nextResolve(new URL('../src/' + withExt, import.meta.url).href, context);
  }
  return nextResolve(specifier, context);
}