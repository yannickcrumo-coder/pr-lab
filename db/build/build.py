"""Construye y valida los archivos semilla de PR-LAB."""
import csv
import json
import os
import sys
from collections import Counter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from common import (DISCIPLINES, EQUIPMENT, LEVELS, METRICS, MUSCLES, PATTERNS)
from data_fuerza import FUERZA
from data_resistencia import RESISTENCIA
from data_formatos import (BENCHMARKS, ENDURANCE_SESSIONS, EXAMPLE_WODS,
                           HEAT_TEMPLATES, HYROX_RACE, WOD_FORMATS)

ROOT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "seed")
os.makedirs(ROOT, exist_ok=True)

EXERCISES = FUERZA + RESISTENCIA
errors = []

# --- Validación -------------------------------------------------------------
slugs = [e["slug"] for e in EXERCISES]
for slug, n in Counter(slugs).items():
    if n > 1:
        errors.append(f"slug duplicado: {slug} ({n} veces)")

known_equipment = {e["slug"] for e in EQUIPMENT}
known_muscles = {m["slug"] for m in MUSCLES}
known_disciplines = {d["slug"] for d in DISCIPLINES}
slugset = set(slugs)

for e in EXERCISES:
    if e["pattern"] not in PATTERNS:
        errors.append(f"{e['slug']}: patrón desconocido {e['pattern']}")
    if e["level"] not in LEVELS:
        errors.append(f"{e['slug']}: nivel desconocido {e['level']}")
    for m in e["metrics"]:
        if m not in METRICS:
            errors.append(f"{e['slug']}: métrica desconocida {m}")
    for d in e["disciplines"]:
        if d not in known_disciplines:
            errors.append(f"{e['slug']}: disciplina desconocida {d}")
    for q in e["equipment"]:
        if q not in known_equipment:
            errors.append(f"{e['slug']}: equipo desconocido {q}")
    for mu in e["primary_muscles"] + e["secondary_muscles"]:
        if mu not in known_muscles:
            errors.append(f"{e['slug']}: músculo desconocido {mu}")
    for ref in e["scaling_easier"] + e["scaling_harder"]:
        if ref not in slugset:
            errors.append(f"{e['slug']}: escalamiento apunta a un slug inexistente {ref}")
    if not e["primary_muscles"]:
        errors.append(f"{e['slug']}: sin músculo principal")

for b in BENCHMARKS:
    for mv in b["movements"]:
        if mv["exercise"] not in slugset:
            errors.append(f"benchmark {b['slug']}: ejercicio inexistente {mv['exercise']}")

for st in HYROX_RACE["sequence"]:
    if st["station"] not in slugset:
        errors.append(f"hyrox: estación inexistente {st['station']}")

known_formats = {f["slug"] for f in WOD_FORMATS}
for w in EXAMPLE_WODS:
    if w["format"] not in known_formats:
        errors.append(f"plantilla {w['slug']}: formato inexistente {w['format']}")
    for sg in w["segments"]:
        if sg.get("exercise") and sg["exercise"] not in slugset:
            errors.append(f"plantilla {w['slug']}: ejercicio inexistente {sg['exercise']}")

if errors:
    print("ERRORES DE VALIDACIÓN:")
    for err in errors:
        print(" -", err)
    sys.exit(1)

# --- Escritura --------------------------------------------------------------
def dump(name, obj):
    path = os.path.join(ROOT, name)
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(obj, fh, ensure_ascii=False, indent=2)
    return path


dump("exercises.json", EXERCISES)
dump("disciplines.json", DISCIPLINES)
dump("equipment.json", EQUIPMENT)
dump("muscles.json", MUSCLES)
dump("wod_formats.json", WOD_FORMATS)
dump("heat_templates.json", HEAT_TEMPLATES)
dump("benchmarks.json", BENCHMARKS)
dump("hyrox_race.json", HYROX_RACE)
dump("endurance_sessions.json", ENDURANCE_SESSIONS)
dump("example_wods.json", EXAMPLE_WODS)
dump("vocabularies.json", {"patterns": PATTERNS, "metrics": METRICS, "levels": LEVELS})

# CSV plano para revisión humana
csv_path = os.path.join(ROOT, "exercises.csv")
with open(csv_path, "w", encoding="utf-8", newline="") as fh:
    w = csv.writer(fh)
    w.writerow(["slug", "nombre_es", "nombre_en", "patron", "disciplinas",
                "musculos_principales", "equipo", "metricas", "nivel",
                "unilateral", "1rm", "cue_es"])
    for e in EXERCISES:
        w.writerow([e["slug"], e["name_es"], e["name_en"], e["pattern"],
                    "|".join(e["disciplines"]), "|".join(e["primary_muscles"]),
                    "|".join(e["equipment"]), "|".join(e["metrics"]), e["level"],
                    "sí" if e["unilateral"] else "no",
                    "sí" if e["tracks_one_rep_max"] else "no", e["cue_es"]])

# --- Resumen ----------------------------------------------------------------
print(f"Ejercicios: {len(EXERCISES)}")
by_disc = Counter()
for e in EXERCISES:
    for d in e["disciplines"]:
        by_disc[d] += 1
print("Por disciplina:", dict(by_disc))
print("Por patrón:", dict(Counter(e["pattern"] for e in EXERCISES)))
print("Por nivel:", dict(Counter(e["level"] for e in EXERCISES)))
print(f"Con 1RM: {sum(1 for e in EXERCISES if e['tracks_one_rep_max'])}")
print(f"Con cue: {sum(1 for e in EXERCISES if e['cue_es'])}")
print(f"Formatos de WOD: {len(WOD_FORMATS)} | Heats: {len(HEAT_TEMPLATES)} | "
      f"Benchmarks: {len(BENCHMARKS)} | Sesiones de resistencia: {len(ENDURANCE_SESSIONS)}")
print("Validación: sin errores")
