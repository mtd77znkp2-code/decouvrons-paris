# Garde seulement les grandes zones opaques (les 9 icônes) et efface le halo semi-transparent autour
import sys
from PIL import Image
from collections import deque
src, dst, apercu = sys.argv[1:4]
brut = Image.open(src); im = brut.convert("RGBA"); W, H = im.size; px = im.load()
# Faux damier dessiné (image sans transparence) : on efface le gris clair relié aux bords
if "A" not in brut.mode:
    def fond(c): return min(c[:3]) >= 218 and max(c[:3]) - min(c[:3]) <= 12
    vu = bytearray(W * H); q = deque([(x, y) for x in range(W) for y in (0, H - 1)] + [(x, y) for y in range(H) for x in (0, W - 1)])
    while q:
        x, y = q.popleft(); i = y * W + x
        if vu[i] or not fond(px[x, y]): continue
        vu[i] = 1; px[x, y] = (0, 0, 0, 0)
        for X, Y in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if 0 <= X < W and 0 <= Y < H and not vu[Y * W + X]: q.append((X, Y))
opaque = bytearray(1 if px[x, y][3] >= 224 else 0 for y in range(H) for x in range(W))
comp = [0] * (W * H); tailles = {}; n = 0
for i in range(W * H):
    if opaque[i] and not comp[i]:
        n += 1; q = deque([i]); comp[i] = n; t = 0
        while q:
            j = q.popleft(); t += 1; x, y = j % W, j // W
            for k in ((j + 1) if x < W - 1 else -1, (j - 1) if x > 0 else -1, j + W if y < H - 1 else -1, j - W if y > 0 else -1):
                if k >= 0 and opaque[k] and not comp[k]: comp[k] = n; q.append(k)
        tailles[n] = t
gros = {c for c, t in tailles.items() if t > 15000}
print("zones gardées :", len(gros))
for y in range(H):
    for x in range(W):
        if comp[y * W + x] not in gros: px[x, y] = (0, 0, 0, 0)
im.save(dst)
f = Image.new("RGBA", (W, H), (27, 37, 80, 255)); f.alpha_composite(im); f.convert("RGB").resize((W // 2, H // 2)).save(apercu)
