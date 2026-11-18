// Checks the text fitting: everything fits inside the safe area, short words get big letters, long ones get smaller.
import assert from 'node:assert';
import { createRequire } from 'node:module';
const L = createRequire(import.meta.url)('../public/layout.js');
const measure = (t, size) => t.length * size * 0.5; // pretend every letter is half as wide as tall

const short = L.fitText('I love you', measure, { maxWidth: 720, maxHeight: 400, maxSize: 150 });
assert.ok(short.fits && short.size >= 140, 'short message: big letters');
assert.equal(short.lines.join(' '), 'I love you');

const long = 'I love you because you make every ordinary day feel like a little holiday and you never stop making me laugh';
const fit = L.fitText(long, measure, { maxWidth: 720, maxHeight: 400, maxSize: 150 });
assert.ok(fit.fits);
assert.ok(fit.lines.length >= 2);
for (const line of fit.lines) assert.ok(measure(line, fit.size) <= 720, 'every line fits the width');
assert.ok(fit.lines.length * fit.lineHeight <= 400 + 1e-6, 'all lines fit the height');
assert.equal(fit.lines.join(' '), long, 'no words lost or reordered');
const widths = fit.lines.map((l) => measure(l, fit.size));
assert.ok(Math.max(...widths) - Math.min(...widths.slice(0, -1).concat(widths.slice(-1))) < 0.5 * 720, 'lines are fairly even');

const huge = L.fitText('x '.repeat(400), measure, { maxWidth: 720, maxHeight: 400 });
assert.equal(huge.fits, false, 'a giant text reports that it does not fit');

assert.deepEqual(L.parseLine('12-06 | I love you'), { date: '12-06', text: 'I love you' });
assert.deepEqual(L.parseLine('2026-12-06|Happy day'), { date: '2026-12-06', text: 'Happy day' });
assert.deepEqual(L.parseLine('  Thank you   for today '), { date: '', text: 'Thank you for today' });
assert.deepEqual(L.parseLine('I love you | because'), { date: '', text: 'I love you | because' }, 'only a date before the bar counts');
console.log('layout tests passed');
