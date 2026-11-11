const { chromium, devices } = require('playwright');
const DUREE = +process.argv[2] || 150000, MODE = process.argv[3] || "tel";
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext(MODE==="tel"?devices["iPhone 13"]:{viewport:{width:1500,height:950}}); const p = await ctx.newPage();
  const errs=[], cons=[]; p.on("pageerror",e=>errs.push(e.message)); p.on("console",m=>{ if(m.type()==="error") cons.push(m.text().slice(0,150)); });
  await p.addInitScript(()=>{try{localStorage.setItem("maire_invite","1");localStorage.setItem("maire_vitesse_test","20")}catch(e){}});
  await p.goto("http://localhost:8765/#jouer"); await p.waitForTimeout(2500);
  await p.evaluate(()=>document.querySelectorAll(".entree").forEach(e=>e.remove()));
  await p.evaluate(()=>document.querySelector(".mx-jouer").click()); await p.waitForTimeout(1200);
  await p.evaluate(()=>{[...document.querySelectorAll("button")].find(b=>/Prendre mes fonctions/.test(b.textContent)).click()}); await p.waitForTimeout(1500);
  const stats={}, bloque=[], vides={}; let memeModale=0, derniere="";
  const t0=Date.now();
  while (Date.now()-t0 < DUREE) {
    const r = await p.evaluate(()=>{
      const vis=e=>{const r=e.getBoundingClientRect(); return r.width>0&&r.height>0&&getComputedStyle(e).visibility!=="hidden";};
      const ok=b=>!b.disabled&&vis(b)&&b.getAttribute("aria-disabled")!=="true";
      const pick=(sel,re)=>[...document.querySelectorAll(sel)].filter(ok).filter(b=>!re||re.test(b.textContent));
      const go=(l,k)=>{ if(!l.length) return null; const b=l[Math.floor(Math.random()*l.length)]; b.click(); return k+":"+b.textContent.trim().slice(0,30); };
      document.querySelectorAll(".m-bulle").forEach(e=>{const ok=e.querySelector("button"); ok&&ok.click();});
      const elec=document.getElementById("m-election"); if(elec){ return go(pick("#m-election button",/Continuer/),"elec")||"elec-attente"; }
      const fin=document.querySelector(".mx-fin-carte"); if(fin) return "FIN:"+fin.querySelector(".m-sur").textContent;
      const mod=document.getElementById("m-modale");
      if(mod){
        const prio = pick("#m-modale button",/Prendre cette réponse|Retour à ma mairie|Retour au dossier|Continuer|Tirer|Rester|Lancer|Miser|Jouer|Suivre|Parler|Relancer|Se coucher|Tapis|Rouge|Noir|Pair|Impair|Valider|Main suivante|Nouvelle main/);
        if(prio.length) return go(prio,"mod");
        const opts=pick("#m-modale .m-option"); if(opts.length) return go(opts,"opt");
        const all=pick("#m-modale button").filter(b=>!/Fermer|Règles/.test(b.textContent)); if(all.length) return go(all,"modx");
        return "MODALE-VIDE:"+mod.innerText.slice(0,90).replace(/\n/g," ").replace(/[0-9]+/g,"#")+" | btns:"+[...mod.querySelectorAll("button")].map(b=>b.textContent.trim().slice(0,15)+(b.disabled?"(off)":"")).join(",");
      }
      const pops=[...document.querySelectorAll(".m-pop,.mx-fichepop")].filter(vis);
      if(pops.length){ const pp=pops[pops.length-1]; const l=[...pp.querySelectorAll("button")].filter(ok); const a=l.filter(b=>/Lancer l’attaque|Activer|Construire|Embaucher|Recruter|Déplacer|Continuer|\+/.test(b.textContent)||b.classList.contains("mx-attaque")||b.classList.contains("mx-cible"));
        if(a.length&&Math.random()<0.6) return go(a,"pop"); const f=l.filter(b=>/✕|Fermer|Retour/.test(b.textContent)); if(f.length) return go(f,"popclose"); pp.remove(); return "pop-retire"; }
      const x=Math.random();
      if(x<0.3){ const d=document.querySelector(".m-barmois .btn.mx-dossier"); if(d&&ok(d)){ d.click(); return "dossier"; } }
      if(x<0.6){ const r=go(pick(".mx-bat:not(.mx-bat-off)"),"achat"); if(r) return r; }
      if(x<0.68){ const r=go(pick(".mx-rayon"),"rayon"); if(r) return r; }
      if(x<0.74){ const r=go(pick("button",/Embaucher|Recruter/),"emb"); if(r) return r; }
      if(x<0.80){ const a=document.querySelector(".mx-ses-attaque"); if(a&&ok(a)){a.click(); return "guerre";} }
      if(x<0.84){ const r=go(pick(".mx-ses-btn"),"classement"); if(r) return r; }
      if(x<0.86){ const r=go(pick(".mx-onglet"),"onglet"); if(r) return r; }
      if(x<0.87){ const r=go(pick(".mx-roue-go"),"roue"); if(r) return r; }
      if(x<0.875){ const c=document.querySelector(".mx-quartier .mx-q-canvas"); if(c&&vis(c)){ c.click(); return "quartier"; } }
      if(x<0.88){ const t=document.querySelector(".mx-hud .m-tel"); if(t&&ok(t)){ t.click(); return "tel"; } }
      if(x<0.88){ const r=go(pick(".mx-info"),"fiche"); if(r) return r; }
      return "attente";
    });
    const k=(r||"null").split(":")[0]; stats[k]=(stats[k]||0)+1; if(k==="MODALE-VIDE"){ vides[r]=(vides[r]||0)+1; }
    if (/^(mod|opt|modx|MODALE)/.test(r||"")) { const cur=await p.evaluate(()=>{const m=document.getElementById("m-modale"); return m?m.innerText.slice(0,60):""}); if(cur===derniere) memeModale++; else memeModale=0; derniere=cur; if(memeModale>25){ bloque.push("bloqué: "+cur.replace(/\n/g," ")); memeModale=0; await p.evaluate(()=>{const f=document.querySelector(".m-pop-fermer"); f&&f.click();}); } }
    if (/^FIN/.test(r||"")) { bloque.push(r); if(/^FIN/.test(r)) break; }
    await p.waitForTimeout(250+Math.random()*350);
  }
  const etat = await p.evaluate(()=>{const s=JSON.parse(localStorage.getItem("maire_partie_v3")||"null"); return s&&{t:s.t,mandat:s.mandat,bat:Object.values(s.bat).reduce((a,b)=>a+b,0),travaux:(s.travaux||[]).length,tresor:Math.round(s.tresor),phase:s.phase,niv:s.nivJ};});
  console.log(MODE, JSON.stringify(stats)); console.log("etat", JSON.stringify(etat)); console.log("bloque", [...new Set(bloque)].slice(0,8)); console.log("vides", JSON.stringify(Object.entries(vides).sort((a,b)=>b[1]-a[1]).slice(0,6))); console.log("erreurs-jeu", await p.evaluate(()=>localStorage.getItem("maire_erreurs"))); console.log("pageerrors", [...new Set(errs)].slice(0,8)); console.log("console", [...new Set(cons)].filter(c=>!/ERR_|net::|Failed to load|firestore|tiktok|gstatic/i.test(c)).slice(0,8));
  await p.screenshot({path:"singe-"+MODE+".png"}); await b.close();
})();
