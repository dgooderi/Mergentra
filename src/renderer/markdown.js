// Notes support a deliberately small subset of Markdown: paragraphs, line breaks, bold and lists.
// marked only tokenises the text. The result is a plain data tree that is built into DOM nodes
// with textContent, so note text can never be interpreted as HTML.
import { Marked } from '../../node_modules/marked/lib/marked.esm.js';

const marked = new Marked({ gfm: false });

function textWithBreaks(value) {
  const nodes = [];
  value.split('\n').forEach((line, index) => {
    if (index > 0) {
      nodes.push({ type: 'br' });
    }
    if (line) {
      nodes.push({ type: 'text', text: line });
    }
  });
  return nodes;
}

function inlineNodes(tokens) {
  return tokens.flatMap((token) => {
    switch (token.type) {
      case 'strong':
        return [{ type: 'strong', children: inlineNodes(token.tokens) }];
      case 'br':
        return [{ type: 'br' }];
      case 'text':
        return token.tokens ? inlineNodes(token.tokens) : textWithBreaks(token.text);
      case 'escape':
        return [{ type: 'text', text: token.text }];
      default:
        return textWithBreaks(token.raw);
    }
  });
}

function listBlock(token) {
  return {
    type: 'list',
    ordered: token.ordered,
    items: token.items.map((item) => {
      const children = [];
      const lists = [];
      for (const child of item.tokens) {
        if (child.type === 'list') {
          lists.push(listBlock(child));
        } else if (child.type === 'text' || child.type === 'paragraph') {
          children.push(...inlineNodes(child.tokens ?? [{ type: 'text', text: child.text }]));
        } else if (child.type !== 'space') {
          children.push(...textWithBreaks(child.raw.trimEnd()));
        }
      }
      return { children, lists };
    })
  };
}

export function markdownToBlocks(source) {
  const blocks = [];
  for (const token of marked.lexer(source ?? '')) {
    if (token.type === 'space') {
      continue;
    }
    if (token.type === 'list') {
      blocks.push(listBlock(token));
    } else if (token.type === 'paragraph') {
      blocks.push({ type: 'paragraph', children: inlineNodes(token.tokens) });
    } else {
      const raw = token.raw.replace(/\s+$/, '');
      if (raw) {
        blocks.push({ type: 'paragraph', children: textWithBreaks(raw) });
      }
    }
  }
  return blocks;
}

function inlineText(nodes) {
  return nodes
    .map((node) =>
      node.type === 'br' ? '\n' : node.type === 'text' ? node.text : inlineText(node.children)
    )
    .join('');
}

function listLines(list, depth) {
  const indent = '  '.repeat(depth);
  return list.items.flatMap((item, index) => [
    `${indent}${list.ordered ? `${index + 1}.` : '•'} ${inlineText(item.children)}`,
    ...item.lists.flatMap((nested) => listLines(nested, depth + 1))
  ]);
}

// Readable text without Markdown symbols, for places that cannot show formatting (tooltips).
export function markdownToPlainText(source) {
  return markdownToBlocks(source)
    .flatMap((block) =>
      block.type === 'list' ? listLines(block, 0) : [inlineText(block.children)]
    )
    .join('\n');
}

function appendInline(parent, nodes) {
  for (const node of nodes) {
    if (node.type === 'br') {
      parent.append(document.createElement('br'));
    } else if (node.type === 'strong') {
      const strong = document.createElement('strong');
      appendInline(strong, node.children);
      parent.append(strong);
    } else {
      parent.append(document.createTextNode(node.text));
    }
  }
}

function listElement(list) {
  const element = document.createElement(list.ordered ? 'ol' : 'ul');
  for (const item of list.items) {
    const listItem = document.createElement('li');
    appendInline(listItem, item.children);
    for (const nested of item.lists) {
      listItem.append(listElement(nested));
    }
    element.append(listItem);
  }
  return element;
}

export function renderMarkdown(source, container) {
  container.replaceChildren();
  for (const block of markdownToBlocks(source)) {
    if (block.type === 'list') {
      container.append(listElement(block));
    } else {
      const paragraph = document.createElement('p');
      appendInline(paragraph, block.children);
      container.append(paragraph);
    }
  }
}
