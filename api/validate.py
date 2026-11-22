#!/usr/bin/env python3
"""Valida el contrato OpenAPI: que cargue, que las referencias resuelvan y
que toda operación tenga resumen y respuestas. Sale con código 1 si falla."""
import os
import re
import sys

import yaml

HERE = os.path.dirname(os.path.abspath(__file__))
SPEC = os.path.join(HERE, "openapi.yaml")


def main():
    raw = open(SPEC, encoding="utf-8").read()
    spec = yaml.safe_load(raw)
    fallas = []

    def resuelve(ref):
        nodo = spec
        for parte in ref.lstrip("#/").split("/"):
            if not isinstance(nodo, dict) or parte not in nodo:
                return False
            nodo = nodo[parte]
        return True

    refs = sorted(set(re.findall(r'"(#/[^"]+)"', raw)))
    for r in refs:
        if not resuelve(r):
            fallas.append(f"referencia rota: {r}")

    ops = 0
    for ruta, item in spec["paths"].items():
        for metodo, op in item.items():
            if metodo not in ("get", "post", "put", "patch", "delete"):
                continue
            ops += 1
            if not op.get("responses"):
                fallas.append(f"sin respuestas: {metodo.upper()} {ruta}")
            if not op.get("summary"):
                fallas.append(f"sin summary: {metodo.upper()} {ruta}")

    print(f"OpenAPI {spec['openapi']} · {spec['info']['title']} {spec['info']['version']}")
    print(f"  rutas: {len(spec['paths'])} · operaciones: {ops} · "
          f"esquemas: {len(spec['components']['schemas'])} · referencias: {len(refs)}")

    if fallas:
        print("\nFALLAS:")
        for f in fallas:
            print("  -", f)
        return 1
    print("  validación: sin errores")
    return 0


if __name__ == "__main__":
    sys.exit(main())
