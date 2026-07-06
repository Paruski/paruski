#!/usr/bin/env python3
"""Enrich Paruski's structured course content.

This is an offline maintenance script. It keeps the static web architecture:
the browser only consumes JSON, while this script updates lesson metadata,
frequency-scored vocabulary annotations and a large static exercise bank.
"""

from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[1]

LESSON_UPDATES = {
    37: ("Уметь, мочь, можно y нельзя", "Capacidad, permiso y prohibición con infinitivos útiles: saber hacer algo, poder, se puede y no se puede."),
    38: ("Causa y consecuencia", "почему, потому что y поэтому para explicar problemas cotidianos y justificar decisiones simples."),
    39: ("Adjetivos y concordancia básica", "Adjetivos frecuentes, género y número para describir personas, objetos y situaciones."),
    40: ("Comparación y superlativo", "самый, самая, самое y adjetivos frecuentes para expresar el más grande, profundo, interesante o bonito."),
    41: ("Preguntar y describir cualidades", "какой, какая, какое, какие; pelo, apariencia y semejanza con concordancia."),
    42: ("Pedir en un café", "Pedidos naturales con bebidas, postres, agua, sabores y adjetivos de comida."),
    43: ("Demostrativos y tal/cual", "этот, эта, это, эти y такой, такая, такое, такие en frases de identificación y descripción."),
    44: ("Todo, día y noche", "весь, вся, всё, все con expresiones de tiempo y actividades completas."),
    45: ("Salud y síntomas", "У меня болит..., temperatura, garganta, tos, médico, farmacia y medicina básica."),
    46: ("Necesidad y obligación", "должен, должна, должны, надо y нужно para deberes, planes y descansos."),
    47: ("Genitivo: ausencia y cantidad", "нет, много, мало, сколько y el genitivo como caso de ausencia o cantidad."),
    48: ("Genitivo de pertenencia", "у кого, у чего y posesión con personas, lugares y objetos cotidianos."),
    49: ("Formas posesivas personales", "мамин, папин, Наташин y Сашин frente a мой/моя y чей/чья."),
    50: ("Acusativo animado masculino", "Buscar, interpretar o ver a una persona/personaje con acusativo animado masculino."),
    51: ("Adjetivos en prepositivo", "в каком, в какой y concordancia de adjetivos en lugares e instituciones."),
    52: ("Siguiente y pasado", "следующий, прошлый, este mes, el mes pasado y planes próximos."),
    53: ("Origen: из y с", "откуда, из, с y lugares de procedencia: universidad, entrenamiento, ciudad o resort."),
    54: ("Origen y citas", "Clínica, dentista, reunión, despacho y genitivo tras у/из/с en contextos reales."),
    55: ("Números 1-4 y bebidas", "один, одна, одно; два/три/четыре con genitivo singular en pedidos y cantidades."),
    56: ("Mucho, poco y objetos", "много/мало con genitivo plural: libros, bolígrafos, niños, opciones y material de clase."),
    57: ("Horas y minutos", "час, часа, часов; минута, минуты, минут; cuarto, media hora y lugares disponibles."),
    58: ("Días, semanas, meses y años", "Duraciones y calendario con genitivo plural y preguntas de cantidad."),
    59: ("No hay / no hubo", "Ausencia con нет y не было: personas, lluvia, clase, sitio o tiempo."),
    60: ("Genitivo plural animado", "Personas, animales y grupos en genitivo plural con verbos y estructuras frecuentes."),
    61: ("Aspecto verbal: mapa general", "Diferencia central entre proceso, hecho general, repetición, resultado, inicio y final."),
    62: ("Imperfectivo: proceso y hábito", "Procesos, hechos generales y repeticiones en pasado, presente y futuro compuesto."),
    63: ("Perfectivo: formación y futuro", "Pares aspectuales frecuentes, prefijos, sufijos y futuro con forma perfectiva."),
    64: ("Perfectivo: cierre de proceso", "Finalizar, esperar, responder, cerrar, abrir y completar acciones en contexto."),
    65: ("Negación y aspecto", "Distinguir que una acción no ocurrió de que no llegó a completarse."),
    66: ("Cuando termine...", "как только, когда y subordinadas que piden una acción completada para continuar."),
    67: ("Resultado cuantificable", "Comprar, escribir, leer, preparar y medir resultados con сколько, много y мало."),
    68: ("Resultado visible", "Encontrar, romper, reparar, construir o perder algo cuando el resultado importa ahora."),
    69: ("Inicio y cambio de estado", "Empezar, enfermar, querer de repente, reír o llorar como cambios puntuales."),
    70: ("Obligaciones cumplidas", "Promesas, planes, проверка y acciones completadas que resuelven una obligación."),
    71: ("Repaso de contextos aspectuales", "Intercalar imperfectivo y perfectivo según proceso, momento concreto, plan o resultado."),
    72: ("Perfectivo futuro para resolver", "Promesas espontáneas y respuestas puntuales: lo haré, llamaré, ayudaré."),
    73: ("Planes e intención concreta", "собираться, хотеть y решить con infinitivos perfectivos para objetivos completos."),
    74: ("Suposición y posibilidad", "наверное, может быть, думаю, смогу, успею y probabilidad de completar la acción."),
    75: ("Peticiones corteses", "скажите, помогите, откройте y otros imperativos perfectivos en peticiones concretas."),
    76: ("Repetición como evento", "снова, опять, пере-/по- y repetición vista como acción completa o hábito."),
    77: ("Infinitivo perfectivo con modales", "надо, нужно, можно, хочу y решил con objetivo completo y resultado puntual."),
    78: ("Infinitivo imperfectivo con proceso", "Actividades en curso, duración, estado actual y procesos no cerrados."),
    79: ("Хотеть: proceso o intención", "Elegir entre querer hacer algo como actividad o querer completar un objetivo."),
    80: ("Resumen operativo del aspecto", "Repaso final: proceso, hecho, repetición, inicio, final, resultado, obligación e intención."),
}

ASPECT_TEXT_REPLACEMENTS = {
    "imperfectivo": "несовершенный вид",
    "perfectivo": "совершенный вид",
    "пары aspectuales": "аспектные пары",
    "будущее perfectivo: форма как настоящее imperfectivo": "будущее совершенного вида: форма как настоящее несовершенного вида",
    "буду + инфинитив imperfectivo": "буду + инфинитив несовершенного вида",
    "прошедшее perfectivo": "прошедшее совершенного вида",
    "будущее perfectivo": "будущее совершенного вида",
    "нет настоящего времени у perfectivo": "нет настоящего времени у совершенного вида",
    "приставки perfectivo": "приставки совершенного вида",
    "perfectivo: конец процесса": "совершенный вид: конец процесса",
    "perfectivo в будущем для завершения действия": "совершенный вид в будущем для завершения действия",
    "сначала процесс imperfectivo, потом финал perfectivo": "сначала процесс несовершенного вида, потом финал совершенного вида",
    "контраст: факт действия vs завершение": "контраст: факт действия или завершение",
    "отрицание + imperfectivo: процесса не было": "отрицание + несовершенный вид: процесса не было",
    "отрицание + perfectivo: процесс не завершён / результата нет": "отрицание + совершенный вид: процесс не завершён / результата нет",
    "future perfectivo после когда / как только": "будущее совершенного вида после когда / как только",
    "perfectivo: действие, которое освободит продолжение": "совершенный вид: действие, которое освободит продолжение",
    "сложные предложения с perfectivo": "сложные предложения с совершенным видом",
    "imperfectivo для процесса, perfectivo для результата": "несовершенный вид для процесса, совершенный вид для результата",
    "perfectivo: результат": "совершенный вид: результат",
    "perfectivo: видимый результат": "совершенный вид: видимый результат",
    "perfectivo для внезапного обнаружения результата": "совершенный вид для внезапного обнаружения результата",
    "perfectivo: начало процесса": "совершенный вид: начало процесса",
    "perfectivo: выполненная обязанность": "совершенный вид: выполненная обязанность",
    "должен был + infinitivo": "должен был + инфинитив",
    "надо было + infinitivo": "надо было + инфинитив",
    "imperfectivo: широкая картина действия": "несовершенный вид: широкая картина действия",
    "perfectivo: конкретный момент действия": "совершенный вид: конкретный момент действия",
    "обзор контекстов imperfectivo": "обзор контекстов несовершенного вида",
    "обзор контекстов perfectivo": "обзор контекстов совершенного вида",
    "calmar o resolver una situación": "успокоить или решить ситуацию",
    "perfectivo como respuesta puntual": "совершенный вид как точный ответ",
    "perfectivo в будущем: решение проблемы": "совершенный вид в будущем: решение проблемы",
    "intención vs proceso": "намерение или процесс",
    "perfectivo para objetivo completo": "совершенный вид для полной цели",
    "будущее perfectivo: план concreto": "будущее совершенного вида: конкретный план",
    "решить + infinitivo perfectivo": "решить + инфинитив совершенного вида",
    "perfectivo con модальность": "совершенный вид с модальностью",
    "probabilidad de resultado": "вероятность результата",
    "будущее perfectivo: предположение": "будущее совершенного вида: предположение",
    "оценка de si la acción se completará": "оценка завершения действия",
    "acción puntual solicitada": "запрошенное точное действие",
    "imperativo perfectivo": "императив совершенного вида",
    "perfectivo en petición cortés": "совершенный вид в вежливой просьбе",
    "resultado esperado de la petición": "ожидаемый результат просьбы",
    "imperfectivo para hábito": "несовершенный вид для привычки",
    "perfectivo con prefijos пере- / по-": "совершенный вид с приставками пере- / по-",
    "repetición como evento completo": "повторение как завершённое событие",
    "acción puntual / resultado": "точное действие / результат",
    "infinitivo perfectivo después de verbos modales": "инфинитив совершенного вида после модальных слов",
    "надо + infinitivo perfectivo para tarea concreta": "надо + инфинитив совершенного вида для конкретной задачи",
    "хочу + infinitivo perfectivo para intención concreta": "хочу + инфинитив совершенного вида для конкретного намерения",
    "debería estar haciendo algo": "нужно заниматься процессом",
    "duración y actividad en curso": "длительность и текущая деятельность",
    "estado actual con infinitivo imperfectivo": "текущее состояние с инфинитивом несовершенного вида",
    "infinitivo imperfectivo para proceso": "инфинитив несовершенного вида для процесса",
    "contraste proceso vs objetivo": "контраст процесса и цели",
    "elección del aspecto después de хотеть": "выбор вида после хотеть",
    "хотеть + infinitivo imperfectivo: estado / deseo general": "хотеть + инфинитив несовершенного вида: состояние / общее желание",
    "хотеть + infinitivo perfectivo: intención concreta": "хотеть + инфинитив совершенного вида: конкретное намерение",
    "contraste por contexto": "контраст по контексту",
    "elección aspectual en infinitivo": "выбор вида в инфинитиве",
    "imperfectivo: proceso / estado / repetición / hecho general": "несовершенный вид: процесс / состояние / повторение / общий факт",
    "perfectivo: acción completa / resultado / inicio / final": "совершенный вид: завершённое действие / результат / начало / финал",
    "resumen del aspecto verbal en infinitivo": "обзор вида глагола в инфинитиве",
}

MATERIAL_ADDITIONS = {
    1: ["вода", "хлеб"],
    2: ["дом", "центр", "станция", "кафе", "банк", "аптека", "остановка"],
    3: ["студент", "студентка", "коллега", "менеджер"],
    4: ["писать", "помогать", "искать", "открывать", "закрывать"],
    5: ["фильм", "песня", "музыка", "урок", "слово"],
    11: ["время", "вопрос", "ключ", "билет"],
    13: ["комната", "кухня", "дверь"],
    26: ["завтрак", "обед", "ужин", "хлеб", "сыр", "салат", "яблоко"],
    37: ["плавать", "готовить", "петь", "танцевать", "помогать"],
    38: ["устал", "занят", "опоздать", "проблема", "решение"],
    39: ["старый", "молодой", "важный", "трудный", "лёгкий"],
    41: ["глаза", "лицо", "рост", "высокий", "низкий"],
    45: ["зуб", "живот", "спина", "помощь", "аптека"],
    46: ["сегодня", "завтра", "сначала", "потом", "срочно"],
    61: ["делать", "сделать", "начинать", "начать", "решать", "решить"],
    63: ["брать", "взять", "приходить", "прийти", "уходить", "уйти"],
    72: ["помогу", "открою", "закрою", "отвечу", "проверю"],
    77: ["попробовать", "объяснить", "выучить", "повторить"],
}

VOCAB = {
    "человек": ("persona", "sustantivo", "personas"),
    "мужчина": ("hombre", "sustantivo", "personas"),
    "женщина": ("mujer", "sustantivo", "personas"),
    "парень": ("chico / novio", "sustantivo", "personas"),
    "девушка": ("chica / novia", "sustantivo", "personas"),
    "мальчик": ("niño", "sustantivo", "personas"),
    "девочка": ("niña", "sustantivo", "personas"),
    "дети": ("niños / hijos", "sustantivo plural", "familia"),
    "семья": ("familia", "sustantivo", "familia"),
    "муж": ("marido", "sustantivo", "familia"),
    "жена": ("esposa", "sustantivo", "familia"),
    "папа": ("papá / padre", "sustantivo", "familia"),
    "мама": ("mamá / madre", "sustantivo", "familia"),
    "сын": ("hijo", "sustantivo", "familia"),
    "дочь": ("hija", "sustantivo", "familia"),
    "брат": ("hermano", "sustantivo", "familia"),
    "сестра": ("hermana", "sustantivo", "familia"),
    "дядя": ("tío", "sustantivo", "familia"),
    "тётя": ("tía", "sustantivo", "familia"),
    "дедушка": ("abuelo", "sustantivo", "familia"),
    "бабушка": ("abuela", "sustantivo", "familia"),
    "кот": ("gato macho", "sustantivo", "animales"),
    "кошка": ("gato / gata", "sustantivo", "animales"),
    "собака": ("perro", "sustantivo", "animales"),
    "чай": ("té", "sustantivo", "bebidas"),
    "кофе": ("café", "sustantivo", "bebidas"),
    "молоко": ("leche", "sustantivo", "bebidas"),
    "вода": ("agua", "sustantivo", "bebidas"),
    "хлеб": ("pan", "sustantivo", "comida"),
    "город": ("ciudad", "sustantivo", "lugares"),
    "улица": ("calle", "sustantivo", "lugares"),
    "проспект": ("avenida", "sustantivo", "lugares"),
    "метро": ("metro", "sustantivo", "transporte"),
    "площадь": ("plaza", "sustantivo", "lugares"),
    "парк": ("parque", "sustantivo", "lugares"),
    "церковь": ("iglesia", "sustantivo", "lugares"),
    "башня": ("torre", "sustantivo", "lugares"),
    "магазин": ("tienda", "sustantivo", "lugares"),
    "рынок": ("mercado", "sustantivo", "lugares"),
    "музей": ("museo", "sustantivo", "lugares"),
    "почта": ("correo / oficina de correos", "sustantivo", "lugares"),
    "школа": ("escuela", "sustantivo", "lugares"),
    "университет": ("universidad", "sustantivo", "lugares"),
    "здесь": ("aquí", "adverbio", "lugar"),
    "там": ("allí / ahí", "adverbio", "lugar"),
    "дом": ("casa", "sustantivo", "lugares"),
    "центр": ("centro", "sustantivo", "lugares"),
    "станция": ("estación", "sustantivo", "transporte"),
    "кафе": ("cafetería / café", "sustantivo", "lugares"),
    "банк": ("banco", "sustantivo", "lugares"),
    "аптека": ("farmacia", "sustantivo", "salud"),
    "остановка": ("parada", "sustantivo", "transporte"),
    "я": ("yo", "pronombre", "pronombres"),
    "ты": ("tú", "pronombre", "pronombres"),
    "он": ("él", "pronombre", "pronombres"),
    "она": ("ella", "pronombre", "pronombres"),
    "мы": ("nosotros", "pronombre", "pronombres"),
    "вы": ("usted / vosotros", "pronombre", "pronombres"),
    "они": ("ellos", "pronombre", "pronombres"),
    "работа": ("trabajo", "sustantivo", "trabajo"),
    "профессия": ("profesión", "sustantivo", "trabajo"),
    "врач": ("médico", "sustantivo", "trabajo"),
    "учитель": ("profesor / maestro", "sustantivo", "trabajo"),
    "преподаватель": ("profesor", "sustantivo", "trabajo"),
    "полицейский": ("policía", "sustantivo", "trabajo"),
    "инженер": ("ingeniero", "sustantivo", "trabajo"),
    "артист": ("artista", "sustantivo", "trabajo"),
    "писатель": ("escritor", "sustantivo", "trabajo"),
    "журналист": ("periodista", "sustantivo", "trabajo"),
    "актёр": ("actor", "sustantivo", "trabajo"),
    "актриса": ("actriz", "sustantivo", "trabajo"),
    "студент": ("estudiante", "sustantivo", "estudios"),
    "студентка": ("estudiante", "sustantivo", "estudios"),
    "коллега": ("colega", "sustantivo", "trabajo"),
    "менеджер": ("gerente / mánager", "sustantivo", "trabajo"),
    "делать": ("hacer", "verbo", "verbos frecuentes"),
    "работать": ("trabajar", "verbo", "verbos frecuentes"),
    "отдыхать": ("descansar", "verbo", "verbos frecuentes"),
    "гулять": ("pasear", "verbo", "verbos frecuentes"),
    "думать": ("pensar", "verbo", "verbos frecuentes"),
    "играть": ("jugar / tocar", "verbo", "verbos frecuentes"),
    "читать": ("leer", "verbo", "verbos frecuentes"),
    "знать": ("saber / conocer", "verbo", "verbos frecuentes"),
    "завтракать": ("desayunar", "verbo", "comida"),
    "обедать": ("comer / almorzar", "verbo", "comida"),
    "ужинать": ("cenar", "verbo", "comida"),
    "компьютер": ("ordenador", "sustantivo", "tecnología"),
    "ноутбук": ("portátil", "sustantivo", "tecnología"),
    "кондиционер": ("aire acondicionado", "sustantivo", "casa"),
    "пульт": ("mando a distancia", "sustantivo", "casa"),
    "писать": ("escribir", "verbo", "verbos frecuentes"),
    "помогать": ("ayudar", "verbo", "verbos frecuentes"),
    "искать": ("buscar", "verbo", "verbos frecuentes"),
    "открывать": ("abrir", "verbo", "verbos frecuentes"),
    "закрывать": ("cerrar", "verbo", "verbos frecuentes"),
    "слушать": ("escuchar", "verbo", "percepción"),
    "изучать": ("estudiar", "verbo", "estudios"),
    "покупать": ("comprar", "verbo", "compras"),
    "радио": ("radio", "sustantivo", "medios"),
    "журнал": ("revista", "sustantivo", "medios"),
    "сообщение": ("mensaje", "sustantivo", "comunicación"),
    "русский язык": ("idioma ruso", "sustantivo", "lengua"),
    "шахматы": ("ajedrez", "sustantivo plural", "juegos"),
    "футбол": ("fútbol", "sustantivo", "deporte"),
    "баскетбол": ("baloncesto", "sustantivo", "deporte"),
    "бильярд": ("billar", "sustantivo", "juegos"),
    "карты": ("cartas / mapas", "sustantivo plural", "juegos"),
    "фильм": ("película", "sustantivo", "ocio"),
    "песня": ("canción", "sustantivo", "ocio"),
    "музыка": ("música", "sustantivo", "ocio"),
    "урок": ("clase / lección", "sustantivo", "estudios"),
    "слово": ("palabra", "sustantivo", "lengua"),
    "говорить": ("hablar", "verbo", "comunicación"),
    "смотреть": ("mirar / ver", "verbo", "percepción"),
    "строить": ("construir", "verbo", "verbos frecuentes"),
    "курить": ("fumar", "verbo", "rutina"),
    "по-русски": ("en ruso", "adverbio", "lengua"),
    "по-испански": ("en español", "adverbio", "lengua"),
    "по-английски": ("en inglés", "adverbio", "lengua"),
    "телевизор": ("televisor", "sustantivo", "casa"),
    "стадион": ("estadio", "sustantivo", "lugares"),
    "больница": ("hospital", "sustantivo", "salud"),
    "понимать": ("entender", "verbo", "comunicación"),
    "спрашивать": ("preguntar", "verbo", "comunicación"),
    "отвечать": ("responder", "verbo", "comunicación"),
    "звать": ("llamar(se)", "verbo", "comunicación"),
    "помнить": ("recordar", "verbo", "memoria"),
    "родители": ("padres", "sustantivo plural", "familia"),
    "директор": ("director", "sustantivo", "trabajo"),
    "машина": ("coche / máquina", "sustantivo", "transporte"),
    "кровать": ("cama", "sustantivo", "casa"),
    "письмо": ("carta", "sustantivo", "comunicación"),
    "газета": ("periódico", "sustantivo", "medios"),
    "окно": ("ventana", "sustantivo", "casa"),
    "язык": ("lengua / idioma", "sustantivo", "lengua"),
    "новость": ("noticia", "sustantivo", "medios"),
    "книга": ("libro", "sustantivo", "estudios"),
    "рубль": ("rublo", "sustantivo", "dinero"),
    "остров": ("isla", "sustantivo", "lugares"),
    "друг": ("amigo", "sustantivo", "personas"),
    "ребёнок": ("niño", "sustantivo", "personas"),
    "люди": ("gente / personas", "sustantivo plural", "personas"),
    "хорошо": ("bien", "adverbio", "modo"),
    "плохо": ("mal", "adverbio", "modo"),
    "быстро": ("rápido", "adverbio", "modo"),
    "медленно": ("despacio", "adverbio", "modo"),
    "отлично": ("excelente", "adverbio", "modo"),
    "трудно": ("difícil", "adverbio", "modo"),
    "легко": ("fácil", "adverbio", "modo"),
    "интересно": ("interesante", "adverbio", "modo"),
    "скучно": ("aburrido", "adverbio", "modo"),
    "очень": ("muy", "adverbio", "grado"),
    "слишком": ("demasiado", "adverbio", "grado"),
    "так": ("así / tan", "adverbio", "grado"),
    "довольно": ("bastante", "adverbio", "grado"),
    "много": ("mucho", "adverbio", "cantidad"),
    "мало": ("poco", "adverbio", "cantidad"),
    "жарко": ("hace calor", "predicativo", "clima"),
    "холодно": ("hace frío / frío", "predicativo", "clima"),
    "тепло": ("hace templado / calor suave", "predicativo", "clima"),
    "карандаш": ("lápiz", "sustantivo", "objetos"),
    "деньги": ("dinero", "sustantivo plural", "dinero"),
    "словарь": ("diccionario", "sustantivo", "estudios"),
    "телефон": ("teléfono", "sustantivo", "comunicación"),
    "паспорт": ("pasaporte", "sustantivo", "viajes"),
    "чемодан": ("maleta", "sustantivo", "viajes"),
    "встреча": ("reunión / cita", "sustantivo", "agenda"),
    "экзамен": ("examen", "sustantivo", "estudios"),
    "время": ("tiempo", "sustantivo", "tiempo"),
    "вопрос": ("pregunta", "sustantivo", "comunicación"),
    "ключ": ("llave", "sustantivo", "objetos"),
    "билет": ("billete / entrada", "sustantivo", "viajes"),
    "стол": ("mesa", "sustantivo", "casa"),
    "супермаркет": ("supermercado", "sustantivo", "compras"),
    "море": ("mar", "sustantivo", "lugares"),
    "сумка": ("bolso", "sustantivo", "objetos"),
    "рюкзак": ("mochila", "sustantivo", "objetos"),
    "карман": ("bolsillo", "sustantivo", "ropa"),
    "шкаф": ("armario", "sustantivo", "casa"),
    "пол": ("suelo", "sustantivo", "casa"),
    "лес": ("bosque", "sustantivo", "lugares"),
    "сад": ("jardín", "sustantivo", "lugares"),
    "аэропорт": ("aeropuerto", "sustantivo", "viajes"),
    "квартира": ("piso / apartamento", "sustantivo", "vivienda"),
    "Испания": ("España", "nombre propio", "lugares"),
    "Россия": ("Rusia", "nombre propio", "lugares"),
    "Москва": ("Moscú", "nombre propio", "lugares"),
    "Сибирь": ("Siberia", "nombre propio", "lugares"),
    "сейчас": ("ahora", "adverbio", "tiempo"),
    "вчера": ("ayer", "adverbio", "tiempo"),
    "сегодня": ("hoy", "adverbio", "tiempo"),
    "завтра": ("mañana", "adverbio", "tiempo"),
    "сначала": ("primero / al principio", "adverbio", "tiempo"),
    "потом": ("después", "adverbio", "tiempo"),
    "срочно": ("urgente", "adverbio", "tiempo"),
    "завтрак": ("desayuno", "sustantivo", "comida"),
    "обед": ("comida / almuerzo", "sustantivo", "comida"),
    "ужин": ("cena", "sustantivo", "comida"),
    "сыр": ("queso", "sustantivo", "comida"),
    "салат": ("ensalada", "sustantivo", "comida"),
    "яблоко": ("manzana", "sustantivo", "comida"),
    "плавать": ("nadar", "verbo", "habilidades"),
    "готовить": ("cocinar / preparar", "verbo", "habilidades"),
    "петь": ("cantar", "verbo", "habilidades"),
    "танцевать": ("bailar", "verbo", "habilidades"),
    "устал": ("cansado", "adjetivo corto", "estado"),
    "занят": ("ocupado", "adjetivo corto", "estado"),
    "опоздать": ("llegar tarde", "verbo", "tiempo"),
    "проблема": ("problema", "sustantivo", "abstracto"),
    "решение": ("solución / decisión", "sustantivo", "abstracto"),
    "старый": ("viejo / antiguo", "adjetivo", "descripción"),
    "молодой": ("joven", "adjetivo", "descripción"),
    "важный": ("importante", "adjetivo", "descripción"),
    "трудный": ("difícil", "adjetivo", "descripción"),
    "лёгкий": ("fácil / ligero", "adjetivo", "descripción"),
    "глаза": ("ojos", "sustantivo plural", "cuerpo"),
    "лицо": ("cara", "sustantivo", "cuerpo"),
    "рост": ("altura / estatura", "sustantivo", "cuerpo"),
    "высокий": ("alto", "adjetivo", "descripción"),
    "низкий": ("bajo", "adjetivo", "descripción"),
    "зуб": ("diente", "sustantivo", "salud"),
    "живот": ("barriga / abdomen", "sustantivo", "salud"),
    "спина": ("espalda", "sustantivo", "salud"),
    "помощь": ("ayuda", "sustantivo", "salud"),
    "делать": ("hacer", "verbo", "aspecto"),
    "сделать": ("hacer / completar", "verbo perfectivo", "aspecto"),
    "начинать": ("empezar", "verbo imperfectivo", "aspecto"),
    "начать": ("empezar / iniciar", "verbo perfectivo", "aspecto"),
    "решать": ("resolver / decidir", "verbo imperfectivo", "aspecto"),
    "решить": ("resolver / decidir", "verbo perfectivo", "aspecto"),
    "брать": ("tomar / coger", "verbo imperfectivo", "aspecto"),
    "взять": ("tomar / coger", "verbo perfectivo", "aspecto"),
    "приходить": ("venir / llegar", "verbo imperfectivo", "movimiento"),
    "прийти": ("venir / llegar", "verbo perfectivo", "movimiento"),
    "уходить": ("irse", "verbo imperfectivo", "movimiento"),
    "уйти": ("irse", "verbo perfectivo", "movimiento"),
    "помогу": ("ayudaré", "verbo futuro", "aspecto"),
    "открою": ("abriré", "verbo futuro", "aspecto"),
    "закрою": ("cerraré", "verbo futuro", "aspecto"),
    "отвечу": ("responderé", "verbo futuro", "aspecto"),
    "проверю": ("comprobaré", "verbo futuro", "aspecto"),
    "попробовать": ("probar / intentar", "verbo perfectivo", "aspecto"),
    "объяснить": ("explicar", "verbo perfectivo", "aspecto"),
    "выучить": ("aprender / memorizar", "verbo perfectivo", "aspecto"),
    "повторить": ("repetir", "verbo perfectivo", "aspecto"),
}

STOPWORDS = {
    "это", "не", "и", "в", "на", "о", "у", "за",
    "как", "что", "кто", "где", "куда", "когда", "если", "или", "для", "без", "с", "из",
}


def read_json(path: str) -> Any:
    return json.loads((REPO_ROOT / path).read_text(encoding="utf-8"))


def write_json(path: str, payload: Any) -> None:
    (REPO_ROOT / path).write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def dedupe(values: list[str]) -> list[str]:
    seen = set()
    out = []
    for value in values:
        key = str(value).strip()
        if key and key not in seen:
            seen.add(key)
            out.append(key)
    return out


def tokenize_ru(text: str) -> list[str]:
    return re.findall(r"[А-Яа-яЁё-]+", text)


def transliterate(text: str) -> str:
    table = str.maketrans({
        "а": "a", "б": "b", "в": "v", "г": "g", "д": "d", "е": "e", "ё": "yo",
        "ж": "zh", "з": "z", "и": "i", "й": "y", "к": "k", "л": "l", "м": "m",
        "н": "n", "о": "o", "п": "p", "р": "r", "с": "s", "т": "t", "у": "u",
        "ф": "f", "х": "h", "ц": "ts", "ч": "ch", "ш": "sh", "щ": "sch", "ъ": "",
        "ы": "y", "ь": "", "э": "e", "ю": "yu", "я": "ya",
        "А": "A", "Б": "B", "В": "V", "Г": "G", "Д": "D", "Е": "E", "Ё": "Yo",
        "Ж": "Zh", "З": "Z", "И": "I", "Й": "Y", "К": "K", "Л": "L", "М": "M",
        "Н": "N", "О": "O", "П": "P", "Р": "R", "С": "S", "Т": "T", "У": "U",
        "Ф": "F", "Х": "H", "Ц": "Ts", "Ч": "Ch", "Ш": "Sh", "Щ": "Sch", "Ъ": "",
        "Ы": "Y", "Ь": "", "Э": "E", "Ю": "Yu", "Я": "Ya",
    })
    return text.translate(table).replace("  ", " ").strip()


def zipf(word: str) -> float | None:
    try:
        from wordfreq import zipf_frequency
    except Exception:
        return None
    tokens = tokenize_ru(word)
    if not tokens:
        return None
    values = [zipf_frequency(token.lower(), "ru") for token in tokens]
    values = [value for value in values if value > 0]
    if not values:
        return None
    return round(sum(values) / len(values), 2)


def frequency_band(score: float | None) -> str:
    if score is None:
        return "sin_dato_local"
    if score >= 5.0:
        return "muy_frecuente"
    if score >= 4.0:
        return "frecuente"
    if score >= 3.0:
        return "util_especifico"
    return "baja_frecuencia"


def frequency_band_label(score: float | None) -> str:
    labels = {
        "muy_frecuente": "Muy común en ruso cotidiano",
        "frecuente": "Frecuente y rentable para empezar",
        "util_especifico": "Útil para este tema",
        "baja_frecuencia": "Menos frecuente, pero necesaria para este tema",
        "sin_dato_local": "Seleccionada por utilidad comunicativa",
    }
    return labels[frequency_band(score)]


def learner_note(spanish: str, kind: str, theme: str, score: float | None) -> str:
    field = f" para hablar de {theme}" if theme else ""
    return f"{spanish}: {kind}{field}. {frequency_band_label(score)}. Úsala en una frase corta."


def is_generated_note(value: str) -> bool:
    return (
        value.startswith("Prioridad léxica:")
        or "Usala en una frase corta." in value
        or "Úsala en una frase corta." in value
    )


def first_lesson_for(word: str, materials: dict[str, Any], aspect: dict[str, Any]) -> int:
    for data in (materials, aspect):
        for cls in data.get("classes", []):
            if word in cls.get("v", []):
                return int(cls.get("l") or 1)
    for lesson, words in MATERIAL_ADDITIONS.items():
        if word in words:
            return lesson
    return 1


def example_for(word: str, lesson: int) -> str:
    examples = {
        "вода": "Это вода.",
        "хлеб": "Это хлеб.",
        "кафе": "Кафе здесь.",
        "аптека": "Аптека там.",
        "студент": "Он студент.",
        "помогать": "Я помогаю.",
        "фильм": "Я смотрю фильм.",
        "урок": "У меня урок.",
        "время": "У меня нет времени.",
        "завтрак": "На завтрак чай.",
        "помогу": "Я помогу.",
    }
    if word in examples:
        return examples[word]
    if lesson <= 3:
        return f"Это {word}."
    if word.endswith("ть"):
        return f"Я хочу {word}."
    return ""


def update_lessons() -> None:
    lessons = read_json("content/lessons.json")
    for lesson in lessons:
        number = int(lesson.get("id") or 0)
        if number in LESSON_UPDATES:
            title, summary = LESSON_UPDATES[number]
            lesson["title"] = title
            lesson["summary"] = summary
    write_json("content/lessons.json", lessons)


def update_materials() -> None:
    materials = read_json("content/materials.json")
    classes = {int(cls.get("l") or 0): cls for cls in materials.get("classes", [])}
    for lesson, additions in MATERIAL_ADDITIONS.items():
        if lesson > 60:
            continue
        cls = classes.get(lesson)
        if cls:
            cls["v"] = dedupe([*cls.get("v", []), *additions])
    write_json("content/materials.json", materials)


def update_aspect_materials() -> None:
    aspect = read_json("content/materials-aspect.json")
    classes = {int(cls.get("l") or 0): cls for cls in aspect.get("classes", [])}
    for cls in aspect.get("classes", []):
        cls["v"] = dedupe([ASPECT_TEXT_REPLACEMENTS.get(item, item) for item in cls.get("v", [])])
        cls["g"] = dedupe([ASPECT_TEXT_REPLACEMENTS.get(item, item) for item in cls.get("g", [])])
    for lesson, additions in MATERIAL_ADDITIONS.items():
        if lesson < 61:
            continue
        cls = classes.get(lesson)
        if cls:
            cls["v"] = dedupe([*cls.get("v", []), *additions])
    write_json("content/materials-aspect.json", aspect)


def update_vocabulary() -> None:
    materials = read_json("content/materials.json")
    aspect = read_json("content/materials-aspect.json")
    existing = read_json("content/vocabulary.json")
    by_word = {item.get("russian"): item for item in existing if item.get("russian")}
    for word, (spanish, kind, theme) in VOCAB.items():
        lesson = first_lesson_for(word, materials, aspect)
        score = zipf(word)
        current = by_word.get(word, {})
        existing_note = current.get("phonetics") or ""
        if not existing_note or is_generated_note(existing_note):
            existing_note = learner_note(
                current.get("spanish") or spanish,
                current.get("type") or kind,
                current.get("theme") or theme,
                score,
            )
        entry = {
            **current,
            "id": current.get("id") or f"vocab-{lesson:03d}-{slug(word)}",
            "lesson": int(current.get("lesson") or lesson),
            "russian": word,
            "transcription": current.get("transcription") or transliterate(word).lower(),
            "spanish": current.get("spanish") or spanish,
            "type": current.get("type") or kind,
            "theme": current.get("theme") or theme,
            "example": current.get("example") or example_for(word, lesson),
            "accent": current.get("accent") or word,
            "phonetics": existing_note,
            "frequency_zipf": score,
            "frequency_band": frequency_band(score),
            "frequency_source": "wordfreq-3.1.1 aggregate ru; see content/lexical-selection.json",
        }
        by_word[word] = entry
    enriched = sorted(by_word.values(), key=lambda item: (int(item.get("lesson") or 999), item.get("russian", "")))
    write_json("content/vocabulary.json", enriched)
    write_json("content/lexical-selection.json", lexical_selection(enriched))


def lexical_selection(entries: list[dict[str, Any]]) -> dict[str, Any]:
    additions = [
        {
            "russian": item["russian"],
            "spanish": item.get("spanish", ""),
            "lesson": item.get("lesson"),
            "theme": item.get("theme", ""),
            "frequency_zipf": item.get("frequency_zipf"),
            "frequency_band": item.get("frequency_band"),
            "reason": "frecuencia corpus + campo lexico comunicativo + productividad gramatical",
        }
        for item in entries
        if item.get("frequency_source")
    ]
    return {
        "version": 1,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "policy": "derived_selection_metadata_no_copied_frequency_lists",
        "frequency_sources": [
            {
                "name": "wordfreq 3.1.1",
                "url": "https://github.com/rspeer/wordfreq",
                "note": "Usado localmente para estimar Zipf; ruso combina Wikipedia, subtitulos, noticias, libros y Twitter.",
            },
            {
                "name": "Новый частотный словарь русской лексики",
                "url": "http://dict.ruslang.ru/freq.php",
                "note": "Referencia lexicografica basada en corpus para validar alta frecuencia de lemas comunes.",
            },
            {
                "name": "General Internet Corpus of Russian",
                "url": "http://www.webcorpora.ru/en/",
                "note": "Referencia de campo lexico web/social para lengua moderna; se cita como criterio, no se redistribuyen datos.",
            },
        ],
        "selection_rules": [
            "priorizar palabras frecuentes o de alta cobertura comunicativa",
            "mantener campos lexicos necesarios para frases reales: familia, ciudad, trabajo, comida, salud, transporte, estudio, aspecto verbal",
            "evitar palabras aisladas que no se practiquen en ejemplos o patrones",
            "usar frecuencia como desempate, no como unico criterio",
        ],
        "entries": additions,
    }


def build_exercises() -> None:
    manual = [item for item in read_json("content/exercises.json") if not str(item.get("id", "")).startswith("auto-")]
    notes = read_json("content/learning-notes.json").get("notes", [])
    grammar = read_json("content/grammar.json")
    exercises: list[dict[str, Any]] = manual[:]
    all_examples = []
    for note in notes:
        for example in note.get("examples", []):
            if re.search(r"[А-Яа-яЁё]", example):
                all_examples.append(example)

    for note in notes:
        lesson = int((note.get("lessons") or [1])[0])
        examples = [example for example in note.get("examples", []) if re.search(r"[А-Яа-яЁё]", example)]
        for index, example in enumerate(examples, start=1):
            token = choose_cloze_token(example, note.get("title", ""))
            choices = make_choices(example, [*examples, *all_examples])
            base_id = f"auto-note-{note['id']}-{index:02d}"
            exercises.append({
                "id": f"{base_id}-dict",
                "lesson": lesson,
                "skill": "pronunciacion",
                "type": "dictation",
                "prompt": "Escucha y escribe la frase rusa.",
                "expected": example,
                "tts_text": example,
                "tags": [note.get("id", ""), token],
                "weight": 0.32,
            })
            exercises.append({
                "id": f"{base_id}-listen",
                "lesson": lesson,
                "skill": "comprension",
                "type": "listen-choice",
                "prompt": "Escucha y elige la frase que has oído.",
                "expected": example,
                "tts_text": example,
                "choices": choices,
                "tags": [note.get("id", ""), token],
                "weight": 0.28,
            })
            if token:
                exercises.append({
                    "id": f"{base_id}-cloze",
                    "lesson": lesson,
                    "skill": "gramatica",
                    "type": "cloze",
                    "prompt": "Completa la palabra que falta en la frase rusa.",
                    "display": hide_token(example, token),
                    "expected": token,
                    "display_expected": example,
                    "tts_text": example,
                    "tags": [note.get("id", ""), token],
                    "weight": 0.25,
                })
                exercises.append({
                    "id": f"{base_id}-produce",
                    "lesson": lesson,
                    "skill": "produccion",
                    "type": "production-prompt",
                    "prompt": "Escribe una frase rusa breve y natural con el objetivo trabajado. No copies el ejemplo ni una palabra aislada.",
                    "expected": token,
                    "allow_contains": True,
                    "sample": example,
                    "tags": [note.get("id", ""), token],
                    "weight": 0.22,
                })

    for item in grammar:
        lesson = int(item.get("lesson") or 1)
        for index, example in enumerate(item.get("examples", []), start=1):
            match = re.search(r"([А-Яа-яЁё -]+?)\s*→\s*([А-Яа-яЁё -]+)(?::\s*(.+))?", example)
            if not match:
                continue
            left, right, sentence = match.group(1).strip(), match.group(2).strip(), (match.group(3) or "").strip()
            exercises.append({
                "id": f"auto-grammar-{item['id']}-{index:02d}-transform",
                "lesson": lesson,
                "skill": "gramatica",
                "type": "transform",
                "prompt": "Transforma la forma rusa para que encaje con el cambio indicado.",
                "display": f"{left} → _____",
                "expected": right,
                "display_expected": f"{left} → {right}",
                "tts_text": sentence or right,
                "tags": [item.get("id", ""), left, right],
                "weight": 0.34,
            })

    exercises = sorted(exercises, key=lambda item: (int(item.get("lesson") or 999), item.get("id", "")))
    write_json("content/exercises.json", exercises)


def choose_cloze_token(example: str, title: str) -> str:
    title_tokens = [token.lower() for token in tokenize_ru(title) if len(token) > 2]
    tokens = tokenize_ru(example)
    for token in tokens:
        low = token.lower()
        if low in title_tokens and low not in STOPWORDS:
            return token
    candidates = [token for token in tokens if len(token) > 3 and token.lower() not in STOPWORDS]
    if not candidates:
        candidates = [token for token in tokens if len(token) > 2 and token.lower() not in STOPWORDS]
    if not candidates:
        return ""
    return max(candidates, key=lambda token: (zipf(token) or 0, len(token)))


def hide_token(example: str, token: str) -> str:
    return re.sub(re.escape(token), "_____", example, count=1)


def make_choices(correct: str, pool: list[str]) -> list[dict[str, Any]]:
    values = [correct]
    for item in pool:
        if item != correct and item not in values:
            values.append(item)
        if len(values) >= 4:
            break
    return [{"label": value, "value": value, "correct": value == correct} for value in values]


def slug(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", transliterate(value).lower()).strip("-") or "item"


def main() -> int:
    update_lessons()
    update_materials()
    update_aspect_materials()
    update_vocabulary()
    build_exercises()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
