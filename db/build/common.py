"""Helpers compartidos para construir el catálogo semilla de PR-LAB."""


def L(s):
    if isinstance(s, (list, tuple)):
        return list(s)
    return [p.strip() for p in str(s).split(",") if p.strip()]


def X(slug, es, en, pattern, primary, equipment, metrics="reps,load,rpe",
      disc="fuerza", sec="", level="intermedio", cue="", uni=False, bench=False,
      easier="", harder="", aliases=""):
    """Un ejercicio del catálogo."""
    return {
        "slug": slug,
        "name_es": es,
        "name_en": en,
        "aliases_es": L(aliases),
        "disciplines": L(disc),
        "pattern": pattern,
        "primary_muscles": L(primary),
        "secondary_muscles": L(sec),
        "equipment": L(equipment),
        "metrics": L(metrics),
        "unilateral": uni,
        "level": level,
        "tracks_one_rep_max": bench,
        "scaling_easier": L(easier),
        "scaling_harder": L(harder),
        "cue_es": cue,
        "video_url": None,
        # Catálogo predeterminado: visible para todos los coaches y sin dueño.
        # Un ejercicio creado por un coach lleva is_public=False y su owner_coach_id.
        "is_public": True,
        "owner_coach_id": None,
        "status": "activo",  # activo | archivado
        "source": "seed",
    }


# Vocabularios controlados -----------------------------------------------
PATTERNS = [
    "sentadilla", "bisagra", "zancada", "empuje_horizontal", "empuje_vertical",
    "jalon_horizontal", "jalon_vertical", "halterofilia", "acarreo", "core",
    "accesorio", "pliometrico", "gimnasticos", "monoestructural", "estacion_hyrox",
    "movilidad",
]

METRICS = [
    "reps", "load", "rpe", "tempo", "time", "distance", "calories", "height",
    "rounds", "pace", "power", "heart_rate", "rest",
]

LEVELS = ["principiante", "intermedio", "avanzado"]

DISCIPLINES = [
    {"slug": "fuerza", "name_es": "Fuerza", "name_en": "Strength",
     "default_metrics": ["reps", "load", "rpe"]},
    {"slug": "crossfit", "name_es": "CrossFit / fitness funcional", "name_en": "CrossFit",
     "default_metrics": ["time", "rounds", "reps", "load"]},
    {"slug": "hyrox", "name_es": "Hyrox", "name_en": "Hyrox",
     "default_metrics": ["time", "distance", "reps"]},
    {"slug": "correr", "name_es": "Correr", "name_en": "Running",
     "default_metrics": ["distance", "time", "pace", "heart_rate"]},
    {"slug": "ciclismo", "name_es": "Ciclismo", "name_en": "Cycling",
     "default_metrics": ["distance", "time", "power", "heart_rate"]},
    {"slug": "triatlon", "name_es": "Triatlón", "name_en": "Triathlon",
     "default_metrics": ["distance", "time", "pace", "power", "heart_rate"]},
]

EQUIPMENT = [
    {"slug": "ninguno", "name_es": "Sin equipo"},
    {"slug": "barra", "name_es": "Barra"},
    {"slug": "discos", "name_es": "Discos"},
    {"slug": "mancuernas", "name_es": "Mancuernas"},
    {"slug": "kettlebell", "name_es": "Kettlebell"},
    {"slug": "rack", "name_es": "Rack"},
    {"slug": "banco", "name_es": "Banco"},
    {"slug": "barra_dominadas", "name_es": "Barra de dominadas"},
    {"slug": "anillas", "name_es": "Anillas"},
    {"slug": "cajon", "name_es": "Cajón"},
    {"slug": "balon_medicinal", "name_es": "Balón medicinal"},
    {"slug": "wall_ball", "name_es": "Wall ball"},
    {"slug": "sandbag", "name_es": "Sandbag"},
    {"slug": "trineo", "name_es": "Trineo"},
    {"slug": "cuerda_trepar", "name_es": "Cuerda para trepar"},
    {"slug": "cuerda_saltar", "name_es": "Cuerda para saltar"},
    {"slug": "maquina", "name_es": "Máquina"},
    {"slug": "polea", "name_es": "Polea"},
    {"slug": "banda", "name_es": "Banda elástica"},
    {"slug": "ghd", "name_es": "GHD"},
    {"slug": "barra_hexagonal", "name_es": "Barra hexagonal"},
    {"slug": "landmine", "name_es": "Landmine"},
    {"slug": "ski_erg", "name_es": "SkiErg"},
    {"slug": "remo_erg", "name_es": "Remo ergómetro"},
    {"slug": "bike_erg", "name_es": "Bicicleta ergómetro"},
    {"slug": "assault_bike", "name_es": "Assault bike"},
    {"slug": "caminadora", "name_es": "Caminadora"},
    {"slug": "rueda_abdominal", "name_es": "Rueda abdominal"},
    {"slug": "paralelas", "name_es": "Paralelas"},
    {"slug": "barra_z", "name_es": "Barra Z"},
    {"slug": "agarres_granjero", "name_es": "Agarres de granjero"},
    {"slug": "alberca", "name_es": "Alberca"},
    {"slug": "bicicleta", "name_es": "Bicicleta"},
    {"slug": "slam_ball", "name_es": "Slam ball"},
    {"slug": "yoke", "name_es": "Yugo"},
]

MUSCLES = [
    {"slug": "cuadriceps", "name_es": "Cuádriceps", "group": "pierna"},
    {"slug": "isquiotibiales", "name_es": "Isquiotibiales", "group": "pierna"},
    {"slug": "gluteos", "name_es": "Glúteos", "group": "pierna"},
    {"slug": "aductores", "name_es": "Aductores", "group": "pierna"},
    {"slug": "abductores", "name_es": "Abductores", "group": "pierna"},
    {"slug": "gemelos", "name_es": "Gemelos", "group": "pierna"},
    {"slug": "erectores", "name_es": "Erectores espinales", "group": "espalda"},
    {"slug": "dorsales", "name_es": "Dorsales", "group": "espalda"},
    {"slug": "trapecios", "name_es": "Trapecios", "group": "espalda"},
    {"slug": "romboides", "name_es": "Romboides", "group": "espalda"},
    {"slug": "deltoide_anterior", "name_es": "Deltoide anterior", "group": "hombro"},
    {"slug": "deltoide_lateral", "name_es": "Deltoide lateral", "group": "hombro"},
    {"slug": "deltoide_posterior", "name_es": "Deltoide posterior", "group": "hombro"},
    {"slug": "pectorales", "name_es": "Pectorales", "group": "pecho"},
    {"slug": "biceps", "name_es": "Bíceps", "group": "brazo"},
    {"slug": "triceps", "name_es": "Tríceps", "group": "brazo"},
    {"slug": "antebrazos", "name_es": "Antebrazos", "group": "brazo"},
    {"slug": "abdominales", "name_es": "Abdominales", "group": "core"},
    {"slug": "oblicuos", "name_es": "Oblicuos", "group": "core"},
    {"slug": "flexores_cadera", "name_es": "Flexores de cadera", "group": "core"},
    {"slug": "serrato", "name_es": "Serrato", "group": "core"},
    {"slug": "cuerpo_completo", "name_es": "Cuerpo completo", "group": "general"},
    {"slug": "cardiovascular", "name_es": "Sistema cardiovascular", "group": "general"},
]
