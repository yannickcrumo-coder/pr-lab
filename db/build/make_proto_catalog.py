#!/usr/bin/env python3
"""Mete el catálogo semilla dentro del prototipo de la web del coach.

El prototipo tenía una lista inventada de 32 nombres y el coach se dio cuenta:
al agregar un bloque de Hyrox no le salían las estaciones, y los benchmarks y
las sesiones de resistencia no aparecían por ningún lado.

Este guion lo genera desde `db/seed/`, que es la misma fuente de la migración
0002, para que el prototipo y la base no se separen. Se vuelve a correr así:

    python3 db/build/make_proto_catalog.py

Reemplaza lo que haya entre las dos marcas CATALOGO en design/web-coach.html.
"""
import json
import pathlib
import re

RAIZ = pathlib.Path(__file__).resolve().parents[2]
SEMILLA = RAIZ / "db" / "seed"
PROTO = RAIZ / "design" / "web-coach.html"

INICIO = "// <<< CATALOGO GENERADO · no editar a mano"
FIN = "// CATALOGO GENERADO >>>"


def leer(nombre):
    return json.loads((SEMILLA / f"{nombre}.json").read_text(encoding="utf-8"))


def js(valor):
    """JSON compacto y válido como literal de JavaScript."""
    return json.dumps(valor, ensure_ascii=False, separators=(",", ":"))


def construir():
    ejercicios = leer("exercises")
    benchmarks = leer("benchmarks")
    resistencia = leer("endurance_sessions")
    carrera = leer("hyrox_race")

    # Solo lo que el prototipo necesita para buscar y pintar: el resto vive en
    # la base y lo trae la API.
    ejs = [
        {
            "n": e["name_es"],
            "d": e.get("disciplines") or [],
            "p": e.get("pattern") or "",
            "q": e.get("equipment") or [],
            "m": e.get("metrics") or ["reps"],
            "a": e.get("aliases_es") or [],
        }
        for e in ejercicios
        if e.get("status", "activo") == "activo"
    ]
    ejs.sort(key=lambda x: x["n"])

    bms = [
        {
            "n": b["name"],
            "f": b.get("format", ""),
            "e": b.get("scheme") or "",
            "t": b.get("time_cap_s") or 0,
            "mv": [m["exercise"] for m in b.get("movements", [])],
        }
        for b in benchmarks
    ]

    res = [
        {
            "n": r["name_es"],
            "d": r.get("discipline", ""),
            "i": r.get("intensity", ""),
            "x": r.get("description_es", ""),
        }
        for r in resistencia
    ]

    # Las estaciones salen de la secuencia oficial de la carrera: ahí están en
    # orden y con el trabajo de cada una.
    est = [
        {
            "o": s["order"],
            "n": s["work"],
            "run": s.get("run_m", 0),
            "slug": s.get("station", ""),
        }
        for s in sorted(carrera["sequence"], key=lambda s: s["order"])
    ]

    return "\n".join(
        [
            INICIO,
            "// Sale de db/seed/, la misma fuente de la migración 0002.",
            "// Se regenera con: python3 db/build/make_proto_catalog.py",
            f"const EJERCICIOS = {js(ejs)};",
            f"const BENCHMARKS = {js(bms)};",
            f"const RESISTENCIA = {js(res)};",
            f"const ESTACIONES = {js(est)};",
            f"const HYROX_KM = {js(carrera.get('total_run_km', 8))};",
            FIN,
        ]
    )


def main():
    html = PROTO.read_text(encoding="utf-8")
    bloque = construir()

    if INICIO in html:
        html = re.sub(
            re.escape(INICIO) + r".*?" + re.escape(FIN), bloque, html, flags=re.S
        )
    else:
        ancla = "// ---------- datos ----------"
        html = html.replace(ancla, f"{ancla}\n{bloque}", 1)

    PROTO.write_text(html, encoding="utf-8")

    cuentas = {
        linea.split(" = ")[0].replace("const ", ""): linea.count("},{") + 1
        for linea in bloque.splitlines()
        if linea.startswith("const ") and "[" in linea
    }
    print("catálogo metido en el prototipo:", cuentas)


if __name__ == "__main__":
    main()
