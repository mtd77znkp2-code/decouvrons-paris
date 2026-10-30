#!/usr/bin/env python3
"""Découpe une planche d'illustrations générée par IA (grille de bâtiments sur fond blanc) en images du jeu.

Usage : python3 tools/maire/decouper-planche.py planche.png id1 id2 ... [--apercu apercu.png] [--ui]
  - les identifiants sont donnés dans l'ordre de la grille (de gauche à droite, puis de haut en bas) ;
  - chaque bâtiment est enregistré dans public/maire/img/bat/<id>.webp (192 × 192, fond transparent).

Méthode : le fond blanc relié aux bords devient transparent (avec le liseré clair autour des bâtiments),
puis chaque morceau de dessin est rattaché à la case de la grille où se trouve son centre ;
un bâtiment qui déborde un peu sur la case voisine reste donc entier.
"""
import sys, os
import numpy as np
from PIL import Image
from scipy import ndimage

TAILLE = 192          # taille des images du jeu
MARGE = 0.05          # marge transparente autour du bâtiment
SORTIE = os.path.join(os.path.dirname(__file__), "..", "..", "public", "maire", "img", "bat")


def fond_transparent(img):
    a = np.asarray(img.convert("RGB")).astype(np.int16)
    mn, mx = a.min(axis=2), a.max(axis=2)
    blanc = (mn > 232) & (mx - mn < 20)                  # blanc (ou presque) et peu coloré
    clair = (mn > 200) & (mx - mn < 28)                  # liseré clair laissé par l'IA autour des dessins
    lab, n = ndimage.label(blanc)
    bord = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    fond = np.isin(lab, list(bord))
    # On grignote le liseré clair collé au fond (2 pixels au plus)
    for _ in range(2):
        fond = fond | (ndimage.binary_dilation(fond) & clair)
    rgba = np.dstack([a.astype(np.uint8), np.where(fond, 0, 255).astype(np.uint8)])
    return rgba, ~fond


def decouper(chemin, ids, apercu=None, sortie=None, taille=None):
    global SORTIE, TAILLE
    if sortie: SORTIE = sortie
    if taille: TAILLE = taille
    img = Image.open(chemin)
    rgba, plein = fond_transparent(img)
    h, w = plein.shape
    n = len(ids)
    cols = 3 if n > 4 else n
    rangs = (n + cols - 1) // cols
    lab, nb = ndimage.label(plein)
    tailles = ndimage.sum(plein, lab, range(1, nb + 1))
    centres = ndimage.center_of_mass(plein, lab, range(1, nb + 1))
    # Case de chaque pixel dessiné : celle du centre de son morceau ; un morceau plus grand qu'une case
    # (deux bâtiments qui se touchent) est coupé le long des lignes de la grille
    cw, ch = w / cols, h / rangs
    yy, xx = np.mgrid[0:h, 0:w]
    case_pixel = (np.minimum(rangs - 1, (yy / ch).astype(int)) * cols + np.minimum(cols - 1, (xx / cw).astype(int)))
    carte = np.full((h, w), -1, dtype=int)
    boites = ndimage.find_objects(lab)
    for k, (t, (cy, cx)) in enumerate(zip(tailles, centres), start=1):
        if t < 150:                                       # poussières
            continue
        sl = boites[k - 1]; mk = lab == k
        haut, large = sl[0].stop - sl[0].start, sl[1].stop - sl[1].start
        if haut > ch * 1.2 or large > cw * 1.2:
            carte[mk] = case_pixel[mk]
        else:
            c = min(cols - 1, int(cx / cw)); r = min(rangs - 1, int(cy / ch))
            carte[mk] = r * cols + c
    os.makedirs(SORTIE, exist_ok=True)
    vignettes = []
    for i, ident in enumerate(ids):
        m = carte == i
        if m.sum() < 500:
            print("⚠️  case", i + 1, "vide :", ident)
            continue
        ys, xs = np.where(m)
        y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
        bloc = rgba[y0:y1, x0:x1].copy()
        bloc[..., 3] = np.where(m[y0:y1, x0:x1], bloc[..., 3], 0)
        cote = int(max(y1 - y0, x1 - x0) * (1 + 2 * MARGE))
        carre = Image.new("RGBA", (cote, cote), (0, 0, 0, 0))
        carre.paste(Image.fromarray(bloc, "RGBA"), ((cote - (x1 - x0)) // 2, (cote - (y1 - y0)) // 2))
        fin = carre.resize((TAILLE, TAILLE), Image.LANCZOS)
        fin.save(os.path.join(SORTIE, ident + ".webp"), "WEBP", quality=90, method=6)
        vignettes.append(fin)
        print("✓", ident, "(" + str(x1 - x0) + "×" + str(y1 - y0) + " px)")
    if apercu and vignettes:
        fond = Image.new("RGBA", (TAILLE * cols, TAILLE * rangs), (24, 33, 80, 255))
        for i, v in enumerate(vignettes):
            fond.paste(v, ((i % cols) * TAILLE, (i // cols) * TAILLE), v)
        fond.convert("RGB").save(apercu)


def declarer(ids):
    """Ajoute les bâtiments à la liste ILLUSTRES de contenu.js (le jeu n'affiche que les illustrations déclarées)."""
    import re
    chemin = os.path.join(os.path.dirname(__file__), "..", "..", "public", "maire", "contenu.js")
    txt = open(chemin, encoding="utf-8").read()
    m = re.search(r"var ILLUSTRES = \[(.*?)\];", txt)
    deja = re.findall(r'"([^"]+)"', m.group(1))
    neufs = [i for i in ids if i not in deja and os.path.exists(os.path.join(SORTIE, i + ".webp"))]
    if neufs:
        liste = ", ".join('"%s"' % i for i in deja + neufs)
        txt = txt[:m.start()] + "var ILLUSTRES = [" + liste + "];" + txt[m.end():]
        open(chemin, "w", encoding="utf-8").write(txt)
    print(len(neufs), "bâtiment(s) ajouté(s) à ILLUSTRES")


if __name__ == "__main__":
    args = sys.argv[1:]
    apercu = None
    if "--apercu" in args:
        k = args.index("--apercu"); apercu = args[k + 1]; del args[k:k + 2]
    # --ui : icônes de l'interface (public/maire/img/ui, 128 px, pas de déclaration dans ILLUSTRES)
    ui = "--ui" in args
    if ui: args.remove("--ui")
    if len(args) < 2:
        print(__doc__); sys.exit(1)
    if ui:
        decouper(args[0], args[1:], apercu, os.path.join(os.path.dirname(__file__), "..", "..", "public", "maire", "img", "ui"), 128)
    else:
        decouper(args[0], args[1:], apercu)
        declarer(args[1:])
