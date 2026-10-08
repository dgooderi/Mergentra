import { describe, expect, it } from 'vitest';
import { markdownToBlocks, markdownToPlainText } from '../../src/renderer/markdown.js';

const text = (value) => ({ type: 'text', text: value });

describe('markdownToBlocks', () => {
  it('returns no blocks for empty text', () => {
    expect(markdownToBlocks('')).toEqual([]);
    expect(markdownToBlocks('  \n ')).toEqual([]);
  });

  it('renders paragraphs and bold', () => {
    expect(markdownToBlocks('plain **bold** end')).toEqual([
      {
        type: 'paragraph',
        children: [text('plain '), { type: 'strong', children: [text('bold')] }, text(' end')]
      }
    ]);
  });

  it('separates paragraphs and keeps line breaks', () => {
    expect(markdownToBlocks('one\ntwo\n\nthree')).toEqual([
      { type: 'paragraph', children: [text('one'), { type: 'br' }, text('two')] },
      { type: 'paragraph', children: [text('three')] }
    ]);
  });

  it('renders bulleted and numbered lists', () => {
    const [bulleted] = markdownToBlocks('- a\n- **b**');
    expect(bulleted).toMatchObject({ type: 'list', ordered: false });
    expect(bulleted.items).toHaveLength(2);
    expect(bulleted.items[1].children).toEqual([{ type: 'strong', children: [text('b')] }]);
    const [numbered] = markdownToBlocks('1. first\n2. second');
    expect(numbered).toMatchObject({ type: 'list', ordered: true });
    expect(numbered.items.map((item) => item.children)).toEqual([
      [text('first')],
      [text('second')]
    ]);
  });

  it('supports a nested list', () => {
    const [list] = markdownToBlocks('- a\n  - b');
    expect(list.items[0].children).toEqual([text('a')]);
    expect(list.items[0].lists[0].items[0].children).toEqual([text('b')]);
  });

  it.each([
    ['# Heading', '# Heading'],
    ['[click](javascript:alert(1))', '[click](javascript:alert(1))'],
    ['![pic](http://x/y.png)', '![pic](http://x/y.png)'],
    ['<script>alert(1)</script>', '<script>alert(1)</script>'],
    ['<img src=x onerror=alert(1)>', '<img src=x onerror=alert(1)>'],
    ['`code` and *em*', '`code` and *em*'],
    ['```\nblock\n```', '```\nblock\n```']
  ])('shows %j as plain text, never as markup', (source, expected) => {
    const blocks = markdownToBlocks(source);
    const flatten = (node) =>
      node.type === 'text'
        ? node.text
        : node.type === 'br'
          ? '\n'
          : (node.children ?? []).map(flatten).join('');
    expect(blocks.every((block) => block.type === 'paragraph')).toBe(true);
    expect(blocks.map(flatten).join('')).toBe(expected);
  });

  it('only ever produces the allowed node types', () => {
    const allowed = new Set(['paragraph', 'list', 'text', 'strong', 'br']);
    const walk = (node) => {
      expect(allowed.has(node.type)).toBe(true);
      for (const child of node.children ?? []) walk(child);
      for (const item of node.items ?? []) {
        for (const child of item.children) walk(child);
        for (const list of item.lists) walk(list);
      }
    };
    markdownToBlocks(
      '<b>x</b> **y** [l](u)\n\n- <i>a</i>\n\n> quote\n\n| a |\n|---|\n| b |'
    ).forEach(walk);
  });
});

describe('markdownToPlainText', () => {
  it('removes markers for tooltips', () => {
    expect(markdownToPlainText('**Important** note\n\n- one\n- two\n\n1. a\n2. b')).toBe(
      'Important note\n\u2022 one\n\u2022 two\n1. a\n2. b'
    );
  });

  it('leaves ordinary text unchanged', () => {
    expect(markdownToPlainText('just a note')).toBe('just a note');
    expect(markdownToPlainText('')).toBe('');
  });
});
