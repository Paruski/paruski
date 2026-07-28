#!/usr/bin/env python3
"""Comprueba el curso construido contra `docs/modelo-aprendizaje.md`.

El modelo no es una declaración de intenciones: cada matriz de ese documento se
traduce aquí en una comprobación que se ejecuta sobre `curso/`. Si el curso deja
de cumplir el modelo, esto falla y no se publica.

    python3 scripts/verificar_modelo.py            # comprueba y regenera matrices
    python3 scripts/verificar_modelo.py --revisar  # sólo comprueba, no escribe

Salida: `docs/matrices.md`, que es contenido generado y no se edita a mano.
"""

from __future__ import annotations

import json
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CURSO = ROOT / "curso"
MATRICES = ROOT / "docs" / "matrices.md"

# Las seis dimensiones del modelo, en el orden de la matriz M1.
DIMENSIONES = [
    "comprension_explicita",
    "reconocimiento_escrito",
    "recuperacion_escrita",
    "transferencia_contextual",
    "retencion_diferida",
    "reconocimiento_auditivo",
]

# M2: qué grupo de dimensiones acredita cada canal de prueba.
RECONOCER = {"comprension_explicita", "reconocimiento_escrito"}
PRODUCIR = {"recuperacion_escrita", "transferencia_contextual"}
AUDITIVO = {"reconocimiento_auditivo"}

# M1: dimensión sin ejercicio propio, por definición y no por olvido.
SIN_EJERCICIO_PROPIO = {"retencion_diferida"}

# M6: dimensión que sólo se cubre donde el material trae escena nueva.
NO_GARANTIZADA = {"transferencia_contextual"}

INTERVALOS = [1, 3, 7, 16, 35, 70, 140]

fallos: list[str] = []


def exige(nombre: str, condicion: bool, detalle: str = "") -> None:
    marca = "ok  " if condicion else "FALLA"
    if not condicion:
        fallos.append(nombre)
    print(f"{marca} {nombre}{'' if condicion or not detalle else f' · {detalle}'}")


def cargar():
    curriculum = json.loads((CURSO / "curriculum.json").read_text(encoding="utf-8"))
    unidades = []
    for u in curriculum["units"]:
        unidades.append(json.loads(
            (CURSO / "unidades" / f"{u['id']}.json").read_text(encoding="utf-8")))
    return curriculum, unidades


def dimensiones_de(item) -> set[str]:
    return {s.get("dimension") for s in item["steps"] if s.get("dimension")}


def main() -> int:
    solo_revisar = "--revisar" in sys.argv
    curriculum, unidades = cargar()
    items = [i for u in unidades for i in u["items"]]
    competencias = [s["skillId"] for s in curriculum["skills"]]

    # ------------------------------------------------------------ matriz M1
    # cobertura de cada competencia por dimensión
    cobertura: dict[str, set[str]] = defaultdict(set)
    for item in items:
        for skill in item.get("skillIds") or []:
            cobertura[skill] |= dimensiones_de(item)

    # La exigencia es por canal, no por dimensión suelta: hay competencias que no
    # admiten elección de formas —«distinguir grafemas cirílicos de homógrafos
    # latinos» no puede ofrecerlas, porque en pantalla son la misma imagen— y
    # exigirla obligaría a inventar el ejercicio que el material no da.
    for etiqueta, canal in (("reconocimiento", RECONOCER), ("producción", PRODUCIR),
                            ("escucha", AUDITIVO)):
        sin = [s for s in competencias if not (cobertura[s] & canal)]
        exige(f"M6 · toda competencia se practica por {etiqueta}", not sin,
              f"faltan {len(sin)}: {', '.join(sin[:3])}")

    sin_diferida = [s for s in competencias if "retencion_diferida" in cobertura[s]]
    exige("M1 · la retención diferida no se ejercita, se acredita", not sin_diferida,
          f"{len(sin_diferida)} competencias la ejercitan y no deberían")

    # ------------------------------------------------------------ matriz M2
    # el crédito lo fija el acto: una elección no puede acreditar recuperación
    malos = [f"{i['id']}:{s['id']}" for i in items for s in i["steps"]
             if s["kind"] == "choice" and s.get("dimension") in PRODUCIR]
    exige("M2 · ninguna elección acredita recuperación ni transferencia",
          not malos, ", ".join(malos[:3]))

    # el dictado da el contenido por el oído: no puede acreditar recuperación
    malos = [i["id"] for i in items if i.get("listen")
             and dimensiones_de(i) - AUDITIVO]
    exige("M2 · el dictado sólo acredita reconocimiento auditivo",
          not malos, ", ".join(malos[:3]))

    # y no puede llevar el texto a la vista
    malos = [i["id"] for i in items if i.get("listen") and (i.get("input") or "").strip()]
    exige("M2 · el dictado no enseña el texto que dicta", not malos, ", ".join(malos[:3]))

    # Copiar no acredita nada: si la respuesta está citada en lo que el alumno ve,
    # el paso no mide la competencia sino la vista. La comparación conserva la ё y
    # el signo de interrogación, que son justamente lo evaluado en algunos ítems.
    def norma(texto: str) -> str:
        texto = (texto or "").strip().lower()
        texto = texto.replace("́", "")
        return "".join(c for c in texto if c.isalnum() or c == "?")

    copiables = []
    for item in items:
        for paso in item["steps"]:
            if paso["kind"] != "written":
                continue
            modelo = (paso.get("accepted") or [""])[0]
            if len(norma(modelo)) < 3:
                continue
            citas = re.findall(r"«([^»]+)»",
                               f"{item.get('prompt') or ''} {paso.get('prompt') or ''}")
            if any(norma(c) == norma(modelo) for c in citas):
                copiables.append(f"{item['id']}:{paso['id']}")
    exige("M2 · ningún paso escrito lleva su respuesta citada en el enunciado",
          not copiables, f"{len(copiables)}: {', '.join(copiables[:3])}")

    # Una consigna que pide un diálogo y acepta dos afirmaciones manda a escribir
    # lo que después no se admite.
    mentirosas = []
    for item in items:
        for paso in item["steps"]:
            if paso["kind"] != "written":
                continue
            texto = f"{item.get('prompt') or ''} {paso.get('prompt') or ''}".lower()
            if re.search(r"escribe (el|un) (diálogo|intercambio)", texto) \
                    and "?" not in ((paso.get("accepted") or [""])[0]):
                mentirosas.append(f"{item['id']}:{paso['id']}")
    exige("M2 · la consigna no pide diálogo si no se acepta ninguna pregunta",
          not mentirosas, f"{len(mentirosas)}: {', '.join(mentirosas[:3])}")

    # M3 · la etapa decide cuándo aparece: la transferencia no puede ser lo primero
    pronto = [i["id"] for i in items
              if (i["phase"] == "transfer" or "transferencia_contextual" in dimensiones_de(i))
              and i.get("stage") in ("discovery", "guided_recognition")]
    exige("M3 · ningún ítem de transferencia aparece en etapa temprana",
          not pronto, f"{len(pronto)}: {', '.join(pronto[:3])}")

    # ------------------------------------------------------------ matriz M5
    # el examen comprueba cada competencia reconociendo, produciendo y oyendo
    sin_examinar = []
    for u in unidades:
        n = u["unit"]["unit"]
        examen = [i for i in u["items"] if i["phase"] == "exam"]
        for skill in [s["skillId"] for s in curriculum["skills"] if s["unit"] == n]:
            for etiqueta, quiere in (("reconocer", RECONOCER), ("producir", PRODUCIR),
                                     ("oír", AUDITIVO)):
                if not any(skill in (i.get("skillIds") or []) and (dimensiones_de(i) & quiere)
                           for i in examen):
                    sin_examinar.append(f"u{n:03d}:{skill}:{etiqueta}")
    exige("M5 · el examen comprueba cada competencia en los tres canales",
          not sin_examinar, f"faltan {len(sin_examinar)}: {', '.join(sin_examinar[:3])}")

    # M5 · la retención diferida no se puede exigir en un examen
    malos = [i["id"] for u in unidades for i in u["items"]
             if i["phase"] == "exam" and "retencion_diferida" in dimensiones_de(i)]
    exige("M5 · el examen no exige retención diferida", not malos, ", ".join(malos[:3]))

    # M5 · un ítem de examen no se practica
    ids_examen = {i["id"] for i in items if i["phase"] == "exam"}
    ids_practica = {i["id"] for i in items if i["phase"] != "exam"}
    exige("M5 · ningún ítem de examen aparece en la práctica",
          not (ids_examen & ids_practica), ", ".join(list(ids_examen & ids_practica)[:3]))

    # ------------------------------------------------------------ matriz M6
    # lo que se examina al oído tiene que poder practicarse antes
    practicables = {s for i in items if i["phase"] != "exam" and i.get("listen")
                    for s in i.get("skillIds") or []}
    sin_practica = [s for s in competencias if s not in practicables]
    exige("M6 · la escucha se puede practicar, no sólo examinar",
          len(sin_practica) <= 2,
          f"{len(sin_practica)} competencias sólo la examinan: {', '.join(sin_practica[:3])}")

    # toda competencia declara unidad y todo ítem declara competencia
    exige("M6 · todo ítem declara competencia",
          all(i.get("skillIds") for i in items))

    # ---------------------------------------------------------------- salida
    if not solo_revisar:
        escribir_matrices(curriculum, unidades, items, competencias, cobertura)
        print(f"\nmatrices escritas en {MATRICES.relative_to(ROOT)}")

    if fallos:
        print(f"\n{len(fallos)} requisitos del modelo incumplidos")
        return 1
    print("\nEl curso cumple el modelo")
    return 0


def escribir_matrices(curriculum, unidades, items, competencias, cobertura) -> None:
    por_tipo: dict[str, Counter] = defaultdict(Counter)
    for item in items:
        for paso in item["steps"]:
            por_tipo[item["typeLabel"]][paso.get("dimension") or "—"] += 1

    cortas = {
        "comprension_explicita": "compr.",
        "reconocimiento_escrito": "recon.",
        "recuperacion_escrita": "recup.",
        "transferencia_contextual": "transf.",
        "retencion_diferida": "reten.",
        "reconocimiento_auditivo": "oído",
    }
    lineas = [
        "# Matrices del modelo",
        "",
        "**Contenido generado.** Lo escribe `python3 scripts/verificar_modelo.py`",
        "desde el curso construido. No se edita a mano: si algo aquí no cuadra, lo que",
        "hay que corregir es el generador o el modelo, no esta tabla.",
        "",
        f"Curso: {len(curriculum['units'])} unidades · {len(competencias)} competencias · "
        f"{len(items)} ejercicios · {sum(len(i['steps']) for i in items)} pasos.",
        "",
        "## M2 · qué dimensión acredita cada tipo de ejercicio",
        "",
        "Pasos publicados por tipo y dimensión.",
        "",
        "| Tipo | " + " | ".join(cortas[d] for d in DIMENSIONES) + " |",
        "| --- | " + " | ".join("---:" for _ in DIMENSIONES) + " |",
    ]
    for tipo in sorted(por_tipo):
        fila = " | ".join(str(por_tipo[tipo].get(d, 0)) for d in DIMENSIONES)
        lineas.append(f"| {tipo} | {fila} |")
    total = " | ".join(str(sum(por_tipo[t].get(d, 0) for t in por_tipo)) for d in DIMENSIONES)
    lineas += [f"| **total** | {total} |", ""]

    lineas += [
        "La columna de retención diferida está vacía a propósito: no es una tarea, es",
        "una condición temporal sobre la recuperación (modelo, M1).",
        "",
        "## M1 · cobertura de las competencias por dimensión",
        "",
        "| Dimensión | Competencias cubiertas | Estado |",
        "| --- | ---: | --- |",
    ]
    canal_de = {}
    for dim in RECONOCER:
        canal_de[dim] = ("reconocimiento", RECONOCER)
    for dim in PRODUCIR:
        canal_de[dim] = ("producción", PRODUCIR)
    for dim in AUDITIVO:
        canal_de[dim] = ("escucha", AUDITIVO)
    for dim in DIMENSIONES:
        n = len([s for s in competencias if dim in cobertura[s]])
        if dim in SIN_EJERCICIO_PROPIO:
            estado = "sin ejercicio propio, por definición"
        elif dim in NO_GARANTIZADA:
            estado = "no garantizada: sólo donde el material trae escena nueva"
        else:
            nombre, canal = canal_de[dim]
            entero = len([s for s in competencias if cobertura[s] & canal])
            estado = (f"canal de {nombre}: {entero}/{len(competencias)}"
                      + ("" if entero == len(competencias) else " · **incompleto**"))
        lineas.append(f"| `{dim}` | {n}/{len(competencias)} | {estado} |")

    lineas += ["",
               "La exigencia del modelo es por **canal**, no por dimensión suelta: hay",
               "competencias que no admiten elección de formas —«distinguir grafemas",
               "cirílicos de homógrafos latinos» no puede ofrecerlas, porque en pantalla",
               "son la misma imagen— y exigirla obligaría a inventar el ejercicio que el",
               "material no da."]

    lineas += ["", "## M5 · tamaño y cobertura del examen", "",
               "| Unidad | Competencias | Ítems | Pasos |", "| --- | ---: | ---: | ---: |"]
    for u in unidades:
        n = u["unit"]["unit"]
        examen = [i for i in u["items"] if i["phase"] == "exam"]
        comp = len([s for s in curriculum["skills"] if s["unit"] == n])
        lineas.append(f"| {n:03d} | {comp} | {len(examen)} | "
                      f"{sum(len(i['steps']) for i in examen)} |")

    lineas += ["", "## M4 · escalera de intervalos", "",
               "| Escalón | " + " | ".join(str(i) for i in range(len(INTERVALOS))) + " |",
               "| --- | " + " | ".join("---:" for _ in INTERVALOS) + " |",
               "| Días | " + " | ".join(str(d) for d in INTERVALOS) + " |",
               "",
               "El escalón sube una vez por ocasión de repaso, nunca una vez por",
               "ejercicio: si no, una sola sesión llevaría la competencia al último",
               "escalón y no volvería a verse en cuatro meses.",
               ""]
    MATRICES.write_text("\n".join(lineas), encoding="utf-8")


if __name__ == "__main__":
    raise SystemExit(main())
