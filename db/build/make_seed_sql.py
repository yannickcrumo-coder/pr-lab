"""Genera 0002_seed_reference.sql a partir del catálogo semilla en JSON."""
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(os.path.dirname(HERE), "seed")
OUT = os.path.join(os.path.dirname(HERE), "migrations", "0002_seed_reference.sql")


def load(name):
    with open(os.path.join(DATA, name), encoding="utf-8") as fh:
        return json.load(fh)


def q(v):
    """Literal SQL."""
    if v is None:
        return "NULL"
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, (int, float)):
        return str(v)
    return "'" + str(v).replace("'", "''") + "'"


def arr(items):
    if not items:
        return "'{}'"
    return "ARRAY[" + ",".join(q(i) for i in items) + "]::text[]"


lines = [
    "-- =====================================================================",
    "-- PR-LAB · 0002_seed_reference.sql",
    "-- Datos de referencia y catálogo público de ejercicios.",
    "-- Generado por build/make_seed_sql.py — no editar a mano.",
    "-- Es idempotente: se puede volver a correr sin duplicar.",
    "-- =====================================================================",
    "",
]

# --- disciplinas ------------------------------------------------------
lines.append("INSERT INTO disciplines (slug, name_es, name_en, position) VALUES")
rows = [f"  ({q(d['slug'])}, {q(d['name_es'])}, {q(d['name_en'])}, {i})"
        for i, d in enumerate(load("disciplines.json"))]
lines.append(",\n".join(rows))
lines.append("ON CONFLICT (slug) DO UPDATE SET name_es = EXCLUDED.name_es;\n")

# --- equipo -----------------------------------------------------------
lines.append("INSERT INTO equipment (slug, name_es) VALUES")
rows = [f"  ({q(e['slug'])}, {q(e['name_es'])})" for e in load("equipment.json")]
lines.append(",\n".join(rows))
lines.append("ON CONFLICT (slug) DO UPDATE SET name_es = EXCLUDED.name_es;\n")

# --- músculos ---------------------------------------------------------
lines.append("INSERT INTO muscles (slug, name_es, muscle_group) VALUES")
rows = [f"  ({q(m['slug'])}, {q(m['name_es'])}, {q(m['group'])})"
        for m in load("muscles.json")]
lines.append(",\n".join(rows))
lines.append("ON CONFLICT (slug) DO UPDATE SET name_es = EXCLUDED.name_es;\n")

# --- tipos de bloque --------------------------------------------------
BLOCK_TYPES = [
    ("calentamiento", "Calentamiento", "preparación", "ejercicios"),
    ("fuerza", "Fuerza", "fuerza", "ejercicios"),
    ("wod", "WOD / Metcon", "metcon", "ejercicios"),
    ("cardio", "Cardio", "cardio", "ejercicios"),
    ("hyrox", "Estaciones Hyrox", "hyrox", "ejercicios"),
    ("tecnica", "Técnica", "técnica", "ejercicios"),
    ("accesorio", "Accesorio", "accesorio", "ejercicios"),
    ("enfriamiento", "Enfriamiento", "cierre", "ejercicios"),
    ("white_board", "White Board", "texto libre", "texto"),
]
lines.append("INSERT INTO block_types (slug, name_es, tag_es, kind, position) VALUES")
rows = [f"  ({q(s)}, {q(n)}, {q(t)}, {q(k)}, {i})"
        for i, (s, n, t, k) in enumerate(BLOCK_TYPES)]
lines.append(",\n".join(rows))
lines.append("ON CONFLICT (slug) DO UPDATE SET name_es = EXCLUDED.name_es;\n")

# --- formatos de WOD --------------------------------------------------
lines.append("INSERT INTO wod_formats (slug, name_es, description_es, score_type,"
             " lower_is_better, fields, athlete_logs) VALUES")
rows = []
for f in load("wod_formats.json"):
    rows.append(
        f"  ({q(f['slug'])}, {q(f['name_es'])}, {q(f['description_es'])},"
        f" {q(f['score_type'])}, {q(f['lower_is_better'])},"
        f" {q(json.dumps(f['fields'], ensure_ascii=False))}::jsonb,"
        f" {q(json.dumps(f['athlete_logs'], ensure_ascii=False))}::jsonb)")
lines.append(",\n".join(rows))
lines.append("ON CONFLICT (slug) DO UPDATE SET name_es = EXCLUDED.name_es;\n")

# --- ejercicios del catálogo público ----------------------------------
exercises = load("exercises.json")
lines.append("INSERT INTO exercises (slug, name_es, name_en, aliases_es, disciplines,"
             " pattern, primary_muscles, secondary_muscles, equipment, metrics,"
             " unilateral, level, tracks_one_rep_max, cue_es, is_public, source) VALUES")
rows = []
for e in exercises:
    rows.append(
        f"  ({q(e['slug'])}, {q(e['name_es'])}, {q(e['name_en'])},"
        f" {arr(e['aliases_es'])}, {arr(e['disciplines'])}, {q(e['pattern'])},"
        f" {arr(e['primary_muscles'])}, {arr(e['secondary_muscles'])},"
        f" {arr(e['equipment'])}, {arr(e['metrics'])}, {q(e['unilateral'])},"
        f" {q(e['level'])}, {q(e['tracks_one_rep_max'])}, {q(e['cue_es'] or None)},"
        f" true, 'seed')")
lines.append(",\n".join(rows))
lines.append("ON CONFLICT (slug) WHERE is_public DO UPDATE SET"
             " name_es = EXCLUDED.name_es, cue_es = EXCLUDED.cue_es,"
             " metrics = EXCLUDED.metrics;\n")

# --- escalamientos ----------------------------------------------------
pairs = []
for e in exercises:
    for t in e["scaling_easier"]:
        pairs.append((e["slug"], t, "mas_facil"))
    for t in e["scaling_harder"]:
        pairs.append((e["slug"], t, "mas_dificil"))
if pairs:
    lines.append("INSERT INTO exercise_scalings (exercise_id, target_id, direction)")
    lines.append("SELECT a.id, b.id, v.direction FROM (VALUES")
    lines.append(",\n".join(
        f"  ({q(s)}, {q(t)}, {q(d)})" for s, t, d in pairs))
    lines.append(") AS v(src, tgt, direction)")
    lines.append("JOIN exercises a ON a.slug = v.src AND a.is_public")
    lines.append("JOIN exercises b ON b.slug = v.tgt AND b.is_public")
    lines.append("ON CONFLICT DO NOTHING;\n")

with open(OUT, "w", encoding="utf-8") as fh:
    fh.write("\n".join(lines))

print(f"escrito: {OUT}")
print(f"  disciplinas: {len(load('disciplines.json'))}, equipo: {len(load('equipment.json'))},"
      f" músculos: {len(load('muscles.json'))}")
print(f"  tipos de bloque: {len(BLOCK_TYPES)}, formatos: {len(load('wod_formats.json'))}")
print(f"  ejercicios: {len(exercises)}, escalamientos: {len(pairs)}")
