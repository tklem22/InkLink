// Turns any picture (RGBA pixels, 800x480) into the frame's picture file:
// 96,070 bytes = 70-byte header + 96,000 bytes of pixels.
// 2 bits per pixel, top row first, leftmost pixel in the high bits.
// Colors: 0 = white, 1 = black, 2 = red.
(function (root) {
  var W = 800, H = 480;
  var PAL = [[255, 255, 255], [0, 0, 0], [255, 0, 0]];

  function header() {
    var b = new Uint8Array(70);
    var dv = new DataView(b.buffer);
    b[0] = 0x42; b[1] = 0x4d;               // "BM"
    dv.setUint32(2, 70 + 96000, true);       // file size
    dv.setUint32(10, 70, true);              // where pixels start
    dv.setUint32(14, 40, true);              // info header size
    dv.setInt32(18, W, true);
    dv.setInt32(22, -H, true);               // negative = top row first
    dv.setUint16(26, 1, true);
    dv.setUint16(28, 2, true);               // 2 bits per pixel
    dv.setUint32(30, 0, true);
    dv.setUint32(34, 96000, true);
    dv.setInt32(38, 0, true);
    dv.setInt32(42, 0, true);
    dv.setUint32(46, 4, true);               // colors used
    dv.setUint32(50, 0, true);
    // palette, blue-green-red-alpha order (the frame ignores it, but we match the saved test file exactly)
    b.set([255, 255, 255, 255], 54);         // white
    b.set([0, 0, 0, 255], 58);               // black
    b.set([0, 0, 255, 255], 62);             // red
    b.set([0, 255, 255, 255], 66);           // yellow (unused)
    return b;
  }

  // rgba: Uint8ClampedArray/Uint8Array of W*H*4. dither: true for photos, false for flat drawings/text.
  function toFrameBMP(rgba, dither) {
    var n = W * H;
    var r = new Float32Array(n), g = new Float32Array(n), bl = new Float32Array(n);
    for (var i = 0; i < n; i++) {
      var a = rgba[i * 4 + 3] / 255;
      r[i] = rgba[i * 4] * a + 255 * (1 - a);
      g[i] = rgba[i * 4 + 1] * a + 255 * (1 - a);
      bl[i] = rgba[i * 4 + 2] * a + 255 * (1 - a);
    }
    var out = new Uint8Array(70 + 96000);
    out.set(header(), 0);
    for (var y = 0; y < H; y++) {
      for (var x = 0; x < W; x++) {
        var p = y * W + x;
        var best = 0, bd = 1e12;
        for (var c = 0; c < 3; c++) {
          var dr = r[p] - PAL[c][0], dg = g[p] - PAL[c][1], db = bl[p] - PAL[c][2];
          var d = dr * dr + dg * dg + db * db;
          if (d < bd) { bd = d; best = c; }
        }
        var byteIndex = 70 + y * 200 + (x >> 2);
        out[byteIndex] |= best << (6 - 2 * (x & 3));
        if (dither) {
          var er = r[p] - PAL[best][0], eg = g[p] - PAL[best][1], eb = bl[p] - PAL[best][2];
          var spread = function (dx, dy, f) {
            var xx = x + dx, yy = y + dy;
            if (xx < 0 || xx >= W || yy >= H) return;
            var q = yy * W + xx;
            r[q] += er * f; g[q] += eg * f; bl[q] += eb * f;
          };
          spread(1, 0, 7 / 16); spread(-1, 1, 3 / 16); spread(0, 1, 5 / 16); spread(1, 1, 1 / 16);
        }
      }
    }
    return out;
  }

  var api = { toFrameBMP: toFrameBMP, W: W, H: H };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.FrameConvert = api;
})(typeof self !== 'undefined' ? self : this);
