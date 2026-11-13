import os
import time
import displayio
import waveshare7in5bv3
import adafruit_connection_manager
import wifi
import adafruit_requests
import bmpread
import microcontroller

# Where to fetch the picture from. Set FRAME_HOST in settings.toml (hostname only, no https://);
# the line below is only the fallback.
host = os.getenv("FRAME_HOST") or "your-domain.com"

# Optional password for viewing the picture. If FRAME_KEY is set in settings.toml it is sent as the
# "x-frame-key" header. The User-Agent names this device so web hosts can tell it apart from a browser.
frame_key = os.getenv("FRAME_KEY")
request_headers = {"User-Agent": "InkLinkFrame/1.0"}
if frame_key:
    request_headers["x-frame-key"] = frame_key

displayio.release_displays()
display = waveshare7in5bv3.Waveshare7in5Bv3()

pool = None
ssl_context = None
requests = None
errors = 0

# Create the bitmap that matches display exactly
bitmap = displayio.Bitmap(800, 480, 4)
palette = displayio.Palette(4)

# Create a group and add the bitmap with its palette - do this once
group = displayio.Group()
tile_grid = displayio.TileGrid(bitmap, pixel_shader=palette)
group.append(tile_grid)
display.root_group = group

while True:
    if errors > 20:
        print("Too many errors, restarting")
        microcontroller.reset()

    # Set up network
    try:  
        pool = adafruit_connection_manager.get_radio_socketpool(wifi.radio)
        ssl_context = adafruit_connection_manager.get_radio_ssl_context(wifi.radio)
        requests = adafruit_requests.Session(pool, ssl_context)
    except Exception as e:
        print(f"Error setting up network: {e}")
        errors += 1
        time.sleep(10)
        continue

    response = None
    try:
        response = requests.get(f"https://{host}/drawing.bmp", headers=request_headers)
        print(response.status_code)
    except Exception as e:
        print(f"Error getting image: {e}")
        errors += 1
        time.sleep(10)
        continue

    changed = False
    if response and response.status_code == 200:
        try:
            content = response.iter_content(chunk_size=1024)
            print("about to read bmp")
            changed = bmpread.read_bmp(content, bitmap, palette)  # This updates the existing bitmap
            print("finished reading bmp")
            errors = 0  # a full good fetch means the connection is healthy
        except Exception as e:
            print(f"Error loading image: {e}")
            errors += 1
            time.sleep(10)
            continue
        finally:
            response.close()
    elif response is not None:
        response.close()  # free the connection even when the server did not send a picture

    if changed: 
        print("about to refresh")
        display.refresh()
        print("refreshed")
    else:
        print("no changes")
    
    time.sleep(180) 