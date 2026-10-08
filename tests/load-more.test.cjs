const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function fixture() {
  const source = fs.readFileSync('src/app/shared/load-more.directive.ts', 'utf8')
    .replace(/^import .*;\n/m, '')
    .replace(/^@Directive\(.*\)\n/m, '')
    .replace(/@(Input|Output)\(\) /g, '')
    .replace('export class', 'class');
  let frameId = 0, emitted = 0, paused = false, observerCallback;
  let rect = { top: 500, bottom: 564, width: 400, height: 64 };
  const frames = new Map(), listeners = new Map();
  const window = {
    innerHeight: 800,
    addEventListener: (name, fn) => listeners.set(name, fn),
    removeEventListener: name => listeners.delete(name)
  };
  let disconnected = false;
  const Directive = vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText + '\nLoadMoreDirective', {
    window,
    document: { documentElement: { hasAttribute: () => paused } },
    EventEmitter: class { emit() { emitted++; } },
    IntersectionObserver: class {
      constructor(fn) { observerCallback = fn; }
      observe() {}
      disconnect() { disconnected = true; }
    },
    requestAnimationFrame: fn => { frames.set(++frameId, fn); return frameId; },
    cancelAnimationFrame: id => frames.delete(id)
  });
  const directive = new Directive({ nativeElement: { getBoundingClientRect: () => rect } }, {
    run: fn => fn(), runOutsideAngular: fn => fn()
  });
  const flush = () => { const pending = [...frames.values()]; frames.clear(); pending.forEach(fn => fn()); };
  const busy = value => { directive.loadMoreBusy = value; directive.ngOnChanges(); };
  directive.ngAfterViewInit();
  return { directive, flush, busy, frames, listeners, emitted: () => emitted,
    disconnected: () => disconnected, pause: value => paused = value,
    move: top => rect = { ...rect, top, bottom: top + 64 }, observe: () => observerCallback() };
}

test('continues after a batch while sentinel remains visible, without duplicate loads', () => {
  const f = fixture();
  f.flush();
  assert.equal(f.emitted(), 1);
  f.observe(); f.flush();
  assert.equal(f.emitted(), 1);
  f.busy(true); f.listeners.get('scroll')(); f.flush();
  assert.equal(f.emitted(), 1);
  f.busy(false); f.flush();
  assert.equal(f.emitted(), 2);
  f.busy(true); f.move(1500); f.busy(false); f.flush();
  assert.equal(f.emitted(), 2);
  f.move(850); f.listeners.get('scroll')(); f.flush();
  assert.equal(f.emitted(), 3);
});

test('suppresses Contact Us scrolling and resumes on manual scroll without an intersection change', () => {
  const f = fixture();
  f.pause(true); f.flush();
  assert.equal(f.emitted(), 0);
  f.pause(false); f.listeners.get('scroll')(); f.flush();
  assert.equal(f.emitted(), 1);
});

test('does not load when catalog end is offscreen; removes pending callbacks on destroy', () => {
  const f = fixture();
  f.move(-100); f.flush();
  assert.equal(f.emitted(), 0);
  f.move(2000); f.observe(); f.flush();
  assert.equal(f.emitted(), 0);
  f.move(500); f.listeners.get('scroll')();
  f.directive.ngOnDestroy(); f.flush();
  assert.equal(f.emitted(), 0);
  assert.equal(f.frames.size, 0);
  assert.equal(f.listeners.size, 0);
  assert.equal(f.disconnected(), true);
});
