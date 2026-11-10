from pathlib import Path
from PIL import Image, ImageDraw

size, scale = 1024, 3
image = Image.new("RGB", (size * scale, size * scale), "#285F4C")
draw = ImageDraw.Draw(image)
def polygon(points, color):
    draw.polygon([(int(x*scale), int(y*scale)) for x,y in points], fill=color)
def line(points, color, width):
    draw.line([(int(x*scale), int(y*scale)) for x,y in points], fill=color, width=width*scale, joint="curve")

polygon([(220,290),(485,350),(485,740),(220,677)], "#F8F7EC")
polygon([(539,350),(804,290),(804,677),(539,740)], "#E6EDD9")
line([(513,350),(513,744)], "#D8B76D", 16)
line([(274,398),(425,432)], "#91AE93", 13)
line([(274,471),(425,505)], "#91AE93", 13)
line([(600,432),(751,398)], "#91AE93", 13)
polygon([(496,277),(445,228),(441,172),(494,190),(519,239)], "#D9BE77")
polygon([(523,279),(578,234),(582,179),(532,198),(507,243)], "#C0D5A9")
line([(514,228),(514,348)], "#D9BE77", 13)
image = image.resize((size,size), Image.Resampling.LANCZOS)
destination = Path(__file__).parent / "QingyanApp/Assets.xcassets/AppIcon.appiconset/AppIcon.png"
destination.parent.mkdir(parents=True, exist_ok=True)
image.save(destination)
print(destination)
