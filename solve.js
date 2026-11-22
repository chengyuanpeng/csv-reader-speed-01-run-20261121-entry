// A fast CSV reader that reproduces csv-reader 1.0.0's answers exactly.
//
// The reading policy (make.fun's own, as the competition states it):
//   * one left-to-right pass over the text; a U+FEFF at the very start is dropped;
//   * a record ends at LF or CRLF; a line holding no characters is no record at all;
//   * outside quotes, a CR that is not part of a CRLF is dropped and reported (stray_cr);
//   * a field that opens with a quote runs to the next quote that is not doubled: inside it,
//     "" is one quote and every CRLF or lone CR counts as one LF in the value and one line
//     in the line count; characters between the closing quote and the field's end are kept
//     as they stand (quote_junk, when any are kept); a quote that never closes makes the
//     opening quote a literal character and the rest of the field is read again unquoted
//     (unterminated_quote);
//   * a quote inside an unquoted field is a literal character; fields are never trimmed
//     or converted;
//   * the first record fixes the width: with header:true it becomes `columns` and the rest
//     are `rows`; with header:false every record is a row. Rows are padded with "" when
//     short (short_row, carrying their field count) or cut when long (long_row, carrying
//     the cut fields in `extra`);
//   * every error is {code, line, row}: the 1-based line its record starts on and the
//     record's index in rows (null for the header), in the order met.
//
// How this implementation gets its speed: instead of walking character by character and
// growing each field a character at a time, it jumps between the few characters that can
// change the reading (comma, quote, LF, CR) with String.indexOf and copies each plain run
// of text with one slice. Fields with no surprises are a single slice; the messy paths
// (stray CRs, doubled quotes, junk after a closing quote) stitch a handful of slices.

/** How the field just read ended. */
const AT_COMMA = 0;
const AT_BREAK = 1;
const AT_END = 2;

export function run(input) {
  const text = String(input.text);
  const wantHeader = input.header === true;
  const len = text.length;

  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;

  let pos = text[0] === '\uFEFF' ? 1 : 0;
  let line = 1;

  // The record under construction: where it starts and where it lands.
  let recLine = 1;
  let recRow = null;

  // Scratch the field readers leave their results in.
  let fValue = '';
  let fAdded = 0;

  function note(code) {
    errors.push({ code, line: recLine, row: recRow });
  }

  // Reads an unquoted field, starting with `seed` already in hand ("" for a plain field,
  // the quoted value for the junk after a closing quote, '"' for an unterminated field
  // being re-read). Leaves the value in fValue and the number of characters kept beyond
  // the seed in fAdded; returns how the field ended.
  function readBare(seed) {
    let acc = seed;
    let segFrom = pos;
    fAdded = 0;
    for (;;) {
      // The next delimiter — comma, LF or CR — whichever comes first.
      const ci = text.indexOf(',', pos);
      const ni = text.indexOf('\n', pos);
      const ri = text.indexOf('\r', pos);
      let j = ci, code = 44;
      if (ni !== -1 && (j === -1 || ni < j)) { j = ni; code = 10; }
      if (ri !== -1 && (j === -1 || ri < j)) { j = ri; code = 13; }
      if (j === -1) {
        const seg = text.slice(segFrom);
        fAdded += seg.length;
        fValue = acc + seg;
        pos = len;
        return AT_END;
      }
      if (code === 13 && text[j + 1] !== '\n') {
        // A CR with no LF after it: dropped, reported, the field goes on.
        const seg = text.slice(segFrom, j);
        fAdded += seg.length;
        acc += seg;
        note('stray_cr');
        pos = j + 1;
        segFrom = pos;
        continue;
      }
      const seg = text.slice(segFrom, j);
      fAdded += seg.length;
      fValue = acc + seg;
      if (code === 44) {
        pos = j + 1;
        return AT_COMMA;
      }
      pos = code === 10 ? j + 1 : j + 2;
      line += 1;
      return AT_BREAK;
    }
  }

  // Reads a field whose opening quote is at pos. Leaves the value in fValue and returns
  // how the field ended.
  function readQuoted() {
    const openPos = pos;
    const openLine = line;
    pos += 1;
    let acc = '';
    let segFrom = pos;
    for (;;) {
      // Inside quotes the characters that matter are the quote itself and line breaks.
      const q = text.indexOf('"', pos);
      const n = text.indexOf('\n', pos);
      const r = text.indexOf('\r', pos);
      let j = q, code = 34;
      if (n !== -1 && (j === -1 || n < j)) { j = n; code = 10; }
      if (r !== -1 && (j === -1 || r < j)) { j = r; code = 13; }
      if (j === -1) {
        // No closing quote anywhere: the opening quote was a literal character, and
        // everything after it is read again as an unquoted field.
        pos = openPos + 1;
        line = openLine;
        note('unterminated_quote');
        return readBare('"');
      }
      if (code === 34) {
        if (text[j + 1] === '"') {
          acc += text.slice(segFrom, j) + '"';
          pos = j + 2;
          segFrom = pos;
          continue;
        }
        // The closing quote.
        acc += text.slice(segFrom, j);
        pos = j + 1;
        if (pos >= len) {
          fValue = acc;
          return AT_END;
        }
        const c = text[pos];
        if (c === ',') {
          pos += 1;
          fValue = acc;
          return AT_COMMA;
        }
        if (c === '\n') {
          pos += 1;
          line += 1;
          fValue = acc;
          return AT_BREAK;
        }
        if (c === '\r' && text[pos + 1] === '\n') {
          pos += 2;
          line += 1;
          fValue = acc;
          return AT_BREAK;
        }
        // Anything else up to the field's end is appended as it stands.
        const ended = readBare(acc);
        if (fAdded > 0) note('quote_junk');
        return ended;
      }
      // A line break inside the quotes: LF stays LF; CRLF and a lone CR each read as LF.
      acc += text.slice(segFrom, j) + '\n';
      line += 1;
      pos = code === 10 ? j + 1 : (text[j + 1] === '\n' ? j + 2 : j + 1);
      segFrom = pos;
    }
  }

  for (;;) {
    // Blank lines (nothing, or only a CRLF) hold no record.
    while (pos < len) {
      if (text[pos] === '\n') {
        pos += 1;
        line += 1;
      } else if (text[pos] === '\r' && text[pos + 1] === '\n') {
        pos += 2;
        line += 1;
      } else {
        break;
      }
    }
    if (pos >= len) break;

    recLine = line;
    recRow = wantHeader && columns === null ? null : rows.length;

    const fields = [];
    let lastWasQuoted = false;
    let ended;
    do {
      lastWasQuoted = text[pos] === '"';
      ended = lastWasQuoted ? readQuoted() : readBare('');
      fields.push(fValue);
    } while (ended === AT_COMMA);

    // A line that held nothing but stray CRs leaves no record (its errors stay).
    if (fields.length === 1 && fields[0] === '' && !lastWasQuoted) continue;

    if (width < 0) width = fields.length;
    if (wantHeader && columns === null) {
      columns = fields;
      continue;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recLine, row: recRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recLine, row: recRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }

  return { columns: wantHeader ? (columns ?? []) : null, rows, errors };
}
