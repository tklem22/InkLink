// Fits a sentence onto the frame: picks the biggest letters that still fit, and breaks the
// sentence into evenly sized lines. Pure math (no drawing), so it can be tested without a screen.
//   measure(text, size) -> width in pixels of that text at that letter size
(function (root) {
  function greedy(words, width, measure, size) {
    var lines = [], cur = '';
    for (var i = 0; i < words.length; i++) {
      var tryLine = cur ? cur + ' ' + words[i] : words[i];
      if (cur && measure(tryLine, size) > width) { lines.push(cur); cur = words[i]; }
      else cur = tryLine;
    }
    if (cur) lines.push(cur);
    return lines;
  }

  // Same number of lines, but narrower, so the lines end up about the same length (looks nicer).
  function balanced(words, width, measure, size) {
    var base = greedy(words, width, measure, size);
    if (base.length < 2) return base;
    var lo = 0, hi = width;
    for (var k = 0; k < 14; k++) {
      var mid = (lo + hi) / 2;
      if (greedy(words, mid, measure, size).length === base.length) hi = mid; else lo = mid;
    }
    var out = greedy(words, hi, measure, size);
    return out.length === base.length ? out : base;
  }

  // opts: maxWidth, maxHeight, maxSize, minSize, lineHeight (multiple of size)
  function fitText(text, measure, opts) {
    var o = opts || {};
    var maxW = o.maxWidth || 720, maxH = o.maxHeight || 400;
    var maxSize = o.maxSize || 150, minSize = o.minSize || 28, lh = o.lineHeight || 1.25;
    var words = String(text).replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
    if (!words.length) return { size: minSize, lines: [], lineHeight: lh * minSize, fits: true };
    for (var size = maxSize; size >= minSize; size -= 2) {
      var lines = balanced(words, maxW, measure, size);
      var widest = 0;
      for (var i = 0; i < lines.length; i++) widest = Math.max(widest, measure(lines[i], size));
      if (widest <= maxW && lines.length * size * lh <= maxH) {
        return { size: size, lines: lines, lineHeight: size * lh, fits: true };
      }
    }
    var last = balanced(words, maxW, measure, minSize);
    return { size: minSize, lines: last, lineHeight: minSize * lh, fits: false };
  }

  // "12-06 | I love you because..." -> { date: '12-06', text: 'I love you because...' }
  function parseLine(line) {
    var m = /^\s*(\d{4}-\d{2}-\d{2}|\d{2}-\d{2})\s*\|\s*(.+?)\s*$/.exec(line);
    if (m) return { date: m[1], text: m[2] };
    return { date: '', text: String(line).replace(/\s+/g, ' ').trim() };
  }

  var api = { fitText: fitText, parseLine: parseLine };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.FrameLayout = api;
})(typeof self !== 'undefined' ? self : this);
