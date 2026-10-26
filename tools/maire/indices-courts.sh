#!/bin/bash
# Liste les indices de moins de 5 caractères (comptés en caractères, pas en octets)
python3 - "$@" <<'PY'
import sys,glob,re
for f in sorted(glob.glob('tools/maire/sources/*.txt')):
    for i,l in enumerate(open(f,encoding='utf8'),1):
        m=re.match(r'^[ABC]\) .+ :: (.+)$',l.rstrip('\n'))
        if m and len(m.group(1))<5: print(f'{f}:{i}: {l.strip()}')
PY
