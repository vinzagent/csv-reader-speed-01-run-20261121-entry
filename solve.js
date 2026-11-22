// Fast drop-in for csv-reader 1.0.0 (make.fun's own CSV reader).
//
// Same answer as the reference on every input, {columns, rows, errors} for
// {text, header}: BOM dropped, records end at LF/CRLF, empty lines are no
// records, a lone CR outside quotes is dropped (stray_cr), a field that opens
// with a quote runs to the next undoubled quote ("" inside is one quote, CR /
// CRLF / LF inside is one LF), junk after the closing quote is appended as it
// stands (quote_junk), a quote that never closes is literal and the rest is
// re-read unquoted (unterminated_quote), quotes inside unquoted fields are
// literal, fields stay strings, rows are padded (short_row) or cut (long_row)
// to the first record's width, errors carry {code, line, row} in the order met.
//
// Speed comes from two paths. Most records are plain: no quote, no stray CR.
// Those are taken whole — one slice of the line and one split(',') — instead
// of one character at a time. Records that do hold a quote or a stray CR go
// through a field-by-field reader that jumps with indexOf instead of stepping character by character, and only
// the rare newline-bearing quoted segment is walked closely. No state is kept from one call to the next.

const COMMA = 0;
const LINE_BREAK = 1;
const END = 2;

/** csv-reader 1.0.0's answer for one case's input. */
export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;

  const len = text.length;
  let pos = 0; // the next character to read
  let line = 1; // the line that character is on
  if (text.charCodeAt(0) === 0xfeff) pos = 1; // a U+FEFF at the very start is dropped

  // The record being read: the line it starts on and the index in rows it takes (null: the header).
  let recordLine = 1;
  let recordRow = null;

  // Reads unquoted characters onto `value` up to the next comma or line break: a CR not followed by LF is dropped
  // (stray_cr). Returns the field and how it ended; `added` counts the characters kept.
  function readUnquoted(value) {
    let added = 0;
    for (;;) {
      const ci = text.indexOf(',', pos);
      const ni = text.indexOf('\n', pos);
      let end;
      let ended;
      if (ci !== -1 && (ni === -1 || ci < ni)) {
        end = ci;
        ended = COMMA;
      } else if (ni !== -1) {
        end = ni;
        ended = LINE_BREAK;
      } else {
        end = len;
        ended = END;
      }
      const chunk = end > pos ? text.slice(pos, end) : '';
      const ri = chunk.indexOf('\r');
      if (ri === -1) {
        if (chunk.length > 0) {
          value += chunk;
          added += chunk.length;
        }
        if (ended === COMMA) {
          pos = end + 1;
          return { value, ended: COMMA, added };
        }
        if (ended === LINE_BREAK) {
          pos = end + 1;
          line += 1;
          return { value, ended: LINE_BREAK, added };
        }
        pos = len;
        return { value, ended: END, added };
      }
      if (ended === LINE_BREAK && ri === chunk.length - 1) {
        // CRLF: the CR is part of the line break.
        if (ri > 0) {
          value += chunk.slice(0, -1);
          added += chunk.length - 1;
        }
        pos = end + 1;
        line += 1;
        return { value, ended: LINE_BREAK, added };
      }
      // A lone CR inside the field is dropped (stray_cr); the rest of the field is read again.
      if (ri > 0) {
        value += chunk.slice(0, ri);
        added += ri;
      }
      errors.push({ code: 'stray_cr', line: recordLine, row: recordRow });
      pos = pos + ri + 1;
    }
  }

  // Appends a quoted segment (no quote in it) to `value`, each CR, CRLF or LF in it becoming one LF.
  function appendQuotedSegment(value, seg) {
    let i = 0;
    const n = seg.length;
    for (;;) {
      let r = seg.indexOf('\r', i);
      if (r === -1) r = n;
      let l = seg.indexOf('\n', i);
      if (l === -1) l = n;
      const j = r < l ? r : l;
      if (j > i) value += seg.slice(i, j);
      if (j >= n) return value;
      value += '\n';
      line += 1;
      i = j + (seg.charCodeAt(j) === 13 && seg.charCodeAt(j + 1) === 10 ? 2 : 1);
    }
  }

  // Reads a quoted field whose opening quote is at pos.
  function readQuoted() {
    const open = pos;
    const openLine = line;
    let value = '';
    pos += 1;
    for (;;) {
      if (pos >= len) {
        // The quote never closes: it is a literal character, and the text after it is read again as unquoted.
        pos = open + 1;
        line = openLine;
        errors.push({ code: 'unterminated_quote', line: recordLine, row: recordRow });
        return readUnquoted('"');
      }
      const q = text.indexOf('"', pos);
      if (q === -1) {
        pos = open + 1;
        line = openLine;
        errors.push({ code: 'unterminated_quote', line: recordLine, row: recordRow });
        return readUnquoted('"');
      }
      if (q > pos) {
        const seg = text.slice(pos, q);
        value = seg.indexOf('\r') === -1 && seg.indexOf('\n') === -1 ? value + seg : appendQuotedSegment(value, seg);
      }
      if (text.charCodeAt(q + 1) === 34) {
        // A doubled quote is one quote inside the field.
        value += '"';
        pos = q + 2;
        continue;
      }
      // The closing quote.
      pos = q + 1;
      if (pos >= len) return { value, ended: END };
      const c = text.charCodeAt(pos);
      if (c === 44) {
        pos += 1;
        return { value, ended: COMMA };
      }
      if (c === 10) {
        pos += 1;
        line += 1;
        return { value, ended: LINE_BREAK };
      }
      if (c === 13 && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line += 1;
        return { value, ended: LINE_BREAK };
      }
      // What follows the closing quote is appended as it stands, up to the next comma or line break.
      const junk = readUnquoted(value);
      if (junk.added > 0) errors.push({ code: 'quote_junk', line: recordLine, row: recordRow });
      return junk;
    }
  }

  for (;;) {
    // Lines with no characters are no records.
    while (pos < len) {
      const c = text.charCodeAt(pos);
      if (c === 10) {
        pos += 1;
        line += 1;
      } else if (c === 13 && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line += 1;
      } else {
        break;
      }
    }
    if (pos >= len) break;

    recordLine = line;
    recordRow = header && columns === null ? null : rows.length;

    let fields = null;
    let lastQuoted = false;

    // Fast path: the record's line holds no quote and no stray CR, so the record is exactly this line.
    const nl = text.indexOf('\n', pos);
    const end = nl === -1 ? len : nl;
    const rawLine = text.slice(pos, end);
    if (rawLine.indexOf('"') === -1) {
      const ri = rawLine.indexOf('\r');
      if (ri === -1) {
        fields = rawLine.split(',');
        pos = nl === -1 ? len : nl + 1;
        if (nl !== -1) line += 1;
      } else if (ri === rawLine.length - 1) {
        if (nl !== -1) {
          // CRLF: the CR is part of the line break.
          fields = rawLine.slice(0, -1).split(',');
          pos = nl + 1;
          line += 1;
        } else {
          // A lone CR at the very end of the text is dropped (stray_cr).
          errors.push({ code: 'stray_cr', line: recordLine, row: recordRow });
          fields = rawLine.slice(0, -1).split(',');
          pos = len;
        }
      }
      // Any other CR in the line is a stray CR mid-record: fall through to the slow path.
    }

    if (fields === null) {
      // Slow path: the record holds a quote or a stray CR; read it field by field.
      fields = [];
      let field;
      do {
        lastQuoted = text.charCodeAt(pos) === 34;
        field = lastQuoted ? readQuoted() : readUnquoted('');
        fields.push(field.value);
      } while (field.ended === COMMA);
    }

    // A line that held only stray CRs is left with no characters: no record (its stray_cr errors stay).
    if (fields.length === 1 && fields[0] === '' && !lastQuoted) continue;

    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      continue;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }
  return { columns: header ? (columns ?? []) : null, rows, errors };
}
