#!/usr/bin/env python3
"""Découpe les 4 planches du quartier (tools/maire/a-generer.md) en images pour quartier.js.

Usage : python3 -I tools/maire/decouper-quartier.py mairie.png rues.png vehicules.png parisiens.png [--apercu apercu.png]
Sortie : public/maire/img/quartier/<id>.webp
  - mairie (jour, nuit, neige, fete) et rues : gardées avec leur socle, recadrées au plus juste ;
  - véhicules et Parisiens : le petit pavé dessiné sous eux est effacé (ils roulent et marchent sur nos rues).
"""
import sys, os, importlib.util
import numpy as np
from PIL import Image
from scipy import ndimage

ICI = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("planche", os.path.join(ICI, "decouper-planche.py"))
planche = importlib.util.module_from_spec(spec); spec.loader.exec_module(planche)
SORTIE = os.path.join(ICI, "..", "..", "public", "maire", "img", "quartier")

PLANCHES = [
    (2, ["mairie-jour", "mairie-nuit", "mairie-neige", "mairie-fete"], 300, False),
    (3, ["rue", "croisement", "virage", "place", "sol-arbre", "passage", "sol-lampe", "sol-banc", "pelouse"], 160, False),
    (3, ["voiture", "taxi", "bus", "camionnette", "benne", "ambulance", "pompiers", "velo", "trottinette"], 96, True),
    (4, ["homme", "baguette", "enfant", "canne", "cycliste", "joggeuse", "chien", "touriste",
         "serveur", "balayeur", "policier", "etudiante", "accordeon", "poussette", "livreur", "peintre"], 72, True),
]


def cases(chemin, cols, n):
    rgba, plein = planche.fond_transparent(Image.open(chemin))
    h, w = plein.shape; rangs = (n + cols - 1) // cols
    lab, nb = ndimage.label(plein)
    centres = ndimage.center_of_mass(plein, lab, range(1, nb + 1))
    tailles = ndimage.sum(plein, lab, range(1, nb + 1))
    carte = np.zeros((h, w), dtype=int) - 1
    for k, ((cy, cx), t) in enumerate(zip(centres, tailles), start=1):
        if t < 60: continue
        carte[lab == k] = min(rangs - 1, int(cy / (h / rangs))) * cols + min(cols - 1, int(cx / (w / cols)))
    return rgba, carte


def sans_socle(bloc):
    """Efface le pavé beige sous le personnage / véhicule : couleurs du bas de l'image, reliées au bas."""
    a = bloc[..., 3] > 0; h = a.shape[0]
    rgb = bloc[..., :3].astype(int)
    bas = a.copy(); bas[: int(h * 0.94)] = False
    ech = rgb[bas]
    if not len(ech): return bloc
    # palette du pavé (quantifiée) + pixels proches
    q = lambda c: (c // 8)
    table = np.zeros((32, 32, 32), bool)
    e = q(ech); table[e[:, 0], e[:, 1], e[:, 2]] = True
    table = ndimage.binary_dilation(table, structure=np.ones((3, 3, 3)))
    qq = q(rgb); proche = table[qq[..., 0], qq[..., 1], qq[..., 2]]
    zone = proche & a; zone[: int(h * 0.62)] = False
    lab, _ = ndimage.label(zone)
    ids = set(np.unique(lab[int(h * 0.94):])) - {0}
    socle = np.isin(lab, list(ids))
    socle |= ndimage.binary_dilation(socle, iterations=2) & proche
    out = bloc.copy(); out[..., 3] = np.where(socle, 0, out[..., 3])
    # petites miettes isolées
    m = out[..., 3] > 0; lab2, nb = ndimage.label(m)
    if nb > 1:
        t = ndimage.sum(m, lab2, range(1, nb + 1)); garde = np.isin(lab2, [i + 1 for i, v in enumerate(t) if v >= 25])
        out[..., 3] = np.where(garde, out[..., 3], 0)
    return out


def recadrer(bloc):
    ys, xs = np.where(bloc[..., 3] > 0)
    return bloc[ys.min():ys.max() + 1, xs.min():xs.max() + 1]


if __name__ == "__main__":
    args = sys.argv[1:]; apercu = None
    if "--apercu" in args: k = args.index("--apercu"); apercu = args[k + 1]; del args[k:k + 2]
    os.makedirs(SORTIE, exist_ok=True); vig = []
    for chemin, (cols, ids, largeur, socle) in zip(args, PLANCHES):
        rgba, carte = cases(chemin, cols, len(ids))
        for i, ident in enumerate(ids):
            m = carte == i
            if m.sum() < 500: print("⚠️  case vide :", ident); continue
            bloc = rgba.copy(); bloc[..., 3] = np.where(m, bloc[..., 3], 0); bloc = recadrer(bloc)
            if socle: bloc = recadrer(sans_socle(bloc))
            im = Image.fromarray(bloc, "RGBA")
            im = im.resize((largeur, max(1, round(largeur * im.height / im.width))), Image.LANCZOS)
            im.save(os.path.join(SORTIE, ident + ".webp"), "WEBP", quality=88, method=6)
            vig.append(im); print("✓", ident, im.size)
    if apercu:
        W = 1200; x = y = 0; lh = 0; fond = Image.new("RGBA", (W, 1400), (60, 66, 80, 255))
        for v in vig:
            if x + v.width > W: x = 0; y += lh + 6; lh = 0
            fond.paste(v, (x, y), v); x += v.width + 6; lh = max(lh, v.height)
        fond.crop((0, 0, W, y + lh)).convert("RGB").save(apercu)
