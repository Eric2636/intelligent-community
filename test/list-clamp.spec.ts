import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const root = process.cwd();

const pageContracts = [
  {
    file: 'pages/task/index',
    loops: [
      {
        expression: '{{list}}',
        loopClass: 'task-card',
        title: ['task-card__title', /card\.title\b/],
        description: ['task-card__desc', /card\.desc\b/],
      },
    ],
    widthSafe: ['task-card', 'task-card__meta-row'],
  },
  {
    file: 'pages/forum/index',
    loops: [
      {
        expression: '{{announcements}}',
        loopTag: 'swiper-item',
        cardClass: 'forum-announcement__item',
        title: ['forum-announcement__title', /item\.title\b/],
        description: ['forum-announcement__summary', /item\.summary\b/],
      },
      {
        expression: '{{pinned}}',
        loopClass: 'post-item',
        title: ['post-item__title', /item\.title\b/],
      },
      {
        expression: '{{displayList}}',
        loopClass: 'post-item',
        title: ['post-item__title', /item\.title\b/],
      },
      {
        expression: '{{list}}',
        loopClass: 'post-item',
        title: ['post-item__title', /item\.title\b/],
      },
    ],
    widthSafe: ['forum-announcement__item', 'post-item', 'post-item__author-row'],
  },
  {
    file: 'pages/mall/index',
    loops: [
      {
        expression: '{{list}}',
        loopClass: 'mall-card',
        title: ['mall-card__title', /item\.title\b/],
      },
    ],
    widthSafe: ['mall-card', 'mall-card__main', 'mall-card__meta'],
  },
  {
    file: 'packageTask/my-tasks/index',
    loops: ['publishedList', 'draftList', 'cancelledList', 'takenList'].map((collection) => ({
      expression: `{{${collection}}}`,
      loopClass: 'task-card',
      title: ['task-card__title', /card\.title\b/],
      description: ['task-card__desc', /card\.desc\b/],
    })),
    widthSafe: ['task-card', 'task-card__meta-row'],
  },
  {
    file: 'packageForum/my-posts/index',
    loops: [
      {
        expression: '{{postList}}',
        loopClass: 'post-card',
        title: ['post-title', /item\.title\b/],
        description: ['post-content', /item\.content\b/],
      },
    ],
    widthSafe: ['post-card', 'post-meta'],
  },
  {
    file: 'packageForum/favorites/index',
    loops: [
      {
        expression: '{{list}}',
        loopClass: 'favorites-item',
        title: ['favorites-item__title', /item\.title\b/],
      },
    ],
    widthSafe: ['favorites-item', 'favorites-item__meta'],
  },
  {
    file: 'packageMall/my-list/index',
    loops: [
      {
        expression: '{{itemList}}',
        loopClass: 'item-card',
        title: ['item-title', /item\.title\b/],
      },
    ],
    widthSafe: ['item-card', 'item-info'],
  },
  {
    file: 'packageMall/favorites/index',
    loops: [
      {
        expression: '{{list}}',
        loopClass: 'fav-item',
        title: ['fav-item__title', /item\.title\b/],
      },
    ],
    widthSafe: ['fav-item', 'fav-item__main', 'fav-item__meta'],
  },
  {
    file: 'packageMall/order-list/index',
    loops: ['buyList', 'sellList'].map((collection) => ({
      expression: `{{${collection}}}`,
      loopClass: 'order-card',
      title: ['order-card__title', /item\.itemTitle\b/],
    })),
    widthSafe: ['order-card'],
  },
  {
    file: 'packageCommon/notice/index',
    loops: [
      {
        expression: '{{noticeList}}',
        loopClass: 'notice-card',
        title: ['notice-title', /item\.title\b/],
        description: ['notice-content', /item\.content\b/],
      },
    ],
    widthSafe: ['notice-card', 'notice-header'],
  },
];

const flexContracts = [
  {
    file: 'pages/task/index',
    rows: [
      ['task-card__meta-row', ['task-card__publisher'], [], ['task-card__reward']],
      [
        'task-card__publisher',
        [],
        ['task-card__publisher-name'],
        ['task-card__publisher-avatar', 'identity-tag'],
      ],
      ['task-card__foot', [], [], ['task-card__meta']],
    ],
  },
  {
    file: 'pages/forum/index',
    rows: [
      ['forum-announcement__head', [], [], ['forum-announcement__count']],
      ['post-item__author-row', ['post-item__author-main'], [], []],
      [
        'post-item__author-main',
        [],
        ['post-item__author-name'],
        ['post-item__avatar', 'identity-tag'],
      ],
      ['post-item__actions', ['post-item__action'], [], []],
      ['post-item__action', [], ['post-item__action-count'], ['post-item__action-icon']],
    ],
  },
  {
    file: 'pages/mall/index',
    rows: [
      ['mall-card', ['mall-card__main'], [], ['mall-card__thumb']],
      ['mall-card__meta', [], ['mall-card__price'], ['mall-card__time']],
    ],
  },
  {
    file: 'packageTask/my-tasks/index',
    rows: [
      ['task-card__meta-row', ['task-card__publisher'], [], ['task-card__reward']],
      [
        'task-card__publisher',
        [],
        ['task-card__publisher-name'],
        ['task-card__publisher-avatar', 'identity-tag'],
      ],
    ],
  },
  {
    file: 'packageForum/my-posts/index',
    rows: [['post-meta', [], ['post-meta__time'], ['post-meta__reply-count']]],
  },
  {
    file: 'packageForum/favorites/index',
    rows: [
      [
        'favorites-item__meta',
        [],
        ['favorites-item__time'],
        ['favorites-item__count'],
      ],
    ],
  },
  {
    file: 'packageMall/favorites/index',
    rows: [
      ['fav-item', ['fav-item__main'], [], ['fav-item__thumb', 'fav-item__arrow']],
      ['fav-item__meta', [], ['fav-item__price'], ['fav-item__time']],
    ],
  },
  {
    file: 'packageCommon/notice/index',
    rows: [['notice-header', [], [], ['notice-type', 'notice-time']]],
  },
];

const boundedFixedTextContracts = [
  ['pages/task/index', ['task-card__reward', 'task-card__meta', 'identity-tag']],
  ['pages/forum/index', ['forum-announcement__count', 'identity-tag']],
  ['pages/mall/index', ['mall-card__time']],
  ['packageTask/my-tasks/index', ['task-card__reward', 'identity-tag']],
  ['packageForum/my-posts/index', ['post-meta__reply-count']],
  ['packageForum/favorites/index', ['favorites-item__count']],
  ['packageMall/favorites/index', ['fav-item__time']],
  ['packageCommon/notice/index', ['notice-type', 'notice-time']],
];

const nonFlexMetadataContracts = [
  ['packageTask/my-tasks/index', ['task-card__meta']],
  ['packageMall/my-list/index', ['item-status', 'item-price', 'item-category']],
  [
    'packageMall/order-list/index',
    ['order-card__price', 'order-card__status', 'order-card__time'],
  ],
];

async function source(file) {
  return readFile(path.join(root, file), 'utf8');
}

async function walk(directory) {
  const entries = await readdir(path.join(root, directory), { withFileTypes: true });
  const children = await Promise.all(
    entries
      .filter((entry) => !['miniprogram_npm', 'node_modules', 'packageErrand'].includes(entry.name))
      .map(async (entry) => {
        const relative = path.posix.join(directory, entry.name);
        return entry.isDirectory() ? walk(relative) : [relative];
      }),
  );
  return children.flat();
}

function scanTags(template) {
  const tags = [];
  let cursor = 0;
  while (cursor < template.length) {
    const start = template.indexOf('<', cursor);
    if (start === -1) break;
    if (template.startsWith('<!--', start)) {
      const commentEnd = template.indexOf('-->', start + 4);
      cursor = commentEnd === -1 ? template.length : commentEnd + 3;
    } else {
      let quote = '';
      let end = start + 1;
      for (; end < template.length; end += 1) {
        const character = template[end];
        if (quote) {
          if (character === quote) quote = '';
        } else if (character === '"' || character === "'") {
          quote = character;
        } else if (character === '>') {
          break;
        }
      }
      if (end >= template.length) break;
      tags.push({ start, end: end + 1, raw: template.slice(start, end + 1) });
      cursor = end + 1;
    }
  }
  return tags;
}

function parseAttributes(raw) {
  const attributes = {};
  [...raw.matchAll(/([:\w-]+)\s*=\s*"([^"]*)"/g)].forEach((match) => {
    const [, name, value] = match;
    attributes[name] = value;
  });
  return attributes;
}

function parseTemplate(template) {
  const rootNode = { tag: '#root', attrs: {}, children: [], directText: '', parent: null };
  const stack = [rootNode];
  let previousEnd = 0;

  scanTags(template).forEach((token) => {
    stack[stack.length - 1].directText += template.slice(previousEnd, token.start);
    previousEnd = token.end;
    if (/^<\//.test(token.raw)) {
      const closeTag = (token.raw.match(/^<\/([:\w-]+)/) || [])[1];
      while (stack.length > 1) {
        const closed = stack.pop();
        if (closed.tag === closeTag) break;
      }
      return;
    }
    if (/^<!/.test(token.raw)) return;

    const tag = (token.raw.match(/^<([:\w-]+)/) || [])[1];
    if (!tag) return;
    const parent = stack[stack.length - 1];
    const node = {
      tag,
      attrs: parseAttributes(token.raw),
      raw: token.raw,
      children: [],
      directText: '',
      parent,
      start: token.start,
    };
    parent.children.push(node);
    if (!/\/>\s*$/.test(token.raw)) stack.push(node);
  });
  stack[stack.length - 1].directText += template.slice(previousEnd);
  return rootNode;
}

function staticClasses(node) {
  const rawClass = node.attrs.class || '';
  return rawClass
    .replace(/\{\{[\s\S]*?\}\}/g, '')
    .split(/\s+/)
    .filter(Boolean);
}

function hasClass(node, className) {
  return staticClasses(node).includes(className);
}

function descendants(node) {
  return node.children.reduce(
    (all, child) => all.concat(child, descendants(child)),
    [],
  );
}

function allNodes(rootNode) {
  return descendants(rootNode);
}

function isHiddenOrSkeleton(node, loopNode) {
  let current = node;
  while (current && current !== loopNode.parent) {
    const hiddenAttribute = /\shidden(?:\s|=|\/?>)/.test(current.raw || '');
    const falseCondition = current.attrs['wx:if'] === '{{false}}';
    const skeletonClass = staticClasses(current).some((className) =>
      /(?:^|[-_])(?:skeleton|loading|hidden)(?:$|[-_])/.test(className),
    );
    if (hiddenAttribute || falseCondition || skeletonClass) return true;
    current = current.parent;
  }
  return false;
}

function findDataNode(loopNode, dataContract) {
  const [className, bindingPattern] = dataContract;
  return [loopNode].concat(descendants(loopNode)).find(
    (node) =>
      hasClass(node, className) &&
      bindingPattern.test(node.directText) &&
      !isHiddenOrSkeleton(node, loopNode),
  );
}

function validatePageContract(template, pageContract) {
  const tree = parseTemplate(template);
  const nodes = allNodes(tree);
  const matchedLoops = [];

  pageContract.loops.forEach((loopContract) => {
    const loops = nodes.filter((node) => {
      if (node.attrs['wx:for'] !== loopContract.expression) return false;
      if (loopContract.loopTag && node.tag !== loopContract.loopTag) return false;
      if (loopContract.loopClass && !hasClass(node, loopContract.loopClass)) return false;
      return true;
    });
    assert.equal(
      loops.length,
      1,
      `${pageContract.file} 必须且只能有一个 ${loopContract.expression} 业务卡片循环`,
    );
    const loopNode = loops[0];
    if (loopContract.cardClass) {
      assert.ok(
        descendants(loopNode).some((node) => hasClass(node, loopContract.cardClass)),
        `${loopContract.expression} 循环内部缺少 ${loopContract.cardClass} 卡片`,
      );
    }
    assert.ok(
      findDataNode(loopNode, loopContract.title),
      `${loopContract.expression} 循环内部真实标题绑定必须携带 ${loopContract.title[0]}`,
    );
    if (loopContract.description) {
      assert.ok(
        findDataNode(loopNode, loopContract.description),
        `${loopContract.expression} 循环内部真实摘要绑定必须携带 ${loopContract.description[0]}`,
      );
    }
    matchedLoops.push(loopNode);
  });

  return { tree, matchedLoops };
}

function isInteractiveCard(node) {
  const classes = staticClasses(node);
  const cardLike = classes.some((className) =>
    /(?:^|[-_])(?:card|item)(?:$|[-_])/.test(className),
  );
  const interactive = ['bindtap', 'bind:tap', 'catchtap'].some((name) => node.attrs[name]);
  return cardLike && interactive;
}

function discoverBusinessLoops(template) {
  const tree = parseTemplate(template);
  return allNodes(tree).filter((loopNode) => {
    if (!loopNode.attrs['wx:for']) return false;
    const scope = [loopNode].concat(descendants(loopNode));
    return scope.filter(isInteractiveCard).some((cardNode) =>
      [cardNode].concat(descendants(cardNode)).some((node) =>
        /\{\{[\s\S]*\.(?:title|itemTitle|content|desc|summary)\b/.test(node.directText),
      ),
    );
  });
}

function ruleBlocks(styles, selectorPattern) {
  const matches = [...styles.matchAll(selectorPattern)];
  return matches.map((match) => {
    const selectorIndex = match.index === undefined ? -1 : match.index;
    const openIndex = styles.indexOf('{', selectorIndex + match[0].length);
    assert.notEqual(openIndex, -1, 'LESS 规则缺少起始大括号');
    let depth = 0;
    for (let index = openIndex; index < styles.length; index += 1) {
      if (styles[index] === '{') depth += 1;
      if (styles[index] === '}') {
        depth -= 1;
        if (depth === 0) return styles.slice(openIndex + 1, index);
      }
    }
    assert.fail('LESS 规则缺少结束大括号');
    return '';
  });
}

function exactRuleBlocks(styles, className) {
  const escapedClass = className.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const selectorPattern = new RegExp(
    `(?:^|\\n)\\s*\\.${escapedClass}(?:\\(\\))?(?=\\s*[,\\{])`,
    'g',
  );
  return ruleBlocks(styles, selectorPattern);
}

function extractRule(styles, className) {
  const blocks = exactRuleBlocks(styles, className);
  assert.ok(blocks.length > 0, `LESS 缺少 .${className} 规则`);
  return blocks.join('\n');
}

function extractResolvedClassRule(styles, className) {
  const blocks = exactRuleBlocks(styles, className);
  const bemIndex = className.indexOf('__');
  if (bemIndex !== -1) {
    const baseClass = className.slice(0, bemIndex);
    const nestedSelector = `&${className.slice(bemIndex)}`;
    const escapedSelector = nestedSelector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const nestedPattern = new RegExp(
      `(?:^|\\n)\\s*${escapedSelector}(?=\\s*[,\\{])`,
      'g',
    );
    exactRuleBlocks(styles, baseClass).forEach((baseBlock) => {
      blocks.push(...ruleBlocks(baseBlock, nestedPattern));
    });
  }
  assert.ok(blocks.length > 0, `LESS 缺少可解析的 .${className} 规则`);
  return blocks.join('\n');
}

test('shared list mixins define exact title, description and narrow-screen text behavior', async () => {
  const variables = await source('variable.less');
  const widthMixin = extractRule(variables, 'list-width-safe');
  assert.match(widthMixin, /min-width:\s*0\s*;/);
  assert.match(widthMixin, /max-width:\s*100%\s*;/);

  const singleLineMixin = extractRule(variables, 'list-single-line-ellipsis');
  assert.match(singleLineMixin, /\.list-width-safe\(\)\s*;/);
  assert.match(singleLineMixin, /overflow:\s*hidden\s*;/);
  assert.match(singleLineMixin, /text-overflow:\s*ellipsis\s*;/);
  assert.match(singleLineMixin, /white-space:\s*nowrap\s*;/);

  const titleMixin = extractRule(variables, 'list-title-clamp');
  assert.match(titleMixin, /\.list-single-line-ellipsis\(\)\s*;/);
  assert.match(titleMixin, /display:\s*block\s*;/);

  const descriptionMixin = extractRule(variables, 'list-description-clamp');
  assert.match(descriptionMixin, /-webkit-line-clamp:\s*3\s*;/);
  assert.match(descriptionMixin, /\.list-width-safe\(\)\s*;/);

  const flexibleMixin = extractRule(variables, 'list-flexible-text');
  assert.match(flexibleMixin, /flex:\s*1\s*;/);
  assert.match(flexibleMixin, /\.list-single-line-ellipsis\(\)\s*;/);

  const flexibleRegionMixin = extractRule(variables, 'list-flexible-region');
  assert.match(flexibleRegionMixin, /flex:\s*1\s*;/);
  assert.match(flexibleRegionMixin, /\.list-width-safe\(\)\s*;/);
});

test('every manifest entry validates the real card loop and bound title or description node', async () => {
  await Promise.all(
    pageContracts.map(async (pageContract) => {
      const [template, styles] = await Promise.all([
        source(`${pageContract.file}.wxml`),
        source(`${pageContract.file}.less`),
      ]);
      validatePageContract(template, pageContract);
      pageContract.loops.forEach((loopContract) => {
        assert.match(
          extractRule(styles, loopContract.title[0]),
          /\.list-title-clamp\(\)\s*;/,
        );
        if (loopContract.description) {
          assert.match(
            extractRule(styles, loopContract.description[0]),
            /\.list-description-clamp\(\)\s*;/,
          );
        }
      });
      pageContract.widthSafe.forEach((className) => {
        assert.match(
          extractRule(styles, className),
          /\.(?:list-width-safe|list-flexible-region)\(\)\s*;/,
        );
      });
    }),
  );
});

test('residual scan finds all interactive business-card loops without collection-name whitelist', async () => {
  const files = (await walk('.')).filter(
    (file) =>
      file.endsWith('.wxml') &&
      !/(?:\/detail\/|\/publish\/|packageForum\/post\/|components\/|templates\/)/.test(file),
  );
  const manifestByFile = new Map(pageContracts.map((contract) => [`${contract.file}.wxml`, contract]));

  await Promise.all(
    files.map(async (file) => {
      const template = await source(file);
      const discovered = discoverBusinessLoops(template);
      const pageContract = manifestByFile.get(file);
      const matched = pageContract
        ? new Set(validatePageContract(template, pageContract).matchedLoops.map((node) => node.start))
        : new Set();
      discovered.forEach((loopNode) => {
        assert.ok(matched.has(loopNode.start), `${file} 存在未纳入 manifest 的业务卡片循环`);
      });
    }),
  );
});

test('flex contracts target direct children and never mark a flex parent as fixed', async () => {
  await Promise.all(
    flexContracts.map(async ({ file, rows }) => {
      const [template, styles] = await Promise.all([
        source(`${file}.wxml`),
        source(`${file}.less`),
      ]);
      const tree = parseTemplate(template);
      const nodes = allNodes(tree);

      rows.forEach(
        ([parentClass, flexibleRegions, flexibleTexts, fixedChildren]) => {
        const parentRule = extractResolvedClassRule(styles, parentClass);
        assert.match(parentRule, /display:\s*(?:inline-)?flex\s*;/);
        assert.doesNotMatch(parentRule, /\.list-fixed-region\(\)\s*;/);
        flexibleRegions.forEach((childClass) => {
          const matchingChildren = nodes.filter((node) => hasClass(node, childClass));
          assert.ok(matchingChildren.length > 0, `${file} 缺少 ${childClass}`);
          matchingChildren.forEach((node) => {
            assert.ok(
              node.parent && hasClass(node.parent, parentClass),
              `${file} 的 ${childClass} 必须是 ${parentClass} 的直接子项`,
            );
          });
          assert.match(
            extractResolvedClassRule(styles, childClass),
            /\.list-flexible-region\(\)\s*;/,
          );
        });
        flexibleTexts.forEach((childClass) => {
          const matchingChildren = nodes.filter((node) => hasClass(node, childClass));
          assert.ok(matchingChildren.length > 0, `${file} 缺少 ${childClass}`);
          matchingChildren.forEach((node) => {
            assert.ok(
              node.parent && hasClass(node.parent, parentClass),
              `${file} 的 ${childClass} 必须是 ${parentClass} 的直接子项`,
            );
          });
          assert.match(
            extractResolvedClassRule(styles, childClass),
            /\.list-flexible-text\(\)\s*;/,
          );
        });
        fixedChildren.forEach((childClass) => {
          const matchingChildren = nodes.filter((node) => hasClass(node, childClass));
          assert.ok(matchingChildren.length > 0, `${file} 缺少 ${childClass}`);
          matchingChildren.forEach((node) => {
            assert.ok(
              node.parent && hasClass(node.parent, parentClass),
              `${file} 的 ${childClass} 必须是 ${parentClass} 的直接子项`,
            );
          });
          assert.match(
            extractResolvedClassRule(styles, childClass),
            /\.list-fixed-region\(\)\s*;/,
          );
        });
        },
      );
    }),
  );
});

test('fixed flex text is bounded and non-flex metadata uses ellipsis without fixed semantics', async () => {
  await Promise.all(
    boundedFixedTextContracts.map(async ([file, classNames]) => {
      const styles = await source(`${file}.less`);
      classNames.forEach((className) => {
        const rule = extractResolvedClassRule(styles, className);
        assert.match(rule, /\.list-fixed-region\(\)\s*;/);
        assert.match(rule, /\.list-single-line-ellipsis\(\)\s*;/);
        assert.match(rule, /max-width:\s*[^;]+\s*;/);
      });
    }),
  );

  await Promise.all(
    nonFlexMetadataContracts.map(async ([file, classNames]) => {
      const styles = await source(`${file}.less`);
      classNames.forEach((className) => {
        const rule = extractResolvedClassRule(styles, className);
        assert.match(rule, /\.list-single-line-ellipsis\(\)\s*;/);
        assert.doesNotMatch(rule, /\.list-fixed-region\(\)\s*;/);
      });
    }),
  );
});

test('mutation guards reject title moved outside loop, changed collection and removed semantic class', async () => {
  const contract = pageContracts[0];
  const template = await source(`${contract.file}.wxml`);
  const titleNode = '<text class="task-card__title">{{card.title}}</text>';

  const movedTitle = `${template.replace(titleNode, '')}\n<view hidden>${titleNode}</view>`;
  assert.throws(() => validatePageContract(movedTitle, contract), /真实标题绑定/);

  const changedCollection = template.replace('wx:for="{{list}}"', 'wx:for="{{results.items}}"');
  assert.throws(() => validatePageContract(changedCollection, contract), /必须且只能有一个/);
  assert.equal(
    discoverBusinessLoops(changedCollection).some(
      (node) => node.attrs['wx:for'] === '{{results.items}}',
    ),
    true,
    '残留扫描必须识别复杂集合表达式',
  );

  const removedClass = template.replace(
    titleNode,
    '<text class="renamed-title">{{card.title}}</text>',
  );
  assert.throws(() => validatePageContract(removedClass, contract), /真实标题绑定/);

  const hiddenDecoy = template.replace(
    titleNode,
    '<view hidden><text class="task-card__title">{{card.title}}</text></view>',
  );
  assert.throws(() => validatePageContract(hiddenDecoy, contract), /真实标题绑定/);
});
