// Shared BibTeX helpers — decoding LaTeX-style escapes used by Google
// Scholar's BibTeX export (author={M{\"u}ller, ...}) and extracting fields
// while respecting nested braces.

const ACCENT_MAP = {
  '"': { a:'ä', e:'ë', i:'ï', o:'ö', u:'ü', y:'ÿ',
         A:'Ä', E:'Ë', I:'Ï', O:'Ö', U:'Ü', Y:'Ÿ' },
  "'": { a:'á', e:'é', i:'í', o:'ó', u:'ú', y:'ý',
         c:'ć', n:'ń', s:'ś', z:'ź', l:'ĺ', r:'ŕ',
         A:'Á', E:'É', I:'Í', O:'Ó', U:'Ú', Y:'Ý',
         C:'Ć', N:'Ń', S:'Ś', Z:'Ź', L:'Ĺ', R:'Ŕ' },
  '`': { a:'à', e:'è', i:'ì', o:'ò', u:'ù',
         A:'À', E:'È', I:'Ì', O:'Ò', U:'Ù' },
  '^': { a:'â', e:'ê', i:'î', o:'ô', u:'û',
         A:'Â', E:'Ê', I:'Î', O:'Ô', U:'Û' },
  '~': { a:'ã', n:'ñ', o:'õ',
         A:'Ã', N:'Ñ', O:'Õ' },
  v:   { c:'č', d:'ď', e:'ě', l:'ľ', n:'ň', r:'ř', s:'š', t:'ť', z:'ž',
         C:'Č', D:'Ď', E:'Ě', L:'Ľ', N:'Ň', R:'Ř', S:'Š', T:'Ť', Z:'Ž' },
  H:   { o:'ő', u:'ű', O:'Ő', U:'Ű' },
  c:   { c:'ç', s:'ş', C:'Ç', S:'Ş' },
  k:   { a:'ą', e:'ę', A:'Ą', E:'Ę' },
  u:   { a:'ă', e:'ĕ', g:'ğ', A:'Ă', E:'Ĕ', G:'Ğ' },
  '=': { a:'ā', e:'ē', i:'ī', o:'ō', u:'ū',
         A:'Ā', E:'Ē', I:'Ī', O:'Ō', U:'Ū' },
  '.': { c:'ċ', e:'ė', g:'ġ', z:'ż', C:'Ċ', E:'Ė', G:'Ġ', Z:'Ż' },
};

const SINGLE_MAP = {
  ss:'ß', aa:'å', AA:'Å', o:'ø', O:'Ø',
  l:'ł', L:'Ł', ae:'æ', AE:'Æ', oe:'œ', OE:'Œ',
  i:'ı', j:'ȷ',
};

const applyAccent = (accent, letter) => {
  const m = ACCENT_MAP[accent];
  return (m && m[letter]) || letter;
};

export function cleanBibTeXText(s) {
  if (!s) return s;
  let out = String(s);

  // {\"u}, {\v{c}}, {\'c}, ...
  out = out.replace(/\{\\([\"'`^~v=.HcukH])\{?([A-Za-z])\}?\}/g,
    (_, a, l) => applyAccent(a, l));
  // \v{c}, \"u when braces wrap only the letter
  out = out.replace(/\\([\"'`^~v=.HcukH])\{([A-Za-z])\}/g,
    (_, a, l) => applyAccent(a, l));
  // \"u, \'a, \`e (no braces at all — common in Scholar output)
  out = out.replace(/\\([\"'`^~])([A-Za-z])/g,
    (_, a, l) => applyAccent(a, l));

  // {\ss}, {\o}, {\AE}, ...
  out = out.replace(/\{\\(ss|aa|AA|o|O|l|L|ae|AE|oe|OE|i|j)\}/g,
    (_, c) => SINGLE_MAP[c] || c);
  // \ss \ae \oe — only the multi-letter forms (\o conflicts with normal text)
  out = out.replace(/\\(ss|aa|AA|ae|AE|oe|OE)\b/g,
    (_, c) => SINGLE_MAP[c] || c);

  // Remove leftover grouping braces — BibTeX uses them for case-protection
  out = out.replace(/[{}]/g, '');

  // Normalize whitespace
  out = out.replace(/\s+/g, ' ').trim();
  return out;
}

// Extract a field value (e.g. "author", "title") from a BibTeX entry,
// respecting nested braces. Returns "" if not found.
export function extractBibtexField(bibtex, field) {
  if (!bibtex) return '';
  const re = new RegExp(`${field}\\s*=\\s*[{"]`, 'i');
  const m = re.exec(bibtex);
  if (!m) return '';
  const opener = bibtex[m.index + m[0].length - 1]; // '{' or '"'
  const closer = opener === '{' ? '}' : '"';
  let i = m.index + m[0].length;
  let depth = 1;
  let out = '';
  while (i < bibtex.length && depth > 0) {
    const ch = bibtex[i];
    if (ch === '\\') {
      // Keep the escape sequence intact
      out += ch + (bibtex[i + 1] || '');
      i += 2;
      continue;
    }
    if (opener === '{') {
      if (ch === '{') { depth++; out += ch; }
      else if (ch === '}') { depth--; if (depth === 0) break; out += ch; }
      else out += ch;
    } else {
      if (ch === closer) { depth--; if (depth === 0) break; out += ch; }
      else out += ch;
    }
    i++;
  }
  return out.trim();
}
