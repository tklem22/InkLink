ANNIVERSARY FRAME - free hosting + phone send page
===================================================
What this is: a tiny free website. Your phone sends a photo, words or a drawing to it.
The frame asks the website "anything new?" every few minutes and shows the newest picture.

Files
  public/index.html   the page you open on your phone
  public/convert.js   turns any picture into the frame's 3-color picture file (96,070 bytes)
  public/layout.js    fits a sentence onto the frame (biggest handwriting that fits, even lines)
  build.mjs           makes dist/worker-single.js: the Worker + phone page in ONE file for the Cloudflare editor
  src/worker.js       the website's brain: keeps the latest picture, checks your secret key
  wrangler.toml       settings (two blanks to fill in: a long random name and a storage ID; also the hourly timer)

Tested here: wrong key is rejected, wrong-size files are rejected, the picture comes back
identical, and the page works for words and drawing. NOT tested yet: a real frame.

The frame's picture address will be:  https://<your-long-random-name>.<your-account>.workers.dev/drawing.bmp
In the frame's code (draw.py) the host line gets just:  <your-long-random-name>.<your-account>.workers.dev
(Not changed yet. We do not edit the repo until the open items are settled.)

DAILY MESSAGE BANK (new)
========================
Goal: every morning the frame shows a NEW message, like "I love you because..." or "Thank you for...".
  - Open the phone page, tap Bank, type the secret key, paste messages (one per line), tap Add to bank.
    Your phone draws each message in the Dancing Script handwriting (black and white) and stores it.
  - Same words are never added twice (capitals and spacing are ignored). A message is never shown twice.
  - Each morning at 6:00 AM New York time (winter and summer time handled) the Worker picks one unused
    message at random and makes it the frame's picture. Steven's 8:00 AM desk time leaves a big cushion
    (the frame checks every few minutes and the screen takes about 26 seconds to redraw).
  - A message can be saved for one day: start the line with the date and a bar, like   12-06 | Happy anniversary
    Dated messages are only used on that day; everything else is picked at random.
  - If the bank runs out, the frame keeps showing its last picture. The Bank tab shows how many are left.
  - "Use the next message now (test)" picks one immediately (it counts as used). Handy on board-test day.
  - You can still send a photo, words or a drawing any time. The next morning's pick replaces it.

One-time setup after this update (Cloudflare dashboard, free):
  1. Paste dist/worker-single.js (made with:  node build.mjs ) into the Worker's code editor and Deploy.
  2. Worker > Settings > Triggers > Cron Triggers > Add:   0 * * * *    (every hour, on the hour)
  The storage box (FRAME) and secret (SEND_KEY) stay as they are.
  Storage use: each message is one 96 KB picture. About 2 writes per message added, so adding
  a few hundred in one day stays inside the free limit of 1,000 writes a day.

Tested here: no repeats across a whole bank, only one pick per day, 6 AM winter and summer time,
catch-up if the 6 o'clock run is missed, dated messages, empty bank, removing, wrong-key checks,
and the Bank tab in a real browser with the real font. NOT tested yet: the live Cloudflare timer and a real frame.
