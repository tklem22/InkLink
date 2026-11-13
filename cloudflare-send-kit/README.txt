ANNIVERSARY FRAME - free hosting + phone send page
===================================================
What this is: a tiny free website. Your phone sends a photo, words or a drawing to it.
The frame asks the website "anything new?" every few minutes and shows the newest picture.

Files
  public/index.html   the page you open on your phone
  public/convert.js   turns any picture into the frame's 3-color picture file (96,070 bytes)
  src/worker.js       the website's brain: keeps the latest picture, checks your secret key
  wrangler.toml       settings (two blanks to fill in: a long random name and a storage ID)

Tested here: wrong key is rejected, wrong-size files are rejected, the picture comes back
identical, and the page works for words and drawing. NOT tested yet: a real frame.

The frame's picture address will be:  https://<your-long-random-name>.<your-account>.workers.dev/drawing.bmp
In the frame's code (draw.py) the host line gets just:  <your-long-random-name>.<your-account>.workers.dev
(Not changed yet. We do not edit the repo until the open items are settled.)
