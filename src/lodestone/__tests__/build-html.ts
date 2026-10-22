/**
 * Construit une page HTML minimale dans laquelle chaque sélecteur CSS donné trouve un élément.
 *
 * Sert à tester la lecture du Lodestone sans accès au site : la page générée respecte les
 * sélecteurs communautaires, donc si le vrai site les respecte aussi, l'extraction est la même.
 * Syntaxe gérée : balise, .classe, #id, :nth-child(n), :nth-of-type(n), combinateurs ">" et espace
 * (traité comme un enfant direct, ce qui satisfait aussi un descendant).
 */

interface Step {
  tag: string | null;
  id: string | null;
  classes: string[];
  nthChild: number | null;
  nthOfType: number | null;
}

interface Node {
  tag: string;
  id: string | null;
  classes: Set<string>;
  attrs: Record<string, string>;
  html: string | null;
  children: Node[];
  filler: boolean;
}

export interface Fill {
  selector: string;
  /** Contenu HTML de l'élément. */
  html?: string;
  /** Attributs à poser sur l'élément. */
  attrs?: Record<string, string>;
}

const VOID = new Set(['img', 'br', 'input']);

function newNode(tag: string, filler = false): Node {
  return { tag, id: null, classes: new Set(), attrs: {}, html: null, children: [], filler };
}

function parseStep(token: string): Step {
  const m = /^([a-z][a-z0-9]*)?((?:[.#][\w-]+)*)(?::(nth-child|nth-of-type)\((\d+)\))?$/i.exec(token);
  if (!m) throw new Error(`Sélecteur non géré : ${token}`);
  const parts = m[2].match(/[.#][\w-]+/g) ?? [];
  return {
    tag: m[1]?.toLowerCase() ?? null,
    id: parts.find((p) => p.startsWith('#'))?.slice(1) ?? null,
    classes: parts.filter((p) => p.startsWith('.')).map((p) => p.slice(1)),
    nthChild: m[3] === 'nth-child' ? Number(m[4]) : null,
    nthOfType: m[3] === 'nth-of-type' ? Number(m[4]) : null,
  };
}

export function parseSelector(selector: string): Step[] {
  return selector
    .split(/\s+/)
    .filter((t) => t !== '>' && t !== '')
    .map(parseStep);
}

function apply(node: Node, step: Step, selector: string): Node {
  const tag = step.tag ?? 'div';
  if (node.filler) {
    node.filler = false;
    node.tag = tag;
  } else if (node.tag !== tag && step.tag !== null) {
    throw new Error(`Conflit de balise (${node.tag} / ${tag}) pour ${selector}`);
  }
  if (step.id) node.id = step.id;
  step.classes.forEach((c) => node.classes.add(c));
  return node;
}

function child(parent: Node, step: Step, selector: string): Node {
  const tag = step.tag ?? 'div';
  if (step.nthChild !== null) {
    while (parent.children.length < step.nthChild) parent.children.push(newNode('span', true));
    return apply(parent.children[step.nthChild - 1], step, selector);
  }
  if (step.nthOfType !== null) {
    let same = parent.children.filter((c) => c.tag === tag);
    while (same.length < step.nthOfType) {
      parent.children.push(newNode(tag));
      same = parent.children.filter((c) => c.tag === tag);
    }
    return apply(same[step.nthOfType - 1], step, selector);
  }
  const existing = parent.children.find(
    (c) =>
      !c.filler &&
      (step.tag === null || c.tag === tag) &&
      (step.id === null || c.id === step.id) &&
      step.classes.every((cl) => c.classes.has(cl)),
  );
  if (existing) return existing;
  const created = newNode(tag);
  parent.children.push(created);
  return apply(created, step, selector);
}

function render(node: Node): string {
  const attrs = [
    node.id ? ` id="${node.id}"` : '',
    node.classes.size ? ` class="${[...node.classes].join(' ')}"` : '',
    ...Object.entries(node.attrs).map(([k, v]) => ` ${k}="${v}"`),
  ].join('');
  if (VOID.has(node.tag)) {
    if (node.children.length || node.html) throw new Error(`<${node.tag}> ne peut pas avoir de contenu`);
    return `<${node.tag}${attrs}>`;
  }
  return `<${node.tag}${attrs}>${node.html ?? ''}${node.children.map(render).join('')}</${node.tag}>`;
}

export function buildHtml(fills: Fill[]): string {
  const root = newNode('body');
  // Le premier élément d'un sélecteur peut être n'importe où dans la page : chaque début de
  // sélecteur différent reçoit son propre conteneur, pour que les positions ne se mélangent pas.
  const containers = new Map<string, Node>();
  for (const fill of fills) {
    const first = fill.selector.trim().split(/\s+/)[0];
    let node = containers.get(first);
    if (!node) {
      node = newNode('div');
      root.children.push(node);
      containers.set(first, node);
    }
    for (const step of parseSelector(fill.selector)) node = child(node, step, fill.selector);
    if (fill.html !== undefined) {
      if (node.html !== null && node.html !== fill.html) throw new Error(`Contenu en double pour ${fill.selector}`);
      node.html = fill.html;
    }
    Object.assign(node.attrs, fill.attrs ?? {});
  }
  return `<html>${render(root)}</html>`;
}
