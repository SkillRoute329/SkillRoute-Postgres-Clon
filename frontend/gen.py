import xlrd, json, os

def et(v):
    try:
        f=float(v)
        if f<=0 or f>=2: return None
        t=round(f*24*3600)
        return f"{t//3600:02d}:{(t%3600)//60:02d}"
    except: return None

ROOT = r'C:\Users\jonat\Desktop\PROYECTOS\TransformaFacil-2.0'
FRONT = ROOT + r'\frontend'
OUT = FRONT + r'\src\data\ucot_master_intelligence_2026.json'
XLS1 = ROOT + r'\CARTONES Hábil verano 2026 desde 26.12.2025.xls'
XLS2 = ROOT + r'\matriz de servcio.xls'

wb = xlrd.open_workbook(XLS1)
cartones = {}
for sn in wb.sheet_names():
    sh = wb.sheet_by_name(sn)
    if sh.nrows < 3: continue
    r1=sh.row_values(1); r2=sh.row_values(2)
    linea=''
    for v in r1:
        try:
            c=str(int(float(str(v).strip())))
            if 2<=len(c)<=4: linea=c; break
        except: pass
    paradas=[{'col':i,'nombre':str(v).strip()} for i,v in enumerate(r2) if str(v).strip()]
    instr=''
    if sh.nrows>3:
        sv=str(sh.row_values(3)[0]).strip()
        if sv: instr=sv
    filas=[]
    notas=[]
    for ri in range(3,sh.nrows):
        row=sh.row_values(ri)
        tf=[]; ok=False; fila_texto=[]
        for p in paradas:
            v=row[p['col']] if p['col']<len(row) else ''
            sv=str(v).strip()
            if 'ESPERA' in p['nombre'].upper():
                try:
                    fv=float(v)
                    tf.append(str(int(fv)) if fv>2 else '--')
                except:
                    tf.append(sv if sv else '--')
                continue
            t=et(v)
            if t:
                ok=True; tf.append(t)
            else:
                if sv and len(sv)>3 and not sv.replace('.','').replace('0','')=='':
                    tf.append(sv)
                else:
                    tf.append('--:--')
        if ok:
            filas.append(tf)
        else:
            texts=[str(v).strip() for v in row if str(v).strip()]
            if texts: notas.append(' '.join(texts))
    headers=[{'id':'stop-'+str(i),'location':p['nombre']} for i,p in enumerate(paradas)]
    cartones[sn]={'id':sn,'servicioId':sn,'serviceNumber':sn,'linea':linea,'temporada':'VERANO','tipo_dia':'HABIL','instruccionesEspeciales':instr,'headers':headers,'rawMatrix':[{'checkpoints':f} for f in filas],'paradas':[p['nombre'] for p in paradas],'notas':notas}

wb2=xlrd.open_workbook(XLS2)
lineas={}; svcs=[]; seen=set()
for sn in wb2.sheet_names():
    sh=wb2.sheet_by_name(sn)
    r1=sh.row_values(1)
    paradas=[str(v).strip() for v in r1 if str(v).strip()][1:]
    lid=sn[:-1] if sn and sn[-1] in 'ab' else sn
    var=sn[-1] if sn and sn[-1] in 'ab' else ''
    if lid not in lineas: lineas[lid]={'id':lid,'nombre':'Linea '+lid,'activa':True}
    for ri in range(2,sh.nrows):
        row=sh.row_values(ri)
        if not row[0]: continue
        try: sid=str(int(float(row[0])))
        except: sid=str(row[0]).strip()
        key=lid+'-'+sid
        if not sid or key in seen: continue
        seen.add(key)
        filas=[et(row[i+1]) or '--:--' for i in range(len(paradas)) if i+1<len(row)]
        if sid in cartones:
            s=dict(cartones[sid]); s['lineaId']=sn; s['variante']=var; s['puntosControl']=paradas
        else:
            s={'servicioId':sid,'lineaId':sn,'linea':lid,'variante':var,'serviceNumber':sid,'puntosControl':paradas,'headers':[{'id':'stop-'+str(i),'location':p} for i,p in enumerate(paradas)],'rawMatrix':[{'checkpoints':filas}],'temporada':'VERANO','tipo_dia':'HABIL','notas':[]}
        svcs.append(s)

ids_en_svcs={s['servicioId'] for s in svcs}
for sid,c in cartones.items():
    if sid not in ids_en_svcs:
        s=dict(c); lin=c['linea']; s['lineaId']=lin+'a'; s['variante']='a'; s['puntosControl']=c['paradas']
        svcs.append(s)
        if lin and lin not in lineas: lineas[lin]={'id':lin,'nombre':'Linea '+lin,'activa':True}

pts=set(p for s in svcs for p in s.get('puntosControl',[]))
master={'version':'2026-verano','source':'CARTONES+Matriz Verano 2026','temporada':'VERANO','lineas':sorted(lineas.values(),key=lambda x:x['id']),'puntosControl':sorted(pts),'servicios':svcs}
with open(OUT,'w',encoding='utf-8') as f: json.dump(master,f,ensure_ascii=False,indent=2)
size=os.path.getsize(OUT)
print('OK: '+str(size//1024)+' KB | Lineas: '+str(len(master['lineas']))+' | Servicios: '+str(len(svcs)))

