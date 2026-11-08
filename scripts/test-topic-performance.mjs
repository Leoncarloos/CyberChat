import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const source = readFileSync(new URL('../lib/topicPerformance.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
const { rankTopics, topicScore } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const topics = ['zero', 'full', 'half', 'empty', 'full2', 'missing'].map(key => ({ key }));
const performance = { zero: { correct: 0, total: 2 }, full: { correct: 2, total: 2 },
  half: { correct: 1, total: 2 }, empty: { correct: 0, total: 0 }, full2: { correct: 2, total: 2 } };
const ranked = rankTopics(topics, performance);
assert.deepEqual(ranked.map(t => t.key), ['full', 'full2', 'half', 'zero', 'empty', 'missing']);
assert.equal(topics[0].key, 'zero');
assert.deepEqual(ranked.filter(t => topicScore(performance[t.key]) === 1).map(t => t.key), ['full', 'full2']);
assert.deepEqual(ranked.filter(t => { const s = topicScore(performance[t.key]); return s >= 0 && s < 1; }).map(t => t.key), ['half', 'zero']);
const page = readFileSync(new URL('../app/dashboard/page.tsx', import.meta.url), 'utf8');
assert(page.includes('data.currentTopicsPerformance ?? data.diagnostic?.topicsPerformance'));
assert(page.includes('const perf = topicPerformance[topic.key]'));
console.log('PASS: descending scores, stable ties, no mutation, empty excluded from strengths/weaknesses, matching dashboard source.');
