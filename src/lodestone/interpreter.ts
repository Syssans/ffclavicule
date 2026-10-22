/**
 * Applique une définition de sélecteurs (format lodestone-css-selectors) à une page HTML.
 *
 * Format d'une définition :
 * - feuille : { selector, attribute?, regex?, multiple?, type? }
 * - groupe : { CLE: définition, ... }, avec une clé ROOT optionnelle qui restreint la recherche
 *   à un élément (ou à une liste d'éléments si ROOT.multiple est vrai).
 */
import { HTMLElement, parse } from 'node-html-parser';

export type SelectorType = string | Record<string, string>;

export interface SelectorLeaf {
  selector: string;
  attribute?: string;
  regex?: string;
  multiple?: boolean;
  type?: SelectorType;
}

export interface SelectorGroup {
  [key: string]: SelectorLeaf | SelectorGroup;
}

export type Definition = SelectorLeaf | SelectorGroup;

/** Valeur extraite : texte, nombre, groupes nommés d'une regex, liste ou objet imbriqué. */
export type Extracted = string | number | null | ExtractedObject | Extracted[];
export interface ExtractedObject {
  [key: string]: Extracted;
}

function isLeaf(def: Definition): def is SelectorLeaf {
  return typeof (def as SelectorLeaf).selector === 'string';
}

export function parseHtml(html: string): HTMLElement {
  return parse(html);
}

/** Décode les entités HTML et retire les balises. */
function htmlToText(html: string): string {
  return parse(html).text.replace(/\s+/g, ' ').trim();
}

/** "1,234,567" -> 1234567 ; "-" ou vide -> null. */
export function toInt(value: string): number | null {
  const digits = value.replace(/[^\d-]/g, '');
  if (digits === '' || digits === '-') return null;
  const n = Number.parseInt(digits, 10);
  return Number.isNaN(n) ? null : n;
}

const regexCache = new Map<string, RegExp>();

/** Convertit une regex Python (?P<nom>…) en regex JavaScript, en tolérant <br>, <br/> et <br />. */
export function translateRegex(source: string): RegExp {
  let re = regexCache.get(source);
  if (!re) {
    const js = source
      .replace(/\(\?P</g, '(?<')
      // <br/>, <br\/>, <br/?> et <br\/?> deviennent <br\s*\/?>
      .replace(/<br\\?\/\??>/g, '<br\\s*\\/?>');
    re = new RegExp(js);
    regexCache.set(source, re);
  }
  return re;
}

function convert(value: string, type: string | undefined): string | number | null {
  if (type === 'integer') {
    // Les identifiants de compagnie libre (19 chiffres) dépassent la précision d'un nombre JavaScript.
    const digits = value.replace(/[^\d]/g, '');
    if (digits.length > 15) return digits;
    return toInt(value);
  }
  const text = htmlToText(value);
  if (type === undefined && /^\d{1,15}$/.test(text)) return Number.parseInt(text, 10);
  return text === '' ? null : text;
}

function extract(el: HTMLElement | null, def: SelectorLeaf): Extracted {
  if (!el) return null;
  const raw = def.attribute ? (el.getAttribute(def.attribute) ?? '') : el.innerHTML;

  if (def.regex) {
    const match = translateRegex(def.regex).exec(raw);
    if (!match?.groups) return null;
    const types = typeof def.type === 'object' ? def.type : {};
    const out: ExtractedObject = {};
    for (const [name, value] of Object.entries(match.groups)) {
      out[name] = value === undefined ? null : convert(value, types[name]);
    }
    return out;
  }

  if (def.attribute) return raw === '' ? null : raw;
  return convert(raw, typeof def.type === 'string' ? def.type : 'string');
}

function evaluateGroup(group: SelectorGroup, scope: HTMLElement): ExtractedObject {
  const out: ExtractedObject = {};
  for (const [key, def] of Object.entries(group)) {
    if (key === 'ROOT') continue;
    out[key] = evaluate(def, scope);
  }
  return out;
}

export function evaluate(def: Definition, scope: HTMLElement): Extracted {
  if (isLeaf(def)) {
    if (def.multiple) return scope.querySelectorAll(def.selector).map((el) => extract(el, def));
    return extract(scope.querySelector(def.selector), def);
  }

  const root = def.ROOT;
  if (root && isLeaf(root)) {
    if (root.multiple) {
      return scope.querySelectorAll(root.selector).map((el) => evaluateGroup(def, el));
    }
    const el = scope.querySelector(root.selector);
    return el ? evaluateGroup(def, el) : null;
  }
  return evaluateGroup(def, scope);
}

/** Applique une définition à une page HTML complète. */
export function extractPage(html: string, def: Definition): ExtractedObject {
  const result = evaluate(def, parseHtml(html));
  return result && typeof result === 'object' && !Array.isArray(result) ? result : {};
}
