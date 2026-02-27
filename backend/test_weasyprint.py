"""诊断 WeasyPrint 字体加载"""
import weasyprint
import logging
import os

logging.basicConfig(level=logging.WARNING)
logger = logging.getLogger("weasyprint")
logger.setLevel(logging.DEBUG)

html = """<!DOCTYPE html><html><head><style>
@font-face {
    font-family: 'FZXiaoBiaoSong-B05';
    src: url('file:///usr/share/fonts/truetype/govai/STZHONGS.TTF');
}
@font-face {
    font-family: 'FZXiaoBiaoSong-B05-fmt';
    src: url('file:///usr/share/fonts/truetype/govai/STZHONGS.TTF') format('truetype');
}
@font-face {
    font-family: 'FangSong';
    src: url('file:///usr/share/fonts/truetype/govai/simfang.ttf') format('truetype');
}
h1 { font-weight: inherit; font-size: inherit; margin: 0; }
</style></head><body>
<h1 style="font-family: 'FZXiaoBiaoSong-B05'; font-size: 22pt; font-weight: normal;">测试1:无format</h1>
<h1 style="font-family: 'FZXiaoBiaoSong-B05-fmt'; font-size: 22pt; font-weight: normal;">测试2:有format</h1>
<h1 style="font-family: 'STZhongsong'; font-size: 22pt; font-weight: normal;">测试3:直接STZhongsong</h1>
<p style="font-family: 'FangSong'; font-size: 16pt;">测试4:FangSong仿宋正文</p>
<hr style="border: none; border-top: 2px solid #cc0000;">
<hr style="border: none; height: 2px; background: #cc0000;">
</body></html>"""

doc = weasyprint.HTML(string=html)
doc.write_pdf("/tmp/test_font.pdf")
print(f"OK, PDF size: {os.path.getsize('/tmp/test_font.pdf')} bytes")

# 检查字体是否存在
for f in ["STZHONGS.TTF", "simfang.ttf", "simhei.ttf", "simkai.ttf"]:
    path = f"/usr/share/fonts/truetype/govai/{f}"
    exists = os.path.exists(path)
    size = os.path.getsize(path) if exists else 0
    print(f"  {f}: exists={exists}, size={size}")
