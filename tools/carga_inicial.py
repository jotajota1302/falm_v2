# -*- coding: utf-8 -*-
"""Carga inicial del catalogo LFP para FALM V2 - temporada 2026/27.

Fuentes:
  - futbolfantasy.com  -> JUGADORES (maestro): nombre, posicion, retrato, dorsal
  - football-data.org  -> equipos, escudos, tla, ext_id de club, y el nombre largo
                          del jugador cuando se le puede identificar

Por que futbolfantasy manda en los jugadores: falm.parsear_jornada_ff scrapea esa misma
web para las puntuaciones y falm._casa_nombre empareja POR NOMBRE. Midiendo contra los
451 jugadores que puntuaron en la jornada 1 de 2026/27:
    catalogo football-data (515 jug.) -> casan 80.3%
    catalogo futbolfantasy (856 jug.) -> casan 94.7%  (~99% contando la rama 'X. Apellido')
football-data solo lista el primer equipo consolidado; en un acta aparece mucha mas gente.

Salida (no toca la BD):
  exports/carga_inicial_2026-27.sql   SQL revisable: limpieza + equipos + jugadores + activos
  exports/carga_inicial_control.csv   control por jugador

Convenciones de falm.refrescar_catalogo_lfp que se mantienen:
  ids uuid_generate_v5(NS, clave) y precios PORTERO/DEFENSA 5, MEDIO 6, DELANTERO 7;
  porteria virtual 1.5. Las claves de jugador llevan el prefijo 'ff:' porque la fuente
  cambia (evita chocar con ids derivados de llt-services).
"""
import os, re, csv, json, uuid, html, unicodedata, difflib, urllib.request, time

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(BASE, 'exports')
CACHE = os.path.join(BASE, 'tools', '.cache')
NS = uuid.UUID('fa100000-0000-0000-0000-000000000001')
# token de football-data.org: fuera del codigo. Solo hace falta para descargar;
# con la cache de tools/.cache el script corre sin el.   ->  set FALM_FD_TOKEN=...
FD_TOKEN = os.environ.get('FALM_FD_TOKEN', '')
UA = ('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
      '(KHTML, like Gecko) Chrome/124.0 Safari/537.36')

POS_FF = {'Portero': 'PORTERO', 'Defensa': 'DEFENSA', 'Mediocampista': 'MEDIO', 'Delantero': 'DELANTERO'}
POS_FD = {'Goalkeeper': 'PORTERO', 'Defence': 'DEFENSA', 'Midfield': 'MEDIO', 'Offence': 'DELANTERO'}
PRECIO = {'PORTERO': 5, 'DEFENSA': 5, 'MEDIO': 6, 'DELANTERO': 7}
PRECIO_PORTERIA = 1.5

# slug en futbolfantasy -> nombre del equipo en football-data
SLUG_FF = {
    'alaves': 'Deportivo Alavés', 'athletic': 'Athletic Club', 'atletico': 'Club Atlético de Madrid',
    'barcelona': 'FC Barcelona', 'betis': 'Real Betis Balompié', 'celta': 'RC Celta de Vigo',
    'deportivo': 'RC Deportivo La Coruña', 'elche': 'Elche CF', 'espanyol': 'RCD Espanyol de Barcelona',
    'getafe': 'Getafe CF', 'levante': 'Levante UD', 'malaga': 'Málaga CF', 'osasuna': 'CA Osasuna',
    'racing': 'Real Racing Club de Santander', 'rayo-vallecano': 'Rayo Vallecano de Madrid',
    'real-madrid': 'Real Madrid CF', 'real-sociedad': 'Real Sociedad de Fútbol', 'sevilla': 'Sevilla FC',
    'valencia': 'Valencia CF', 'villarreal': 'Villarreal CF',
}

# tablas a vaciar, en orden de dependencia (estado de prueba de la 2026/27)
LIMPIEZA = [
    'alineacion_activo', 'draft_pick', 'fichaje_extra', 'oferta_activo', 'peticion_fichaje_opcion',
    'peticion_fichaje', 'plantilla', 'puntuacion', 'jornada_lfp_bloqueo',
    'alineacion', 'oferta_intercambio', 'draft_orden', 'draft', 'premio',
    'activo', 'jugador_lfp', 'equipo_lfp',
]


# ---------------------------------------------------------------- utilidades
def get(url, destino, headers=None):
    """Descarga con cache en disco: solo baja lo que falta."""
    if os.path.exists(destino) and os.path.getsize(destino) > 1000:
        return open(destino, 'rb').read()
    req = urllib.request.Request(url, headers=dict({'User-Agent': UA}, **(headers or {})))
    with urllib.request.urlopen(req, timeout=45) as r:
        data = r.read()
    os.makedirs(os.path.dirname(destino), exist_ok=True)
    open(destino, 'wb').write(data)
    time.sleep(1)                     # cortesia con futbolfantasy: 1 peticion/segundo
    return data


def norm(s):
    s = unicodedata.normalize('NFD', s or '')
    s = ''.join(c for c in s if unicodedata.category(c) != 'Mn').lower()
    return re.sub(r'\s+', ' ', re.sub(r'[^a-z0-9 ]', ' ', s)).strip()


PARTICULAS = {'de', 'del', 'da', 'dos', 'la', 'le', 'van', 'der', 'di', 'do', 'el', 'y', 'junior', 'jr'}


def tokens(s):
    return [t for t in norm(s).split() if t not in PARTICULAS]


def pila_compatible(a, b):
    if a == b:
        return True
    if min(len(a), len(b)) >= 3 and (a.startswith(b) or b.startswith(a)):
        return True
    return difflib.SequenceMatcher(None, a, b).ratio() >= 0.55


def score(a, b):
    na, nb = norm(a), norm(b)
    if not na or not nb:
        return 0.0
    if na == nb:
        return 1.0
    ta, tb = set(tokens(a)), set(tokens(b))
    if not ta or not tb:
        return 0.0
    ratio = difflib.SequenceMatcher(None, na, nb).ratio()
    if ta == tb:
        return 0.98
    if ta <= tb or tb <= ta:
        return 0.95
    comunes = ta & tb
    if len(comunes) >= 2:
        return 0.90
    if len(comunes) == 1:
        ta_l, tb_l = tokens(a), tokens(b)
        if len(next(iter(comunes))) >= 5 and ta_l[-1] == tb_l[-1] and pila_compatible(ta_l[0], tb_l[0]):
            return 0.80
        return max(ratio, 0.40)
    return ratio


def q(v):
    """Literal SQL."""
    if v is None or v == '':
        return 'null'
    return "'" + str(v).replace("'", "''") + "'"


def uid(clave):
    return str(uuid.uuid5(NS, clave))


# ---------------------------------------------------------------- fuentes
def equipos_football_data():
    """Clubes con escudo + su plantilla 'oficial' (para el nombre largo del jugador)."""
    destino = os.path.join(CACHE, 'fd_teams.json')
    if not FD_TOKEN and not (os.path.exists(destino) and os.path.getsize(destino) > 1000):
        raise SystemExit('Falta el token de football-data.org. Definelo antes de ejecutar:\n'
                         '  PowerShell: $env:FALM_FD_TOKEN = "<token>"\n'
                         '  bash:       export FALM_FD_TOKEN=<token>')
    d = json.loads(get('https://api.football-data.org/v4/competitions/PD/teams?season=2026',
                       destino, {'X-Auth-Token': FD_TOKEN}).decode('utf-8'))
    out = {}
    for t in d['teams']:
        out[t['name']] = {
            'ext_id': t['id'], 'nombre': t['name'], 'tla': t.get('tla'), 'escudo': t.get('crest'),
            'jugadores': [{'nombre': p['name'], 'posicion': POS_FD.get(p.get('position'))}
                          for p in (t.get('squad') or [])],
        }
    return out


BLOQUE = re.compile(r'<div class="overflow-hidden elemento wjugador.*?</div>\s*</div>\s*</div>', re.S)


def plantilla_futbolfantasy(slug):
    """Plantilla completa del club tal y como la publica futbolfantasy."""
    raw = get('https://www.futbolfantasy.com/laliga/equipos/%s/plantilla' % slug,
              os.path.join(CACHE, 'ff_%s.html' % slug)).decode('utf-8', 'replace')
    out, vistos = [], set()
    for b in BLOQUE.findall(raw):
        m_nom = re.search(r'class="jugador">\s*([^<]+)</a>', b)
        m_slug = re.search(r'/jugadores/([a-z0-9\-]+)"', b)
        if not m_nom or not m_slug:
            continue
        texto = html.unescape(m_nom.group(1)).strip()
        m_dor = re.match(r'^(\d+)\.\s*(.+)$', texto)
        dorsal, nombre = (int(m_dor.group(1)), m_dor.group(2)) if m_dor else (None, texto)
        m_foto = re.search(r'(https://media\.futbolfantasy\.com/thumb/150x150/[^"\']+/(\d+)\.png)', b)
        m_pos = re.search(r'class="posicion">([^<]+)<', b)
        pos = POS_FF.get(html.unescape(m_pos.group(1)).strip() if m_pos else '')
        if not pos or m_slug.group(1) in vistos:      # sin posicion util (entrenador) o repetido
            continue
        vistos.add(m_slug.group(1))
        out.append({'slug': m_slug.group(1), 'nombre': nombre.strip(), 'dorsal': dorsal,
                    'posicion': pos, 'foto': m_foto.group(1) if m_foto else None,
                    'ext_id': int(m_foto.group(2)) if m_foto else None})
    return out


# ---------------------------------------------------------------- catalogo
def catalogo():
    """[{club..., jugadores:[...]}] con futbolfantasy de maestro."""
    fd = equipos_football_data()
    equipos = []
    for slug, nombre_fd in sorted(SLUG_FF.items(), key=lambda kv: kv[1]):
        club = fd[nombre_fd]
        jugadores = plantilla_futbolfantasy(slug)
        libres = list(club['jugadores'])
        for j in jugadores:
            # nombre largo de football-data, solo si identifica al mismo jugador
            best, bs = None, 0.0
            for i, c in enumerate(libres):
                if c is None:
                    continue
                s = score(j['nombre'], c['nombre'])
                if s > bs:
                    best, bs = i, s
            if best is not None and bs >= 0.75:
                j['nombre_largo'] = libres[best]['nombre']
                j['posicion_fd'] = libres[best]['posicion']
                j['confianza'] = round(bs, 2)
                libres[best] = None
            else:
                j['nombre_largo'] = ''
                j['posicion_fd'] = ''
                j['confianza'] = ''

        # primer equipo: aparece en la plantilla de football-data, o lleva un dorsal que
        # no tenga ya un jugador identificado alli (los del filial repiten dorsales bajos:
        # el 1 del Castilla no es el 1 del Madrid)
        dorsales_fd = {j['dorsal'] for j in jugadores if j['nombre_largo'] and j['dorsal']}
        for j in jugadores:
            j['primer_equipo'] = bool(j['nombre_largo']) or (
                bool(j['dorsal']) and j['dorsal'] not in dorsales_fd)
        equipos.append(dict(club, slug_ff=slug, jugadores=jugadores))
    return equipos


# ---------------------------------------------------------------- salida
def generar_sql(equipos, ruta):
    L = []
    A = L.append
    total = sum(len(e['jugadores']) for e in equipos)
    con_foto = sum(1 for e in equipos for j in e['jugadores'] if j['foto'])
    con_dorsal = sum(1 for e in equipos for j in e['jugadores'] if j['dorsal'])
    primer = sum(1 for e in equipos for j in e['jugadores'] if j['primer_equipo'])

    A('-- Carga inicial del catalogo LFP - FALM V2 - temporada 2026/27')
    A('-- Generado por tools/carga_inicial.py')
    A('-- Jugadores, posicion, retrato y dorsal: futbolfantasy.com (la misma fuente que scrapea')
    A('-- falm.parsear_jornada_ff, para que falm._casa_nombre empareje por nombre).')
    A('-- Clubes, escudos y ext_id de club: football-data.org.')
    A('-- %d equipos, %d jugadores (%d con retrato, %d con dorsal),' % (len(equipos), total, con_foto, con_dorsal))
    A('-- %d activos JUGADOR + %d porterias virtuales. primer_equipo=true en %d.'
      % (total, len(equipos), primer))
    A('-- CONSERVA: temporada, jornada_lfp, mapeo_jornada, jornada_falm, enfrentamiento,')
    A('--           competicion, equipo_falm y usuario_perfil.')
    A('')
    A('begin;')
    A('')
    A('-- 1. limpieza del estado de prueba (orden de dependencia)')
    for t in LIMPIEZA:
        A('delete from falm.%s;' % t)
    A('')
    A('-- 2. equipos LFP (football-data)')
    A('insert into falm.equipo_lfp (id, ext_id, nombre, tla, escudo) values')
    A(',\n'.join('  (%s, %d, %s, %s, %s)' % (q(uid('eqlfp:%d' % e['ext_id'])), e['ext_id'],
                                             q(e['nombre']), q(e['tla']), q(e['escudo']))
                 for e in equipos) + ';')
    A('')
    A('-- 3. dos columnas nuevas para poder distinguir el primer equipo del filial')
    A('--    (futbolfantasy lista tambien canteranos: se cargan para que el scrape de puntos')
    A('--    siempre empareje, pero el mercado puede filtrarlos por primer_equipo).')
    A('alter table falm.jugador_lfp add column if not exists dorsal integer;')
    A('alter table falm.jugador_lfp add column if not exists primer_equipo boolean not null default false;')
    A('')
    A('-- 4. jugadores LFP (futbolfantasy). nombre = como lo escribe futbolfantasy;')
    A('--    nombre_busqueda = nombre largo de football-data cuando se le identifica.')
    A('insert into falm.jugador_lfp (id, ext_id, nombre, apellido, nombre_busqueda, posicion, equipo_lfp_id, foto, dorsal, primer_equipo) values')
    filas = []
    for e in equipos:
        for j in e['jugadores']:
            filas.append('  (%s, %s, %s, null, %s, %s::falm.posicion, %s, %s, %s, %s)' % (
                q(uid('juglfp:ff:' + j['slug'])),
                j['ext_id'] if j['ext_id'] else 'null',
                q(j['nombre']), q(j['nombre_largo'] or j['nombre']), q(j['posicion']),
                q(uid('eqlfp:%d' % e['ext_id'])), q(j['foto']),
                j['dorsal'] if j['dorsal'] else 'null',
                'true' if j['primer_equipo'] else 'false'))
    A(',\n'.join(filas) + ';')
    A('')
    A('-- 5. activos: se derivan del catalogo -> ningun jugador puede quedarse sin activo.')
    A('--    Precio por posicion, el mismo que aplica falm.refrescar_catalogo_lfp.')
    A("insert into falm.activo (id, tipo, jugador_lfp_id, precio_mercado)\n"
      "select extensions.uuid_generate_v5('%s'::uuid, 'activo:'||jl.id::text), 'JUGADOR', jl.id,\n"
      "       case jl.posicion when 'PORTERO' then %s when 'DEFENSA' then %s"
      " when 'MEDIO' then %s else %s end\n"
      "from falm.jugador_lfp jl;" % (NS, PRECIO['PORTERO'], PRECIO['DEFENSA'],
                                     PRECIO['MEDIO'], PRECIO['DELANTERO']))
    A('')
    A('-- 6. porterias virtuales: un activo DEFENSA por club')
    A("insert into falm.activo (id, tipo, equipo_lfp_id, precio_mercado)\n"
      "select extensions.uuid_generate_v5('%s'::uuid, 'pv:'||el.ext_id::text), 'DEFENSA', el.id, %s\n"
      "from falm.equipo_lfp el;" % (NS, PRECIO_PORTERIA))
    A('')
    A('-- 7. el scrape de puntos de la 2026/27 vive en /laliga/puntos/2027/... (año de cierre)')
    A('update falm.temporada set anio_scrape = 2027 where anio_inicio = 2026;')
    A('')
    A('-- 8. verificacion (debe devolver 20 / %d / %d / 20 / 0 / 0 / %d)' % (total, total, primer))
    A("""select (select count(*) from falm.equipo_lfp)                              as equipos,
       (select count(*) from falm.jugador_lfp)                             as jugadores,
       (select count(*) from falm.activo where tipo='JUGADOR')             as activos_jugador,
       (select count(*) from falm.activo where tipo='DEFENSA')             as porterias,
       (select count(*) from falm.jugador_lfp where equipo_lfp_id is null) as sin_equipo,
       (select count(*) from falm.jugador_lfp jl
          where not exists (select 1 from falm.activo a where a.jugador_lfp_id = jl.id)) as sin_activo,
       (select count(*) from falm.jugador_lfp where primer_equipo)        as primer_equipo;""")
    A('')
    A('commit;')
    A('')
    open(ruta, 'w', encoding='utf-8').write('\n'.join(L))


def generar_control(equipos, ruta):
    with open(ruta, 'w', newline='', encoding='utf-8-sig') as f:
        w = csv.writer(f, delimiter=';')
        w.writerow(['equipo', 'jugador', 'posicion', 'dorsal', 'primer_equipo', 'retrato',
                    'nombre_largo_football_data', 'posicion_football_data', 'confianza_cruce',
                    'slug', 'ext_id', 'foto_url'])
        for e in equipos:
            for j in e['jugadores']:
                w.writerow([e['nombre'], j['nombre'], j['posicion'], j['dorsal'] or '',
                            'SI' if j['primer_equipo'] else 'NO', 'SI' if j['foto'] else 'NO',
                            j['nombre_largo'], j['posicion_fd'], j['confianza'], j['slug'],
                            j['ext_id'] or '', j['foto'] or ''])


def main():
    os.makedirs(OUT, exist_ok=True)
    equipos = catalogo()
    sql = os.path.join(OUT, 'carga_inicial_2026-27.sql')
    ctl = os.path.join(OUT, 'carga_inicial_control.csv')
    generar_sql(equipos, sql)
    generar_control(equipos, ctl)

    total = sum(len(e['jugadores']) for e in equipos)
    foto = sum(1 for e in equipos for j in e['jugadores'] if j['foto'])
    dorsal = sum(1 for e in equipos for j in e['jugadores'] if j['dorsal'])
    largo = sum(1 for e in equipos for j in e['jugadores'] if j['nombre_largo'])
    primer = sum(1 for e in equipos for j in e['jugadores'] if j['primer_equipo'])
    dif = [(e['nombre'], j['nombre'], j['posicion'], j['posicion_fd']) for e in equipos
           for j in e['jugadores'] if j['posicion_fd'] and j['posicion_fd'] != j['posicion']]
    print('SQL     :', sql)
    print('control :', ctl)
    print('equipos : %d | jugadores: %d' % (len(equipos), total))
    print('retrato : %d (%.1f%%) | dorsal: %d | identificados en football-data: %d'
          % (foto, 100.0 * foto / total, dorsal, largo))
    print('primer equipo: %d  |  filial/canterano: %d' % (primer, total - primer))
    print('posiciones distintas a football-data: %d' % len(dif))
    for e in equipos:
        print('   %-32s %3d jugadores  (%d con retrato)'
              % (e['nombre'], len(e['jugadores']), sum(1 for j in e['jugadores'] if j['foto'])))


if __name__ == '__main__':
    main()
