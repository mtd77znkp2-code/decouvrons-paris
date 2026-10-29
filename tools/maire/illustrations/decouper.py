# Découpe les planches 3 × 3 en une image par bâtiment (public/maire/img/bat/<id>.webp)
from PIL import Image
import os
ICI = os.path.dirname(os.path.abspath(__file__))
SORTIE = os.path.join(ICI, "..", "..", "..", "public", "maire", "img", "bat")
PLANCHES = {
    "A": ["parc", "ecole", "proprete", "hopital", "jardinsPartages", "fontaines", "cinePleinAir", "mediatheque", "piscine"],
    "B": ["centreSante", "foretUrbaine", "stade", "conservatoire", "toitsVegetaux", "kiosque", "fontaineMonumentale", "statueAssidu", "logements"],
    "C": ["quartier", "residenceEtudiante", "foyerJeunes", "renovThermique", "intergeneration", "hebergementUrgence", "cooperative", "tourBois", "villageVertical"],
    "D": ["police", "eclairageLed", "mediateurs", "pompiers", "videoprotection", "policeProximite", "prevention", "centreCrise", "velo"],
    "E": ["tram", "metro", "velib", "covoiturage", "busElec", "parkingRelais", "navette", "rer", "tramTrain"],
    "F": ["poleEchanges", "marche", "musee", "incubateur", "halleGourmande", "officeTourisme", "maisonEmploi", "antiGaspi", "caisseCredit"],
}
TAILLE = 192
faits = []
for lettre, ids in PLANCHES.items():
    f = os.path.join(ICI, "planche-" + lettre + ".png")
    if not os.path.exists(f): continue
    im = Image.open(f).convert("RGBA"); W, H = im.size; px = im.load()
    # Chaque bâtiment = une zone opaque d'un seul tenant ; on garde les 9 plus grandes, rangées par case selon leur centre
    plein = bytearray(1 if px[x, y][3] > 40 else 0 for y in range(H) for x in range(W)); zone = [0] * (W * H); infos = []
    for i0 in range(W * H):
        if not plein[i0] or zone[i0]: continue
        n = len(infos) + 1; pile = [i0]; zone[i0] = n; pts = []
        while pile:
            j = pile.pop(); pts.append(j); x, y = j % W, j // W
            for k2 in ((j + 1) if x < W - 1 else -1, (j - 1) if x > 0 else -1, j + W if y < H - 1 else -1, j - W if y > 0 else -1):
                if k2 >= 0 and plein[k2] and not zone[k2]: zone[k2] = n; pile.append(k2)
        infos.append((len(pts), n, pts))
    grandes = sorted(infos, reverse=True)[:9]
    cases = {}
    for t, n, pts in grandes:
        xs = [j % W for j in pts]; ys = [j // W for j in pts]
        cx, cy = sum(xs) / len(xs), sum(ys) / len(ys)
        cases[int(cy * 3 // H) * 3 + int(cx * 3 // W)] = (n, min(xs), min(ys), max(xs) + 1, max(ys) + 1)
    for k, id in enumerate(ids):
        if k not in cases: print("case vide", lettre, k); continue
        n, x0, y0, x1, y1 = cases[k]
        case = im.crop((x0, y0, x1, y1)); cp = case.load()
        for yy in range(y1 - y0):
            for xx in range(x1 - x0):
                if zone[(y0 + yy) * W + x0 + xx] != n and cp[xx, yy][3] > 40: cp[xx, yy] = (0, 0, 0, 0)
        cote = max(case.size); carre = Image.new("RGBA", (cote, cote), (0, 0, 0, 0))
        carre.paste(case, ((cote - case.size[0]) // 2, cote - case.size[1]))   # posé en bas, comme sur le sol
        carre.resize((TAILLE, TAILLE), Image.LANCZOS).save(os.path.join(SORTIE, id + ".webp"), "WEBP", quality=82, method=6)
        faits.append(id)
print(len(faits), "illustrations")
print(",".join('"' + i + '"' for i in faits))
