from pathlib import Path
from PIL import Image


ROOT = Path(__file__).resolve().parents[1] / "assets" / "generated" / "wechat-v2"

# The generated masters intentionally include presentation margins. UI code
# consumes these cropped derivatives so the decorative rim maps to the actual
# component edge instead of crossing live content.
CROPS = {
    "relationship-hero-dusk.png": (0.027, 0.070, 0.968, 0.938),
    "chat-relationship-header.png": (0.009, 0.103, 0.991, 0.893),
    "voice-message-shell.png": (0.038, 0.198, 0.962, 0.789),
    "shared-memory-card.png": (0.008, 0.014, 0.992, 0.984),
    "composer-tray.png": (0.012, 0.512, 0.989, 0.925),
    "relationship-gift-card.png": (0.074, 0.066, 0.926, 0.953),
    "list-row-shell.png": (0.011, 0.064, 0.987, 0.946),
    "bubble-incoming-shell.png": (0.048, 0.098, 0.952, 0.865),
    "bubble-outgoing-shell.png": (0.046, 0.126, 0.980, 0.872),
}


for filename, ratios in CROPS.items():
    source = ROOT / filename
    with Image.open(source) as image:
        width, height = image.size
        left, top, right, bottom = ratios
        box = (
            round(width * left),
            round(height * top),
            round(width * right),
            round(height * bottom),
        )
        cropped = image.crop(box)
        output = ROOT / f"{source.stem}-ui.png"
        cropped.save(output, optimize=True)
        print(f"{filename}: {image.size} -> {cropped.size} ({output.name})")
