import type { LessonScene } from '../types/lessonScene'

function safeJsonForScript(scene: LessonScene): string {
  return JSON.stringify(scene)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
}

function exportEllipseSceneAsStandaloneHtml(scene: LessonScene): string {
  const sceneJson = safeJsonForScript(scene)
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${scene.metadata.title.replace(/[<>&"]/g, '')}</title>
  <style>
    :root { color-scheme: light; font-family: Inter, "PingFang SC", "Microsoft YaHei", system-ui, sans-serif; color: #1f2933; background: #eef1f6; }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; background: radial-gradient(circle at 15% 10%, #fff 0, #f5f7fb 34%, #eceff5 100%); }
    .page { max-width: 1240px; margin: 0 auto; padding: 32px 24px 48px; }
    header { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; margin-bottom: 24px; }
    h1 { margin: 4px 0 8px; font-size: clamp(24px, 3vw, 38px); letter-spacing: -.04em; }
    .eyebrow { color: #5b5bd6; font-size: 12px; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; }
    .summary { margin: 0; max-width: 720px; color: #63707d; line-height: 1.65; }
    .layout { display: grid; grid-template-columns: minmax(0, 1fr) 290px; gap: 18px; align-items: start; }
    .card { background: rgba(255,255,255,.94); border: 1px solid #dde2e9; border-radius: 22px; box-shadow: 0 18px 55px rgba(37,45,65,.08); }
    .stage { padding: 16px; }
    svg { display: block; width: 100%; touch-action: none; border-radius: 16px; }
    #point { cursor: grab; outline: none; }
    #point:active { cursor: grabbing; }
    .metrics { display: flex; gap: 10px; align-items: stretch; margin-top: 12px; }
    .metric { flex: 1; min-width: 0; padding: 12px 14px; border-radius: 14px; background: #f4f6fa; }
    .metric span { display: block; color: #73808e; font-size: 12px; margin-bottom: 3px; }
    .metric strong { font-size: 21px; font-variant-numeric: tabular-nums; }
    .metric.sum { background: #ecf7f4; color: #086b65; }
    .formula { display: flex; align-items: center; justify-content: space-between; gap: 18px; margin-bottom: 12px; padding: 15px 18px; border-radius: 15px; background: #28283e; color: white; }
    .formula strong { font-family: Georgia, serif; font-size: 21px; white-space: nowrap; }
    .formula span { color: #d2d5e4; font-size: 13px; line-height: 1.5; }
    .toolbar { display: flex; gap: 9px; margin-top: 14px; }
    .viewbar { display: flex; align-items: center; justify-content: flex-end; gap: 5px; margin: 0 0 8px; }
    .viewbar span { margin-right: 4px; color: #7c8793; font-size: 12px; }
    .viewbar button { min-width: 38px; padding: 7px 10px; color: #53606c; background: #edf0f5; }
    .viewbar output { min-width: 48px; text-align: center; color: #5b5bd6; font-size: 12px; font-weight: 750; }
    button { border: 0; border-radius: 12px; padding: 10px 16px; font: inherit; font-weight: 750; cursor: pointer; }
    .primary { color: white; background: #5b5bd6; }
    .secondary { color: #36404a; background: #edf0f5; }
    aside { padding: 20px; position: sticky; top: 18px; }
    aside h2 { margin: 2px 0 18px; font-size: 19px; }
    .control { padding: 14px 0; border-top: 1px solid #edf0f4; }
    .control:first-of-type { border-top: 0; }
    .control-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 10px; font-size: 13px; font-weight: 700; }
    output { color: #5b5bd6; font-variant-numeric: tabular-nums; }
    input[type="range"] { width: 100%; accent-color: #5b5bd6; }
    .toggle { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 8px 0; font-size: 13px; }
    .toggle input { width: 18px; height: 18px; accent-color: #5b5bd6; }
    .color { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding-top: 10px; font-size: 13px; }
    input[type="color"] { width: 44px; height: 30px; padding: 2px; border: 1px solid #d9dee6; border-radius: 8px; background: white; }
    footer { margin-top: 18px; color: #7a8693; font-size: 12px; text-align: center; }
    @media (max-width: 820px) { .page { padding: 20px 12px 34px; } .layout { grid-template-columns: 1fr; } aside { position: static; } .metrics { flex-wrap: wrap; } .metric { min-width: 120px; } header { display: block; } }
    @media (prefers-reduced-motion: reduce) { * { scroll-behavior: auto !important; } }
  </style>
</head>
<body>
  <main class="page">
    <header>
      <div><span class="eyebrow">Interactive Lesson</span><h1 id="title"></h1><p class="summary" id="summary"></p></div>
    </header>
    <div class="layout">
      <section class="card stage">
        <div class="formula" id="formula"><strong></strong><span></span></div>
        <div class="viewbar"><span>视图缩放</span><button id="zoom-out" type="button" aria-label="缩小">−</button><output id="zoom-output">100%</output><button id="zoom-in" type="button" aria-label="放大">+</button><button id="zoom-fit" type="button">适应</button></div>
        <svg id="plot" viewBox="0 0 900 590" role="img" aria-label="椭圆焦点距离和交互图"></svg>
        <div class="metrics">
          <div class="metric individual"><span>PF₁</span><strong id="distance-left">—</strong></div>
          <div class="metric individual"><span>PF₂</span><strong id="distance-right">—</strong></div>
          <div class="metric sum" id="sum-card"><span>PF₁ + PF₂</span><strong id="distance-sum">—</strong></div>
        </div>
        <div class="toolbar"><button class="primary" id="play" type="button">播放</button><button class="secondary" id="reset" type="button">重置</button></div>
      </section>
      <aside class="card">
        <span class="eyebrow">场景设置</span><h2>调整参数与显示</h2>
        <div class="control"><div class="control-head"><label for="major">长轴全长 2a</label><output id="major-output"></output></div><input id="major" type="range" step="0.5"></div>
        <div class="control"><div class="control-head"><label for="minor">短轴全长 2b</label><output id="minor-output"></output></div><input id="minor" type="range" step="0.5"></div>
        <div class="control"><div class="control-head"><label for="speed">动画速度</label><output id="speed-output"></output></div><input id="speed" type="range" min="0.2" max="2" step="0.05"></div>
        <div class="control" id="toggles"></div>
        <label class="color"><span>椭圆颜色</span><input id="curve-color" type="color"></label>
      </aside>
    </div>
    <footer>此文件由 Word2HTML 导出；参数计算和交互均在当前浏览器本地完成。</footer>
  </main>
  <script id="lesson-scene" type="application/json">${sceneJson}</script>
  <script>
    (function () {
      'use strict';
      var scene = JSON.parse(document.getElementById('lesson-scene').textContent);
      var initial = JSON.parse(JSON.stringify(scene));
      var angle = scene.parameters.pointAngle.value;
      var playing = false;
      var dragging = false;
      var zoom = 1;
      var lastFrame = 0;
      var trail = [];
      var width = 900, height = 590, padding = 24;
      var plot = document.getElementById('plot');
      var majorInput = document.getElementById('major');
      var minorInput = document.getElementById('minor');
      var speedInput = document.getElementById('speed');
      document.getElementById('title').textContent = scene.metadata.title;
      document.getElementById('summary').textContent = scene.metadata.summary;
      document.getElementById('formula').querySelector('strong').textContent = scene.annotations.formula;
      document.getElementById('formula').querySelector('span').textContent = scene.annotations.conclusion;

      function esc(value) { return String(value).replace(/[&<>"']/g, function (char) { return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[char]; }); }
      function geometry() {
        var major = scene.parameters.majorAxis.value;
        var minor = scene.parameters.minorAxis.value;
        var a = major / 2, b = minor / 2, c = Math.sqrt(Math.max(0, a * a - b * b));
        return { major: major, minor: minor, a: a, b: b, c: c };
      }
      function viewport(g) {
        var horizontal = Math.max(6, g.a * 1.35), vertical = Math.max(4.25, g.b * 1.65);
        return { xMin: -horizontal/zoom, xMax: horizontal/zoom, yMin: -vertical/zoom, yMax: vertical/zoom };
      }
      function mapper(v) {
        var plotWidth=width-padding*2,plotHeight=height-padding*2,target=plotWidth/plotHeight;
        var centerX=(v.xMin+v.xMax)/2,centerY=(v.yMin+v.yMax)/2,xSpan=v.xMax-v.xMin,ySpan=v.yMax-v.yMin;
        if(xSpan/ySpan<target)xSpan=ySpan*target;else ySpan=xSpan/target;
        v={xMin:centerX-xSpan/2,xMax:centerX+xSpan/2,yMin:centerY-ySpan/2,yMax:centerY+ySpan/2};
        var scale = Math.min((width - padding * 2) / xSpan, (height - padding * 2) / ySpan);
        var cw = xSpan * scale, ch = ySpan * scale, xo = (width - cw) / 2, yo = (height - ch) / 2;
        return {
          scale: scale, xo: xo, yo: yo, cw: cw, ch: ch, v: v,
          to: function (x, y) { return { x: xo + (x - v.xMin) * scale, y: yo + (v.yMax - y) * scale }; },
          from: function (x, y) { return { x: v.xMin + (x - xo) / scale, y: v.yMax - (y - yo) / scale }; }
        };
      }
      function gridStep(scale) { var raw=62/scale,power=Math.pow(10,Math.floor(Math.log10(raw))),n=raw/power,choices=[1,2,5,10],best=choices[0];choices.forEach(function(choice){if(Math.abs(choice-n)<Math.abs(best-n))best=choice;});return best*power; }
      function values(min, max, step) { var out = [], first = Math.ceil((min-step*1e-9) / step) * step; for (var n = first; n <= max + step * 1e-9; n += step) out.push(Number(n.toFixed(10))); return out; }
      function coordinate(value, step) { if(Math.abs(value)<step*1e-8)return '0';var decimals=step>=1?0:Math.min(3,Math.ceil(-Math.log10(step)));return String(Number(value.toFixed(decimals))); }
      function snapshot(g) {
        var p = { x: g.a * Math.cos(angle), y: g.b * Math.sin(angle) };
        var dl = Math.hypot(p.x + g.c, p.y), dr = Math.hypot(p.x - g.c, p.y);
        return { p: p, dl: dl, dr: dr, sum: dl + dr };
      }
      function render() {
        var g = geometry(), m = mapper(viewport(g)), v=m.v, s = snapshot(g), ap = scene.appearance;
        var p = m.to(s.p.x, s.p.y), fl = m.to(-g.c, 0), fr = m.to(g.c, 0), o = m.to(0, 0);
        var squareStep=gridStep(m.scale), xTicks=values(v.xMin,v.xMax,squareStep), yTicks=values(v.yMin,v.yMax,squareStep), stride=Math.max(1,Math.ceil(42/(squareStep*m.scale)));
        var parts = ['<rect width="900" height="590" rx="18" fill="#fbfcfe"/>'];
        if (ap.showGrid) {
          xTicks.forEach(function (x) { var px=m.to(x,0).x; parts.push('<line x1="'+px+'" x2="'+px+'" y1="'+m.yo+'" y2="'+(m.yo+m.ch)+'" stroke="#e7eaf0"/>'); });
          yTicks.forEach(function (y) { var py=m.to(0,y).y; parts.push('<line x1="'+m.xo+'" x2="'+(m.xo+m.cw)+'" y1="'+py+'" y2="'+py+'" stroke="#e7eaf0"/>'); });
        }
        if (ap.showAxes) {
          parts.push('<line x1="'+m.xo+'" x2="'+(m.xo+m.cw)+'" y1="'+o.y+'" y2="'+o.y+'" stroke="#9aa3ae" stroke-width="1.5"/>');
          parts.push('<line x1="'+o.x+'" x2="'+o.x+'" y1="'+m.yo+'" y2="'+(m.yo+m.ch)+'" stroke="#9aa3ae" stroke-width="1.5"/>');
          xTicks.forEach(function(x,index){if(x!==0&&index%stride===0){var px=m.to(x,0).x;parts.push('<text x="'+px+'" y="'+(o.y+17)+'" text-anchor="middle" fill="#76828e" font-size="11">'+coordinate(x,squareStep)+'</text>');}});
          yTicks.forEach(function(y,index){if(y!==0&&index%stride===0){var py=m.to(0,y).y;parts.push('<text x="'+(o.x-9)+'" y="'+(py+4)+'" text-anchor="end" fill="#76828e" font-size="11">'+coordinate(y,squareStep)+'</text>');}});
          parts.push('<text x="'+(o.x-7)+'" y="'+(o.y+16)+'" text-anchor="end" fill="#76828e" font-size="11">0</text><text x="'+(m.xo+m.cw-5)+'" y="'+(o.y-10)+'" text-anchor="end" fill="#76828e" font-size="11" font-weight="700">x</text><text x="'+(o.x+10)+'" y="'+(m.yo+13)+'" fill="#76828e" font-size="11" font-weight="700">y</text>');
        }
        if (ap.showTrail && trail.length > 1) {
          var points = trail.map(function (a) { var tp=m.to(g.a*Math.cos(a),g.b*Math.sin(a)); return tp.x+','+tp.y; }).join(' ');
          parts.push('<polyline points="'+points+'" fill="none" stroke="'+esc(ap.pointColor)+'" stroke-width="6" stroke-linecap="round" opacity=".18"/>');
        }
        parts.push('<ellipse cx="'+o.x+'" cy="'+o.y+'" rx="'+(g.a*m.scale)+'" ry="'+(g.b*m.scale)+'" fill="none" stroke="'+esc(ap.curveColor)+'" stroke-width="'+ap.lineWidth+'"/>');
        if (ap.showHelperLines) {
          parts.push('<line x1="'+fl.x+'" y1="'+fl.y+'" x2="'+p.x+'" y2="'+p.y+'" stroke="'+esc(ap.helperColor)+'" stroke-width="2.25" stroke-dasharray="7 6"/>');
          parts.push('<line x1="'+fr.x+'" y1="'+fr.y+'" x2="'+p.x+'" y2="'+p.y+'" stroke="'+esc(ap.helperColor)+'" stroke-width="2.25" stroke-dasharray="7 6"/>');
        }
        parts.push('<circle cx="'+fl.x+'" cy="'+fl.y+'" r="6" fill="'+esc(ap.focusColor)+'"/><circle cx="'+fr.x+'" cy="'+fr.y+'" r="6" fill="'+esc(ap.focusColor)+'"/>');
        if (ap.showFocusLabels) parts.push('<text x="'+(fl.x-8)+'" y="'+(fl.y-13)+'" text-anchor="middle" font-size="14" font-weight="700">F₁</text><text x="'+(fr.x+8)+'" y="'+(fr.y-13)+'" text-anchor="middle" font-size="14" font-weight="700">F₂</text>');
        parts.push('<circle id="point" tabindex="0" role="slider" aria-label="椭圆上的动点 P" cx="'+p.x+'" cy="'+p.y+'" r="'+ap.pointRadius+'" fill="'+esc(ap.pointColor)+'" stroke="#fff" stroke-width="3"/>');
        if (ap.showPointLabel) parts.push('<text x="'+(p.x+15)+'" y="'+(p.y-14)+'" font-size="15" font-weight="750" pointer-events="none">P</text>');
        plot.innerHTML = parts.join('');
        document.getElementById('distance-left').textContent = s.dl.toFixed(2);
        document.getElementById('distance-right').textContent = s.dr.toFixed(2);
        document.getElementById('distance-sum').textContent = s.sum.toFixed(2) + ' = ' + g.major.toFixed(2);
        document.querySelectorAll('.individual').forEach(function (el) { el.hidden = !ap.showIndividualDistances; });
        document.getElementById('sum-card').hidden = !ap.showDistanceSum;
        document.getElementById('formula').hidden = !ap.showFormula;
        document.getElementById('zoom-output').value = Math.round(zoom*100)+'%';
        var point = document.getElementById('point');
        point.addEventListener('pointerdown', function (event) { dragging=true; point.setPointerCapture(event.pointerId); });
        point.addEventListener('keydown', function (event) { if (event.key.indexOf('Arrow')===0) { event.preventDefault(); angle += event.key==='ArrowLeft'||event.key==='ArrowDown' ? -.05 : .05; render(); } });
      }
      function setupInputs() {
        var major = scene.parameters.majorAxis, minor = scene.parameters.minorAxis;
        majorInput.min = String(Math.max(major.min, minor.value)); majorInput.max = String(major.max); majorInput.value = String(major.value);
        minorInput.min = String(minor.min); minorInput.max = String(Math.min(minor.max, major.value)); minorInput.value = String(minor.value);
        speedInput.value = String(scene.appearance.animationSpeed);
        document.getElementById('major-output').value = Number(major.value).toFixed(1);
        document.getElementById('minor-output').value = Number(minor.value).toFixed(1);
        document.getElementById('speed-output').value = Number(scene.appearance.animationSpeed).toFixed(2)+'×';
        document.getElementById('curve-color').value = scene.appearance.curveColor;
      }
      var toggleDefs = [['showAxes','坐标轴'],['showGrid','背景网格'],['showHelperLines','焦点辅助线'],['showIndividualDistances','单段距离'],['showDistanceSum','距离和'],['showFocusLabels','焦点标签'],['showPointLabel','动点标签'],['showFormula','公式说明'],['showTrail','运动轨迹']];
      toggleDefs.forEach(function (def) {
        var label=document.createElement('label'); label.className='toggle'; var text=document.createElement('span'); text.textContent=def[1]; var input=document.createElement('input'); input.type='checkbox'; input.checked=scene.appearance[def[0]]; input.addEventListener('change',function(){scene.appearance[def[0]]=input.checked;render();}); label.append(text,input); document.getElementById('toggles').append(label);
      });
      majorInput.addEventListener('input',function(){scene.parameters.majorAxis.value=Number(majorInput.value);if(scene.parameters.minorAxis.value>scene.parameters.majorAxis.value)scene.parameters.minorAxis.value=scene.parameters.majorAxis.value;zoom=1;setupInputs();render();});
      minorInput.addEventListener('input',function(){scene.parameters.minorAxis.value=Number(minorInput.value);zoom=1;setupInputs();render();});
      speedInput.addEventListener('input',function(){scene.appearance.animationSpeed=Number(speedInput.value);setupInputs();});
      document.getElementById('curve-color').addEventListener('input',function(event){scene.appearance.curveColor=event.target.value;render();});
      document.getElementById('play').addEventListener('click',function(){playing=!playing;document.getElementById('play').textContent=playing?'暂停':'播放';if(playing){lastFrame=performance.now();requestAnimationFrame(frame);}});
      document.getElementById('zoom-out').addEventListener('click',function(){zoom=Math.max(.5,Number((zoom-.1).toFixed(1)));render();});
      document.getElementById('zoom-in').addEventListener('click',function(){zoom=Math.min(1.6,Number((zoom+.1).toFixed(1)));render();});
      document.getElementById('zoom-fit').addEventListener('click',function(){zoom=1;render();});
      document.getElementById('reset').addEventListener('click',function(){scene=JSON.parse(JSON.stringify(initial));angle=scene.parameters.pointAngle.value;trail=[];zoom=1;playing=false;document.getElementById('play').textContent='播放';toggleDefs.forEach(function(def,index){document.querySelectorAll('#toggles input')[index].checked=scene.appearance[def[0]];});setupInputs();render();});
      plot.addEventListener('pointermove',function(event){if(!dragging)return;var rect=plot.getBoundingClientRect(), sx=(event.clientX-rect.left)/rect.width*width, sy=(event.clientY-rect.top)/rect.height*height,g=geometry(),m=mapper(viewport(g)),p=m.from(sx,sy);angle=Math.atan2(p.y/g.b,p.x/g.a);trail.push(angle);if(trail.length>180)trail.shift();render();});
      ['pointerup','pointercancel','pointerleave'].forEach(function(name){plot.addEventListener(name,function(){dragging=false;});});
      function frame(now){if(!playing)return;var delta=Math.min(.05,(now-lastFrame)/1000);lastFrame=now;angle+=delta*scene.appearance.animationSpeed;trail.push(angle);if(trail.length>180)trail.shift();render();requestAnimationFrame(frame);}
      setupInputs(); render();
    }());
  </script>
</body>
</html>`
}

function exportQuadraticSceneAsStandaloneHtml(scene: LessonScene): string {
  const sceneJson = safeJsonForScript(scene)
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${scene.metadata.title.replace(/[<>&"]/g, '')}</title>
  <style>
    :root{font-family:Inter,"PingFang SC","Microsoft YaHei",system-ui,sans-serif;color:#1f2933;background:#eef1f6}*{box-sizing:border-box}body{margin:0;min-height:100vh;background:radial-gradient(circle at 15% 10%,#fff 0,#f5f7fb 34%,#eceff5 100%)}.page{max-width:1240px;margin:auto;padding:32px 24px 48px}h1{margin:4px 0 8px;font-size:clamp(24px,3vw,38px);letter-spacing:-.04em}.eyebrow{color:#5b5bd6;font-size:12px;font-weight:800;letter-spacing:.12em;text-transform:uppercase}.summary{margin:0 0 24px;max-width:760px;color:#63707d;line-height:1.65}.layout{display:grid;grid-template-columns:minmax(0,1fr) 290px;gap:18px;align-items:start}.card{background:rgba(255,255,255,.94);border:1px solid #dde2e9;border-radius:22px;box-shadow:0 18px 55px rgba(37,45,65,.08)}.stage{padding:16px}.formula{display:flex;align-items:center;justify-content:space-between;gap:18px;margin-bottom:12px;padding:15px 18px;border-radius:15px;background:#28283e;color:white}.formula strong{font-family:Georgia,serif;font-size:21px;white-space:nowrap}.formula span{color:#d2d5e4;font-size:13px;line-height:1.5}.viewbar{display:flex;align-items:center;justify-content:flex-end;gap:5px;margin-bottom:8px}.viewbar span{margin-right:4px;color:#7c8793;font-size:12px}.viewbar output{min-width:48px;text-align:center;color:#5b5bd6;font-weight:750}button{border:0;border-radius:12px;padding:9px 14px;font:inherit;font-weight:750;cursor:pointer}.viewbar button,.secondary{color:#53606c;background:#edf0f5}svg{display:block;width:100%;border-radius:16px}.metrics{display:flex;gap:10px;margin-top:12px}.metric{flex:1;padding:12px 14px;border-radius:14px;background:#f4f6fa}.metric.vertex{background:#ecf7f4;color:#086b65}.metric span{display:block;color:#73808e;font-size:12px;margin-bottom:3px}.metric strong{font-size:18px;font-variant-numeric:tabular-nums}.toolbar{margin-top:14px}aside{padding:20px;position:sticky;top:18px}aside h2{margin:2px 0 18px;font-size:19px}.control{padding:14px 0;border-top:1px solid #edf0f4}.control-head{display:flex;justify-content:space-between;gap:12px;margin-bottom:10px;font-size:13px;font-weight:700}input[type=range]{width:100%;accent-color:#5b5bd6}.toggle,.color{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:8px 0;font-size:13px}.toggle input{width:18px;height:18px;accent-color:#5b5bd6}input[type=color]{width:44px;height:30px;padding:2px;border:1px solid #d9dee6;border-radius:8px;background:#fff}footer{margin-top:18px;color:#7a8693;font-size:12px;text-align:center}@media(max-width:820px){.page{padding:20px 12px 34px}.layout{grid-template-columns:1fr}aside{position:static}.metrics{flex-wrap:wrap}.metric{min-width:130px}.formula{display:block}.formula span{display:block;margin-top:8px}}
  </style>
</head>
<body>
  <main class="page">
    <span class="eyebrow">Interactive Lesson</span><h1 id="title"></h1><p class="summary" id="summary"></p>
    <div class="layout">
      <section class="card stage">
        <div class="formula" id="formula"><strong></strong><span></span></div>
        <div class="viewbar"><span>视图缩放</span><button id="zoom-out">−</button><output id="zoom-output">100%</output><button id="zoom-in">+</button><button id="zoom-fit">适应</button></div>
        <svg id="plot" viewBox="0 0 900 590" role="img" aria-label="二次函数顶点式交互图"></svg>
        <div class="metrics"><div class="metric"><span>开口</span><strong id="opening"></strong></div><div class="metric vertex"><span>顶点 (h, k)</span><strong id="vertex"></strong></div><div class="metric"><span>与 x 轴交点</span><strong id="roots"></strong></div></div>
        <div class="toolbar"><button class="secondary" id="reset">重置</button></div>
      </section>
      <aside class="card"><span class="eyebrow">场景设置</span><h2>调整参数与显示</h2>
        <div id="parameters"></div><div class="control" id="toggles"></div>
        <label class="color"><span>抛物线颜色</span><input id="curve-color" type="color"></label>
        <label class="color"><span>顶点颜色</span><input id="point-color" type="color"></label>
      </aside>
    </div>
    <footer>此文件由 Word2HTML 导出；参数计算和交互均在当前浏览器本地完成。</footer>
  </main>
  <script id="lesson-scene" type="application/json">${sceneJson}</script>
  <script>
    (function(){'use strict';
      var scene=JSON.parse(document.getElementById('lesson-scene').textContent),initial=JSON.parse(JSON.stringify(scene)),zoom=1,width=900,height=590,padding=24,plot=document.getElementById('plot');
      document.getElementById('title').textContent=scene.metadata.title;document.getElementById('summary').textContent=scene.metadata.summary;document.getElementById('formula').querySelector('strong').textContent=scene.annotations.formula;document.getElementById('formula').querySelector('span').textContent=scene.annotations.conclusion;
      function esc(v){return String(v).replace(/[&<>"']/g,function(c){return({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]})}
      function values(){return{a:scene.parameters.coefficientA.value,h:scene.parameters.vertexH.value,k:scene.parameters.vertexK.value}}
      function baseViewport(q){var r=6;return{xMin:Math.min(-1,q.h-r),xMax:Math.max(1,q.h+r),yMin:q.a>0?Math.min(-2,q.k-3):Math.min(-8,q.k-12),yMax:q.a>0?Math.max(8,q.k+12):Math.max(2,q.k+3)}}
      function viewport(q){var b=baseViewport(q),cx=(b.xMin+b.xMax)/2,cy=(b.yMin+b.yMax)/2,hw=(b.xMax-b.xMin)/2/zoom,hh=(b.yMax-b.yMin)/2/zoom;return{xMin:cx-hw,xMax:cx+hw,yMin:cy-hh,yMax:cy+hh}}
      function mapper(v){var pw=width-padding*2,ph=height-padding*2,target=pw/ph,cx=(v.xMin+v.xMax)/2,cy=(v.yMin+v.yMax)/2,xs=v.xMax-v.xMin,ys=v.yMax-v.yMin;if(xs/ys<target)xs=ys*target;else ys=xs/target;v={xMin:cx-xs/2,xMax:cx+xs/2,yMin:cy-ys/2,yMax:cy+ys/2};var s=Math.min(pw/xs,ph/ys),cw=xs*s,ch=ys*s,xo=(width-cw)/2,yo=(height-ch)/2;return{scale:s,xo:xo,yo:yo,cw:cw,ch:ch,v:v,to:function(x,y){return{x:xo+(x-v.xMin)*s,y:yo+(v.yMax-y)*s}}}}
      function gridStep(scale){var raw=62/scale,p=Math.pow(10,Math.floor(Math.log10(raw))),n=raw/p,c=[1,2,5,10],b=c[0];c.forEach(function(x){if(Math.abs(x-n)<Math.abs(b-n))b=x});return b*p}
      function ticks(min,max,step){var out=[],first=Math.ceil((min-step*1e-9)/step)*step;for(var n=first;n<=max+step*1e-9;n+=step)out.push(Number(n.toFixed(10)));return out}
      function coordinate(v,s){if(Math.abs(v)<s*1e-8)return'0';var d=s>=1?0:Math.min(3,Math.ceil(-Math.log10(s)));return String(Number(v.toFixed(d)))}
      function render(){var q=values(),m=mapper(viewport(q)),v=m.v,o=m.to(0,0),vertex=m.to(q.h,q.k),step=gridStep(m.scale),xt=ticks(v.xMin,v.xMax,step),yt=ticks(v.yMin,v.yMax,step),stride=Math.max(1,Math.ceil(42/(step*m.scale))),ap=scene.appearance,parts=['<rect width="900" height="590" rx="18" fill="#fbfcfe"/>'];
        if(ap.showGrid){xt.forEach(function(x){var p=m.to(x,0).x;parts.push('<line x1="'+p+'" x2="'+p+'" y1="'+m.yo+'" y2="'+(m.yo+m.ch)+'" stroke="#e7eaf0"/>')});yt.forEach(function(y){var p=m.to(0,y).y;parts.push('<line x1="'+m.xo+'" x2="'+(m.xo+m.cw)+'" y1="'+p+'" y2="'+p+'" stroke="#e7eaf0"/>')})}
        if(ap.showAxes){if(v.yMin<=0&&v.yMax>=0)parts.push('<line x1="'+m.xo+'" x2="'+(m.xo+m.cw)+'" y1="'+o.y+'" y2="'+o.y+'" stroke="#9aa3ae" stroke-width="1.5"/>');if(v.xMin<=0&&v.xMax>=0)parts.push('<line x1="'+o.x+'" x2="'+o.x+'" y1="'+m.yo+'" y2="'+(m.yo+m.ch)+'" stroke="#9aa3ae" stroke-width="1.5"/>');xt.forEach(function(x,i){if(x!==0&&i%stride===0&&v.yMin<=0&&v.yMax>=0){var p=m.to(x,0);parts.push('<text x="'+p.x+'" y="'+(o.y+17)+'" text-anchor="middle" fill="#76828e" font-size="11">'+coordinate(x,step)+'</text>')}});yt.forEach(function(y,i){if(y!==0&&i%stride===0&&v.xMin<=0&&v.xMax>=0){var p=m.to(0,y);parts.push('<text x="'+(o.x-9)+'" y="'+(p.y+4)+'" text-anchor="end" fill="#76828e" font-size="11">'+coordinate(y,step)+'</text>')}})}
        if(ap.showHelperLines)parts.push('<line x1="'+vertex.x+'" x2="'+vertex.x+'" y1="'+m.yo+'" y2="'+(m.yo+m.ch)+'" stroke="'+esc(ap.helperColor)+'" stroke-width="2" stroke-dasharray="7 6"/>');var path=[];for(var i=0;i<=240;i++){var x=v.xMin+(v.xMax-v.xMin)*i/240,y=q.a*Math.pow(x-q.h,2)+q.k,p=m.to(x,y);path.push((i?'L ':'M ')+p.x.toFixed(2)+' '+p.y.toFixed(2))}parts.push('<path d="'+path.join(' ')+'" fill="none" stroke="'+esc(ap.curveColor)+'" stroke-width="'+ap.lineWidth+'" stroke-linecap="round"/>');parts.push('<circle cx="'+vertex.x+'" cy="'+vertex.y+'" r="'+ap.pointRadius+'" fill="'+esc(ap.pointColor)+'" stroke="#fff" stroke-width="3"/>');if(ap.showPointLabel)parts.push('<text x="'+(vertex.x+15)+'" y="'+(vertex.y-14)+'" font-size="15" font-weight="750">V('+q.h.toFixed(2)+', '+q.k.toFixed(2)+')</text>');plot.innerHTML=parts.join('');var rt=-q.k/q.a,roots=rt<0?[]:rt===0?[q.h]:[q.h-Math.sqrt(rt),q.h+Math.sqrt(rt)];document.getElementById('opening').textContent=q.a>0?'向上':'向下';document.getElementById('vertex').textContent='('+q.h.toFixed(2)+', '+q.k.toFixed(2)+')';document.getElementById('roots').textContent=roots.length?roots.map(function(x){return x.toFixed(2)}).join('，'):'无实数根';document.getElementById('formula').hidden=!ap.showFormula;document.getElementById('zoom-output').value=Math.round(zoom*100)+'%'}
      var defs=[['coefficientA','二次项系数 a'],['vertexH','顶点横坐标 h'],['vertexK','顶点纵坐标 k']];function setup(){var box=document.getElementById('parameters');box.innerHTML='';defs.forEach(function(def){var p=scene.parameters[def[0]],wrap=document.createElement('div');wrap.className='control';wrap.innerHTML='<div class="control-head"><label>'+def[1]+'</label><output>'+Number(p.value).toFixed(2)+'</output></div><input type="range" min="'+p.min+'" max="'+p.max+'" step="'+p.step+'" value="'+p.value+'">';wrap.querySelector('input').addEventListener('input',function(e){var n=Number(e.target.value);if(def[0]==='coefficientA'&&Math.abs(n)<.1)n=p.value<0 ? .1 : -.1;scene.parameters[def[0]].value=n;zoom=1;setup();render()});box.append(wrap)});document.getElementById('curve-color').value=scene.appearance.curveColor;document.getElementById('point-color').value=scene.appearance.pointColor}
      [['showAxes','坐标轴'],['showGrid','背景网格'],['showHelperLines','对称轴'],['showPointLabel','顶点标签'],['showFormula','公式说明']].forEach(function(def){var label=document.createElement('label'),input=document.createElement('input');label.className='toggle';label.append(document.createTextNode(def[1]));input.type='checkbox';input.checked=scene.appearance[def[0]];input.addEventListener('change',function(){scene.appearance[def[0]]=input.checked;render()});label.append(input);document.getElementById('toggles').append(label)});
      document.getElementById('curve-color').addEventListener('input',function(e){scene.appearance.curveColor=e.target.value;render()});document.getElementById('point-color').addEventListener('input',function(e){scene.appearance.pointColor=e.target.value;render()});document.getElementById('zoom-out').addEventListener('click',function(){zoom=Math.max(.5,Number((zoom-.1).toFixed(1)));render()});document.getElementById('zoom-in').addEventListener('click',function(){zoom=Math.min(1.6,Number((zoom+.1).toFixed(1)));render()});document.getElementById('zoom-fit').addEventListener('click',function(){zoom=1;render()});document.getElementById('reset').addEventListener('click',function(){scene=JSON.parse(JSON.stringify(initial));zoom=1;setup();render()});setup();render();
    }());
  </script>
</body>
</html>`
}

function exportGenericFunctionSceneAsStandaloneHtml(scene: LessonScene): string {
  const sceneJson = safeJsonForScript(scene)
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${scene.metadata.title.replace(/[<>&"]/g, '')}</title>
  <style>
    :root{font-family:Inter,"PingFang SC","Microsoft YaHei",system-ui,sans-serif;color:#1f2933;background:#eef1f6}*{box-sizing:border-box}body{margin:0;min-height:100vh;background:radial-gradient(circle at 15% 10%,#fff 0,#f5f7fb 34%,#eceff5 100%)}.page{max-width:1240px;margin:auto;padding:32px 24px 48px}h1{margin:4px 0 8px;font-size:clamp(24px,3vw,38px);letter-spacing:-.04em}.eyebrow{color:#5b5bd6;font-size:12px;font-weight:800;letter-spacing:.12em;text-transform:uppercase}.summary{margin:0 0 24px;max-width:760px;color:#63707d;line-height:1.65}.layout{display:grid;grid-template-columns:minmax(0,1fr) 290px;gap:18px;align-items:start}.card{background:rgba(255,255,255,.94);border:1px solid #dde2e9;border-radius:22px;box-shadow:0 18px 55px rgba(37,45,65,.08)}.stage{padding:16px}.formula{display:flex;align-items:center;justify-content:space-between;gap:18px;margin-bottom:12px;padding:15px 18px;border-radius:15px;background:#28283e;color:white}.formula strong{font-family:Georgia,serif;font-size:21px}.formula span{color:#d2d5e4;font-size:13px;line-height:1.5}.viewbar{display:flex;align-items:center;justify-content:flex-end;gap:5px;margin-bottom:8px}.viewbar span{margin-right:4px;color:#7c8793;font-size:12px}.viewbar output{min-width:48px;text-align:center;color:#5b5bd6;font-weight:750}button{border:0;border-radius:12px;padding:9px 14px;font:inherit;font-weight:750;cursor:pointer}.viewbar button,.secondary{color:#53606c;background:#edf0f5}svg{display:block;width:100%;border-radius:16px}.metrics{display:flex;gap:10px;margin-top:12px}.metric{flex:1;padding:12px 14px;border-radius:14px;background:#f4f6fa}.metric.main{background:#ecf7f4;color:#086b65}.metric span{display:block;color:#73808e;font-size:12px;margin-bottom:3px}.metric strong{font-size:15px;line-height:1.4}.toolbar{margin-top:14px}aside{padding:20px;position:sticky;top:18px}aside h2{margin:2px 0 18px;font-size:19px}.control{padding:14px 0;border-top:1px solid #edf0f4}.control-head{display:flex;justify-content:space-between;gap:12px;margin-bottom:10px;font-size:13px;font-weight:700}input[type=range]{width:100%;accent-color:#5b5bd6}.toggle,.color{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:8px 0;font-size:13px}.toggle input{width:18px;height:18px;accent-color:#5b5bd6}input[type=color]{width:44px;height:30px;padding:2px;border:1px solid #d9dee6;border-radius:8px;background:#fff}.empty{padding:12px;border-radius:12px;background:#fff8e8;color:#7d6328;font-size:13px;line-height:1.5}footer{margin-top:18px;color:#7a8693;font-size:12px;text-align:center}@media(max-width:820px){.page{padding:20px 12px 34px}.layout{grid-template-columns:1fr}aside{position:static}.metrics{flex-wrap:wrap}.metric{min-width:130px}.formula{display:block}.formula span{display:block;margin-top:8px}}
  </style>
</head>
<body>
  <main class="page">
    <span class="eyebrow">Interactive Lesson</span><h1 id="title"></h1><p class="summary" id="summary"></p>
    <div class="layout">
      <section class="card stage">
        <div class="formula" id="formula"><strong></strong><span></span></div>
        <div class="viewbar"><span>视图缩放</span><button id="zoom-out">−</button><output id="zoom-output">100%</output><button id="zoom-in">+</button><button id="zoom-fit">适应</button></div>
        <svg id="plot" viewBox="0 0 900 590" role="img" aria-label="通用函数交互图"></svg>
        <div class="metrics"><div class="metric main"><span>函数</span><strong id="metric-formula"></strong></div><div class="metric"><span>定义域</span><strong id="domain"></strong></div><div class="metric"><span>当前参数</span><strong id="current-parameters"></strong></div></div>
        <div class="toolbar"><button class="secondary" id="reset">重置</button></div>
      </section>
      <aside class="card"><span class="eyebrow">场景设置</span><h2>调整参数与显示</h2>
        <div id="parameters"></div><div class="control" id="toggles"></div>
        <label class="color"><span>函数曲线颜色</span><input id="curve-color" type="color"></label>
        <div class="control"><div class="control-head"><label for="line-width">曲线线宽</label><output id="line-width-output"></output></div><input id="line-width" type="range" min="1" max="8" step="1"></div>
      </aside>
    </div>
    <footer>此文件由 Word2HTML 导出；表达式解析、参数计算和绘图均在当前浏览器本地完成。</footer>
  </main>
  <script id="lesson-scene" type="application/json">${sceneJson}</script>
  <script>
    (function(){'use strict';
      var scene=JSON.parse(document.getElementById('lesson-scene').textContent),initial=JSON.parse(JSON.stringify(scene)),zoom=1,width=900,height=590,padding=24,plot=document.getElementById('plot');
      var curve=scene.objects.find(function(item){return item.kind==='function-curve'}),expression=curve.bindings.expression,xMin=Number(curve.bindings.xMin),xMax=Number(curve.bindings.xMax),functionNames={sin:Math.sin,cos:Math.cos,tan:Math.tan,sqrt:Math.sqrt,abs:Math.abs,exp:Math.exp,log:Math.log,ln:Math.log,min:Math.min,max:Math.max,pow:Math.pow},arities={sin:[1,1],cos:[1,1],tan:[1,1],sqrt:[1,1],abs:[1,1],exp:[1,1],log:[1,1],ln:[1,1],min:[2,6],max:[2,6],pow:[2,2]},constants={pi:Math.PI,e:Math.E};
      document.getElementById('title').textContent=scene.metadata.title;document.getElementById('summary').textContent=scene.metadata.summary;document.getElementById('formula').querySelector('strong').textContent=scene.annotations.formula;document.getElementById('formula').querySelector('span').textContent=scene.annotations.conclusion;document.getElementById('metric-formula').textContent=scene.annotations.formula;document.getElementById('domain').textContent='['+xMin+', '+xMax+']';
      function esc(v){return String(v).replace(/[&<>"']/g,function(c){return({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]})}
      function tokenize(source){var out=[],i=0;while(i<source.length){var c=source[i],m;if(c.trim()===''){i++;continue}if(/[0-9.]/.test(c)){m=source.slice(i).match(/^(?:[0-9]+(?:[.][0-9]*)?|[.][0-9]+)/);if(!m)throw Error('数字格式错误');out.push({t:'n',v:Number(m[0])});i+=m[0].length;continue}if(/[A-Za-z_]/.test(c)){m=source.slice(i).match(/^[A-Za-z_][A-Za-z0-9_]*/);out.push({t:'i',v:m[0]});i+=m[0].length;continue}if('+-*/^'.indexOf(c)>=0)out.push({t:'o',v:c});else if(c==='(')out.push({t:'l'});else if(c===')')out.push({t:'r'});else if(c===',')out.push({t:'c'});else throw Error('不允许的表达式字符');i++}out.push({t:'e'});return out}
      function compile(source,allowed){var tokens=tokenize(source),index=0,depth=0;function peek(){return tokens[index]}function take(){return tokens[index++]}function nested(fn){depth++;if(depth>32)throw Error('表达式嵌套过深');try{return fn()}finally{depth--}}function add(){var node=mul(),token;while((token=peek()).t==='o'&&(token.v==='+'||token.v==='-')){take();node={k:'b',o:token.v,l:node,r:mul()}}return node}function mul(){var node=unary(),token;while((token=peek()).t==='o'&&(token.v==='*'||token.v==='/')){take();node={k:'b',o:token.v,l:node,r:unary()}}return node}function unary(){var token=peek();if(token.t==='o'&&(token.v==='+'||token.v==='-')){take();return{k:'u',o:token.v,n:nested(unary)}}return power()}function power(){var node=primary(),token=peek();if(token.t==='o'&&token.v==='^'){take();return{k:'b',o:'^',l:node,r:nested(unary)}}return node}function primary(){var token=take(),node,args,range;if(token.t==='n')return{k:'n',v:token.v};if(token.t==='l'){node=nested(add);if(take().t!=='r')throw Error('缺少右括号');return node}if(token.t!=='i')throw Error('表达式不完整');if(peek().t!=='l'){if(!allowed[token.v]&&constants[token.v]===undefined)throw Error('未知变量');return{k:'v',v:token.v}}if(!functionNames[token.v])throw Error('函数不在白名单');take();args=[];if(peek().t!=='r'){while(true){args.push(nested(add));if(peek().t!=='c')break;take()}}if(take().t!=='r')throw Error('函数缺少右括号');range=arities[token.v];if(args.length<range[0]||args.length>range[1])throw Error('函数参数数量错误');return{k:'f',v:token.v,a:args}}var root=add();if(peek().t!=='e')throw Error('表达式末尾有多余内容');function evaluate(node,scope){var a,b;if(node.k==='n')return node.v;if(node.k==='v')return constants[node.v]===undefined?scope[node.v]:constants[node.v];if(node.k==='u'){a=evaluate(node.n,scope);return node.o==='-'?-a:a}if(node.k==='b'){a=evaluate(node.l,scope);b=evaluate(node.r,scope);if(node.o==='+')return a+b;if(node.o==='-')return a-b;if(node.o==='*')return a*b;if(node.o==='/')return a/b;return Math.pow(a,b)}return functionNames[node.v].apply(null,node.a.map(function(item){return evaluate(item,scope)}))}return function(scope){return evaluate(root,scope)}}
      var allowed={x:true};Object.keys(scene.parameters).forEach(function(id){allowed[id]=true});var evaluate=compile(expression,allowed);
      function scope(){var out={};Object.keys(scene.parameters).forEach(function(id){out[id]=scene.parameters[id].value});return out}
      function samples(count){var out=[],values=scope();for(var i=0;i<count;i++){var x=xMin+(xMax-xMin)*i/(count-1),local=Object.assign({x:x},values);out.push({x:x,y:evaluate(local)})}return out}
      function baseViewport(){var ys=samples(401).map(function(p){return p.y}).filter(function(y){return Number.isFinite(y)&&Math.abs(y)<=1e6}).sort(function(a,b){return a-b}),lo=-5,hi=5;if(ys.length>=2){lo=Math.min(0,ys[Math.floor((ys.length-1)*.05)]);hi=Math.max(0,ys[Math.ceil((ys.length-1)*.95)]);if(hi-lo<2){var center=(lo+hi)/2;lo=center-1;hi=center+1}var margin=(hi-lo)*.12;lo-=margin;hi+=margin}return{xMin:xMin,xMax:xMax,yMin:lo,yMax:hi}}
      function viewport(){var b=baseViewport(),cx=(b.xMin+b.xMax)/2,cy=(b.yMin+b.yMax)/2,hw=(b.xMax-b.xMin)/2/zoom,hh=(b.yMax-b.yMin)/2/zoom;return{xMin:cx-hw,xMax:cx+hw,yMin:cy-hh,yMax:cy+hh}}
      function mapper(v){var pw=width-padding*2,ph=height-padding*2,target=pw/ph,cx=(v.xMin+v.xMax)/2,cy=(v.yMin+v.yMax)/2,xs=v.xMax-v.xMin,ys=v.yMax-v.yMin;if(xs/ys<target)xs=ys*target;else ys=xs/target;v={xMin:cx-xs/2,xMax:cx+xs/2,yMin:cy-ys/2,yMax:cy+ys/2};var s=Math.min(pw/xs,ph/ys),cw=xs*s,ch=ys*s,xo=(width-cw)/2,yo=(height-ch)/2;return{scale:s,xo:xo,yo:yo,cw:cw,ch:ch,v:v,to:function(x,y){return{x:xo+(x-v.xMin)*s,y:yo+(v.yMax-y)*s}}}}
      function gridStep(scale){var raw=62/scale,p=Math.pow(10,Math.floor(Math.log10(raw))),n=raw/p,c=[1,2,5,10],best=c[0];c.forEach(function(x){if(Math.abs(x-n)<Math.abs(best-n))best=x});return best*p}function ticks(min,max,step){var out=[],first=Math.ceil((min-step*1e-9)/step)*step;for(var n=first;n<=max+step*1e-9;n+=step)out.push(Number(n.toFixed(10)));return out}function coordinate(v,s){if(Math.abs(v)<s*1e-8)return'0';var d=s>=1?0:Math.min(3,Math.ceil(-Math.log10(s)));return String(Number(v.toFixed(d)))}
      function render(){var m=mapper(viewport()),v=m.v,o=m.to(0,0),step=gridStep(m.scale),xt=ticks(v.xMin,v.xMax,step),yt=ticks(v.yMin,v.yMax,step),stride=Math.max(1,Math.ceil(42/(step*m.scale))),ap=scene.appearance,parts=['<rect width="900" height="590" rx="18" fill="#fbfcfe"/>','<defs><clipPath id="clip"><rect x="'+m.xo+'" y="'+m.yo+'" width="'+m.cw+'" height="'+m.ch+'"/></clipPath></defs>'];if(ap.showGrid){xt.forEach(function(x){var p=m.to(x,0).x;parts.push('<line x1="'+p+'" x2="'+p+'" y1="'+m.yo+'" y2="'+(m.yo+m.ch)+'" stroke="#e7eaf0"/>')});yt.forEach(function(y){var p=m.to(0,y).y;parts.push('<line x1="'+m.xo+'" x2="'+(m.xo+m.cw)+'" y1="'+p+'" y2="'+p+'" stroke="#e7eaf0"/>')})}if(ap.showAxes){if(v.yMin<=0&&v.yMax>=0)parts.push('<line x1="'+m.xo+'" x2="'+(m.xo+m.cw)+'" y1="'+o.y+'" y2="'+o.y+'" stroke="#9aa3ae" stroke-width="1.5"/>');if(v.xMin<=0&&v.xMax>=0)parts.push('<line x1="'+o.x+'" x2="'+o.x+'" y1="'+m.yo+'" y2="'+(m.yo+m.ch)+'" stroke="#9aa3ae" stroke-width="1.5"/>');xt.forEach(function(x,i){if(x!==0&&i%stride===0&&v.yMin<=0&&v.yMax>=0){var p=m.to(x,0);parts.push('<text x="'+p.x+'" y="'+(o.y+17)+'" text-anchor="middle" fill="#76828e" font-size="11">'+coordinate(x,step)+'</text>')}});yt.forEach(function(y,i){if(y!==0&&i%stride===0&&v.xMin<=0&&v.xMax>=0){var p=m.to(0,y);parts.push('<text x="'+(o.x-9)+'" y="'+(p.y+4)+'" text-anchor="end" fill="#76828e" font-size="11">'+coordinate(y,step)+'</text>')}})}var path=[],drawing=false,previous=null;samples(801).forEach(function(sample){var finite=Number.isFinite(sample.y),jump=finite&&previous!==null&&Math.abs(sample.y-previous)*m.scale>height*1.5;if(!finite||jump){drawing=false;previous=finite?sample.y:null;return}var p=m.to(sample.x,sample.y);path.push((drawing?'L ':'M ')+p.x.toFixed(2)+' '+p.y.toFixed(2));drawing=true;previous=sample.y});parts.push('<path d="'+path.join(' ')+'" clip-path="url(#clip)" fill="none" stroke="'+esc(ap.curveColor)+'" stroke-width="'+ap.lineWidth+'" stroke-linecap="round" stroke-linejoin="round"/>');plot.innerHTML=parts.join('');document.getElementById('formula').hidden=!ap.showFormula;document.getElementById('zoom-output').value=Math.round(zoom*100)+'%';var names=Object.keys(scene.parameters);document.getElementById('current-parameters').textContent=names.length?names.map(function(id){return scene.parameters[id].label+'='+scene.parameters[id].value}).join('，'):'无可调参数';document.getElementById('line-width-output').value=ap.lineWidth+' px'}
      function setup(){var box=document.getElementById('parameters'),ids=Object.keys(scene.parameters);box.innerHTML='';if(!ids.length)box.innerHTML='<div class="empty">这个函数没有可调参数，仍可缩放和修改显示效果。</div>';ids.forEach(function(id){var p=scene.parameters[id],wrap=document.createElement('div');wrap.className='control';var head=document.createElement('div'),label=document.createElement('label'),output=document.createElement('output'),input=document.createElement('input');head.className='control-head';label.textContent=p.label;output.textContent=String(p.value);head.append(label,output);input.type='range';input.min=String(p.min);input.max=String(p.max);input.step=String(p.step);input.value=String(p.value);input.addEventListener('input',function(){p.value=Number(input.value);output.textContent=String(p.value);zoom=1;render()});wrap.append(head,input);box.append(wrap)});document.getElementById('curve-color').value=scene.appearance.curveColor;document.getElementById('line-width').value=String(scene.appearance.lineWidth)}
      [['showAxes','坐标轴'],['showGrid','背景网格'],['showFormula','公式说明']].forEach(function(def){var label=document.createElement('label'),input=document.createElement('input');label.className='toggle';label.append(document.createTextNode(def[1]));input.type='checkbox';input.checked=scene.appearance[def[0]];input.addEventListener('change',function(){scene.appearance[def[0]]=input.checked;render()});label.append(input);document.getElementById('toggles').append(label)});document.getElementById('curve-color').addEventListener('input',function(event){scene.appearance.curveColor=event.target.value;render()});document.getElementById('line-width').addEventListener('input',function(event){scene.appearance.lineWidth=Number(event.target.value);render()});document.getElementById('zoom-out').addEventListener('click',function(){zoom=Math.max(.5,Number((zoom-.1).toFixed(1)));render()});document.getElementById('zoom-in').addEventListener('click',function(){zoom=Math.min(1.6,Number((zoom+.1).toFixed(1)));render()});document.getElementById('zoom-fit').addEventListener('click',function(){zoom=1;render()});document.getElementById('reset').addEventListener('click',function(){scene=JSON.parse(JSON.stringify(initial));curve=scene.objects.find(function(item){return item.kind==='function-curve'});zoom=1;setup();render()});setup();render();
    }());
  </script>
</body>
</html>`
}

function standaloneMathParserRuntime(): string {
  return `
      var functionNames={sin:Math.sin,cos:Math.cos,tan:Math.tan,sqrt:Math.sqrt,abs:Math.abs,exp:Math.exp,log:Math.log,ln:Math.log,min:Math.min,max:Math.max,pow:Math.pow},arities={sin:[1,1],cos:[1,1],tan:[1,1],sqrt:[1,1],abs:[1,1],exp:[1,1],log:[1,1],ln:[1,1],min:[2,6],max:[2,6],pow:[2,2]},constants={pi:Math.PI,e:Math.E};
      function tokenize(source){var out=[],i=0;while(i<source.length){var c=source[i],m;if(c.trim()===''){i++;continue}if(/[0-9.]/.test(c)){m=source.slice(i).match(/^(?:[0-9]+(?:[.][0-9]*)?|[.][0-9]+)/);if(!m)throw Error('数字格式错误');out.push({t:'n',v:Number(m[0])});i+=m[0].length;continue}if(/[A-Za-z_]/.test(c)){m=source.slice(i).match(/^[A-Za-z_][A-Za-z0-9_]*/);out.push({t:'i',v:m[0]});i+=m[0].length;continue}if('+-*/^'.indexOf(c)>=0)out.push({t:'o',v:c});else if(c==='(')out.push({t:'l'});else if(c===')')out.push({t:'r'});else if(c===',')out.push({t:'c'});else throw Error('不允许的表达式字符');i++}out.push({t:'e'});return out}
      function compile(source,allowed){var tokens=tokenize(source),index=0,depth=0;function peek(){return tokens[index]}function take(){return tokens[index++]}function nested(fn){depth++;if(depth>32)throw Error('表达式嵌套过深');try{return fn()}finally{depth--}}function add(){var node=mul(),token;while((token=peek()).t==='o'&&(token.v==='+'||token.v==='-')){take();node={k:'b',o:token.v,l:node,r:mul()}}return node}function mul(){var node=unary(),token;while((token=peek()).t==='o'&&(token.v==='*'||token.v==='/')){take();node={k:'b',o:token.v,l:node,r:unary()}}return node}function unary(){var token=peek();if(token.t==='o'&&(token.v==='+'||token.v==='-')){take();return{k:'u',o:token.v,n:nested(unary)}}return power()}function power(){var node=primary(),token=peek();if(token.t==='o'&&token.v==='^'){take();return{k:'b',o:'^',l:node,r:nested(unary)}}return node}function primary(){var token=take(),node,args,range;if(token.t==='n')return{k:'n',v:token.v};if(token.t==='l'){node=nested(add);if(take().t!=='r')throw Error('缺少右括号');return node}if(token.t!=='i')throw Error('表达式不完整');if(peek().t!=='l'){if(!allowed[token.v]&&constants[token.v]===undefined)throw Error('未知变量');return{k:'v',v:token.v}}if(!functionNames[token.v])throw Error('函数不在白名单');take();args=[];if(peek().t!=='r'){while(true){args.push(nested(add));if(peek().t!=='c')break;take()}}if(take().t!=='r')throw Error('函数缺少右括号');range=arities[token.v];if(args.length<range[0]||args.length>range[1])throw Error('函数参数数量错误');return{k:'f',v:token.v,a:args}}var root=add();if(peek().t!=='e')throw Error('表达式末尾有多余内容');function evaluate(node,scope){var a,b;if(node.k==='n')return node.v;if(node.k==='v')return constants[node.v]===undefined?scope[node.v]:constants[node.v];if(node.k==='u'){a=evaluate(node.n,scope);return node.o==='-'?-a:a}if(node.k==='b'){a=evaluate(node.l,scope);b=evaluate(node.r,scope);if(node.o==='+')return a+b;if(node.o==='-')return a-b;if(node.o==='*')return a*b;if(node.o==='/')return a/b;return Math.pow(a,b)}return functionNames[node.v].apply(null,node.a.map(function(item){return evaluate(item,scope)}))}return function(scope){return evaluate(root,scope)}}`
}

function exportTimeExperimentSceneAsStandaloneHtml(scene: LessonScene): string {
  const sceneJson = safeJsonForScript(scene)
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${scene.metadata.title.replace(/[<>&"]/g, '')}</title>
  <style>
    :root{font-family:Inter,"PingFang SC","Microsoft YaHei",system-ui,sans-serif;color:#1f2933;background:#eef1f6}*{box-sizing:border-box}body{margin:0;min-height:100vh;background:radial-gradient(circle at 15% 10%,#fff 0,#f5f7fb 34%,#eceff5 100%)}.page{max-width:1240px;margin:auto;padding:32px 24px 48px}h1{margin:4px 0 8px;font-size:clamp(24px,3vw,38px);letter-spacing:-.04em}.eyebrow{color:#5b5bd6;font-size:12px;font-weight:800;letter-spacing:.12em}.summary{margin:0 0 24px;max-width:760px;color:#63707d;line-height:1.65}.layout{display:grid;grid-template-columns:minmax(0,1fr) 290px;gap:18px;align-items:start}.card{background:rgba(255,255,255,.94);border:1px solid #dde2e9;border-radius:22px;box-shadow:0 18px 55px rgba(37,45,65,.08)}.stage{padding:16px}.formula{display:flex;align-items:center;justify-content:space-between;gap:18px;margin-bottom:12px;padding:15px 18px;border-radius:15px;background:#28283e;color:white}.formula strong{font-family:Georgia,serif;font-size:21px}.formula span{color:#d2d5e4;font-size:13px;line-height:1.5}.viewbar{display:flex;align-items:center;justify-content:flex-end;gap:5px;margin-bottom:8px}.viewbar span{margin-right:4px;color:#7c8793;font-size:12px}.viewbar output{min-width:48px;text-align:center;color:#5b5bd6;font-weight:750}button{border:0;border-radius:12px;padding:9px 14px;font:inherit;font-weight:750;cursor:pointer}.viewbar button,.secondary{color:#53606c;background:#edf0f5}.primary{color:#fff;background:#5b5bd6}svg{display:block;width:100%;border-radius:16px}.metrics{display:flex;flex-wrap:wrap;gap:10px;margin-top:12px}.metric{flex:1;min-width:120px;padding:12px 14px;border-radius:14px;background:#f4f6fa}.metric.main{background:#ecf7f4;color:#086b65}.metric span{display:block;color:#73808e;font-size:12px;margin-bottom:3px}.metric strong{font-size:17px}.toolbar{display:flex;gap:8px;margin-top:14px}aside{padding:20px;position:sticky;top:18px}aside h2{margin:2px 0 18px;font-size:19px}.control{padding:14px 0;border-top:1px solid #edf0f4}.control-head{display:flex;justify-content:space-between;gap:12px;margin-bottom:10px;font-size:13px;font-weight:700}input[type=range]{width:100%;accent-color:#5b5bd6}.toggle,.color{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:8px 0;font-size:13px}.toggle input{width:18px;height:18px;accent-color:#5b5bd6}input[type=color]{width:44px;height:30px;padding:2px;border:1px solid #d9dee6;border-radius:8px;background:#fff}footer{margin-top:18px;color:#7a8693;font-size:12px;text-align:center}@media(max-width:820px){.page{padding:20px 12px 34px}.layout{grid-template-columns:1fr}aside{position:static}.formula{display:block}.formula span{display:block;margin-top:8px}}
  </style>
</head>
<body>
  <main class="page">
    <span class="eyebrow">INTERACTIVE EXPERIMENT</span><h1 id="title"></h1><p class="summary" id="summary"></p>
    <div class="layout">
      <section class="card stage">
        <div class="formula" id="formula"><strong></strong><span></span></div>
        <div class="viewbar"><span>视图缩放</span><button id="zoom-out">−</button><output id="zoom-output">100%</output><button id="zoom-in">+</button><button id="zoom-fit">适应</button></div>
        <svg id="plot" viewBox="0 0 900 590" role="img" aria-label="时间运动实验"></svg>
        <div class="metrics" id="metrics"><div class="metric main"><span>时间</span><strong id="time-value"></strong></div></div>
        <div class="toolbar"><button class="primary" id="play">播放</button><button class="secondary" id="reset">重置</button></div>
      </section>
      <aside class="card"><span class="eyebrow">场景设置</span><h2>调整参数与显示</h2><div id="parameters"></div><div class="control" id="toggles"></div><label class="color"><span>轨迹颜色</span><input id="curve-color" type="color"></label><label class="color"><span>运动物体颜色</span><input id="point-color" type="color"></label><label class="color"><span>基准线颜色</span><input id="helper-color" type="color"></label><div class="control"><div class="control-head"><label for="speed">动画速度</label><output id="speed-output"></output></div><input id="speed" type="range" min="0.2" max="2" step="0.05"></div></aside>
    </div><footer>此文件由 Word2HTML 导出；实验状态推进、表达式计算和绘图均在当前浏览器本地完成。</footer>
  </main>
  <script id="lesson-scene" type="application/json">${sceneJson}</script>
  <script>
    (function(){'use strict';
      var scene=JSON.parse(document.getElementById('lesson-scene').textContent),initial=JSON.parse(JSON.stringify(scene)),bodySpec=scene.objects.find(function(item){return item.kind==='time-point'}),vectorSpecs=scene.objects.filter(function(item){return item.kind==='vector'}),time=0,zoom=1,playing=false,lastFrame=0,width=900,height=590,padding=24,plot=document.getElementById('plot'),vectorColors=['#087E8B','#E08B2D','#7C3AED','#D13C64'];
      document.getElementById('title').textContent=scene.metadata.title;document.getElementById('summary').textContent=scene.metadata.summary;document.getElementById('formula').querySelector('strong').textContent=scene.annotations.formula;document.getElementById('formula').querySelector('span').textContent=scene.annotations.conclusion;
      function esc(v){return String(v).replace(/[&<>"']/g,function(c){return({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]})}
      ${standaloneMathParserRuntime()}
      var allowed={t:true};Object.keys(scene.parameters).forEach(function(id){allowed[id]=true});var durationEval=compile(bodySpec.bindings.durationExpression,allowed),xEval=compile(bodySpec.bindings.xExpression,allowed),yEval=compile(bodySpec.bindings.yExpression,allowed),metricEvals=scene.derivedValues.map(function(metric){return compile(metric.expression,allowed)}),vectorEvals=vectorSpecs.map(function(vector){return{x:compile(vector.bindings.xExpression,allowed),y:compile(vector.bindings.yExpression,allowed)}});
      function scope(t){var out={t:t};Object.keys(scene.parameters).forEach(function(id){out[id]=scene.parameters[id].value});return out}function duration(){return durationEval(scope(0))}function state(t){var local=scope(t);return{x:xEval(local),y:yEval(local),metrics:metricEvals.map(function(metric){return metric(local)}),vectors:vectorSpecs.map(function(vector,index){var x=vectorEvals[index].x(local),y=vectorEvals[index].y(local);return{spec:vector,x:x,y:y,magnitude:Math.hypot(x,y)}})}}function samples(count,end){var out=[];for(var i=0;i<count;i++){var t=count===1?end:end*i/(count-1),s=state(t);out.push({x:s.x,y:s.y,t:t})}return out}
      function baseViewport(){var points=samples(121,duration()),xs=points.map(function(p){return p.x}),ys=points.map(function(p){return p.y});points.forEach(function(point){var current=state(point.t);current.vectors.forEach(function(vector){var scale=Number(vector.spec.bindings.scale);xs.push(current.x+vector.x*scale);ys.push(current.y+vector.y*scale)})});var x0=Math.min.apply(null,[0].concat(xs)),x1=Math.max.apply(null,[0].concat(xs)),y0=Math.min.apply(null,[0].concat(ys)),y1=Math.max.apply(null,[0].concat(ys)),xm=Math.max(2,(x1-x0)*.15),ym=Math.max(1,(y1-y0)*.1);x0-=xm;x1+=xm;y0-=ym*.35;y1+=ym;if(y1-y0<4){var center=(y0+y1)/2;y0=center-2;y1=center+2}return{xMin:x0,xMax:x1,yMin:y0,yMax:y1}}
      function viewport(){var b=baseViewport(),cx=(b.xMin+b.xMax)/2,cy=(b.yMin+b.yMax)/2,hw=(b.xMax-b.xMin)/2/zoom,hh=(b.yMax-b.yMin)/2/zoom;return{xMin:cx-hw,xMax:cx+hw,yMin:cy-hh,yMax:cy+hh}}function mapper(v){var pw=width-padding*2,ph=height-padding*2,target=pw/ph,cx=(v.xMin+v.xMax)/2,cy=(v.yMin+v.yMax)/2,xs=v.xMax-v.xMin,ys=v.yMax-v.yMin;if(xs/ys<target)xs=ys*target;else ys=xs/target;v={xMin:cx-xs/2,xMax:cx+xs/2,yMin:cy-ys/2,yMax:cy+ys/2};var scale=Math.min(pw/xs,ph/ys),cw=xs*scale,ch=ys*scale,xo=(width-cw)/2,yo=(height-ch)/2;return{scale:scale,xo:xo,yo:yo,cw:cw,ch:ch,v:v,to:function(x,y){return{x:xo+(x-v.xMin)*scale,y:yo+(v.yMax-y)*scale}}}}function gridStep(scale){var raw=62/scale,p=Math.pow(10,Math.floor(Math.log10(raw))),n=raw/p,c=[1,2,5,10],best=c[0];c.forEach(function(x){if(Math.abs(x-n)<Math.abs(best-n))best=x});return best*p}function ticks(min,max,step){var out=[],first=Math.ceil((min-step*1e-9)/step)*step;for(var n=first;n<=max+step*1e-9;n+=step)out.push(Number(n.toFixed(10)));return out}function coordinate(v,s){if(Math.abs(v)<s*1e-8)return'0';var d=s>=1?0:Math.min(3,Math.ceil(-Math.log10(s)));return String(Number(v.toFixed(d)))}
      function render(){var total=duration();time=Math.min(time,total);var current=state(time),m=mapper(viewport()),v=m.v,o=m.to(0,0),body=m.to(current.x,current.y),step=gridStep(m.scale),xt=ticks(v.xMin,v.xMax,step),yt=ticks(v.yMin,v.yMax,step),stride=Math.max(1,Math.ceil(42/(step*m.scale))),ap=scene.appearance,parts=['<rect width="900" height="590" rx="18" fill="#fbfcfe"/>','<defs><clipPath id="clip"><rect x="'+m.xo+'" y="'+m.yo+'" width="'+m.cw+'" height="'+m.ch+'"/></clipPath></defs>'];if(ap.showGrid){xt.forEach(function(x){var p=m.to(x,0).x;parts.push('<line x1="'+p+'" x2="'+p+'" y1="'+m.yo+'" y2="'+(m.yo+m.ch)+'" stroke="#e7eaf0"/>')});yt.forEach(function(y){var p=m.to(0,y).y;parts.push('<line x1="'+m.xo+'" x2="'+(m.xo+m.cw)+'" y1="'+p+'" y2="'+p+'" stroke="#e7eaf0"/>')})}if(ap.showAxes){if(v.yMin<=0&&v.yMax>=0)parts.push('<line x1="'+m.xo+'" x2="'+(m.xo+m.cw)+'" y1="'+o.y+'" y2="'+o.y+'" stroke="#9aa3ae" stroke-width="1.5"/>');if(v.xMin<=0&&v.xMax>=0)parts.push('<line x1="'+o.x+'" x2="'+o.x+'" y1="'+m.yo+'" y2="'+(m.yo+m.ch)+'" stroke="#9aa3ae" stroke-width="1.5"/>');yt.forEach(function(y,i){if(y!==0&&i%stride===0&&v.xMin<=0&&v.xMax>=0){var p=m.to(0,y);parts.push('<text x="'+(o.x-9)+'" y="'+(p.y+4)+'" text-anchor="end" fill="#76828e" font-size="11">'+coordinate(y,step)+'</text>')}})}parts.push('<line x1="'+m.xo+'" x2="'+(m.xo+m.cw)+'" y1="'+o.y+'" y2="'+o.y+'" stroke="'+esc(ap.helperColor)+'" stroke-width="5" opacity=".72"/>');if(ap.showTrail&&time>0){var trail=samples(181,time).map(function(p){var q=m.to(p.x,p.y);return q.x.toFixed(2)+','+q.y.toFixed(2)}).join(' ');parts.push('<polyline points="'+trail+'" clip-path="url(#clip)" fill="none" stroke="'+esc(ap.curveColor)+'" stroke-width="'+ap.lineWidth+'" opacity=".48"/>')}if(ap.showHelperLines){current.vectors.forEach(function(vector,index){var scale=Number(vector.spec.bindings.scale),raw=m.to(current.x+vector.x*scale,current.y+vector.y*scale),dx=raw.x-body.x,dy=raw.y-body.y,length=Math.hypot(dx,dy);if(length<.75)return;var shown=Math.min(length,130),ux=dx/length,uy=dy/length,tx=body.x+ux*shown,ty=body.y+uy*shown,hl=Math.min(12,Math.max(8,shown*.22)),hw=hl*.48,bx=tx-ux*hl,by=ty-uy*hl,px=-uy,py=ux,color=vectorColors[index%vectorColors.length],lx=Math.min(890,Math.max(10,tx+px*(16+index*4))),ly=Math.min(582,Math.max(15,ty+py*(16+index*4))),anchor=px<-.2?'end':'start';parts.push('<line x1="'+body.x+'" y1="'+body.y+'" x2="'+tx+'" y2="'+ty+'" stroke="'+color+'" stroke-width="3" stroke-linecap="round"/>','<polygon points="'+tx+','+ty+' '+(bx+px*hw)+','+(by+py*hw)+' '+(bx-px*hw)+','+(by-py*hw)+'" fill="'+color+'"/>','<text x="'+lx+'" y="'+ly+'" text-anchor="'+anchor+'" fill="'+color+'" font-size="12" font-weight="750">'+esc(vector.spec.label||vector.spec.role)+' '+vector.magnitude.toFixed(2)+' '+esc(vector.spec.unit||'')+'</text>')})}parts.push('<circle cx="'+body.x+'" cy="'+body.y+'" r="'+(ap.pointRadius+3)+'" fill="'+esc(ap.pointColor)+'" stroke="#fff" stroke-width="3"/>');if(ap.showPointLabel)parts.push('<text x="'+(body.x+17)+'" y="'+(body.y-15)+'" fill="#36404a" font-size="14" font-weight="750">P('+current.x.toFixed(2)+', '+current.y.toFixed(2)+')</text>');plot.innerHTML=parts.join('');document.getElementById('formula').hidden=!ap.showFormula;document.getElementById('zoom-output').value=Math.round(zoom*100)+'%';document.getElementById('time-value').textContent=time.toFixed(2)+' / '+total.toFixed(2)+' s';scene.derivedValues.forEach(function(metric,index){document.getElementById('metric-'+metric.id).textContent=current.metrics[index].toFixed(2)+' '+metric.unit});document.getElementById('speed-output').value=ap.animationSpeed.toFixed(2)+'×'}
      function setup(){var box=document.getElementById('parameters');box.innerHTML='';Object.keys(scene.parameters).forEach(function(id){var p=scene.parameters[id],wrap=document.createElement('div'),head=document.createElement('div'),label=document.createElement('label'),output=document.createElement('output'),input=document.createElement('input');wrap.className='control';head.className='control-head';label.textContent=p.label;output.textContent=String(p.value);head.append(label,output);input.type='range';input.min=String(p.min);input.max=String(p.max);input.step=String(p.step);input.value=String(p.value);input.addEventListener('input',function(){p.value=Number(input.value);output.textContent=String(p.value);time=0;playing=false;document.getElementById('play').textContent='播放';zoom=1;render()});wrap.append(head,input);box.append(wrap)});document.getElementById('curve-color').value=scene.appearance.curveColor;document.getElementById('point-color').value=scene.appearance.pointColor;document.getElementById('helper-color').value=scene.appearance.helperColor;document.getElementById('speed').value=String(scene.appearance.animationSpeed)}
      scene.derivedValues.forEach(function(metric){var card=document.createElement('div'),label=document.createElement('span'),value=document.createElement('strong');card.className='metric';label.textContent=metric.label;value.id='metric-'+metric.id;card.append(label,value);document.getElementById('metrics').append(card)});[['showAxes','坐标轴'],['showGrid','背景网格'],['showHelperLines','速度与加速度矢量'],['showTrail','运动轨迹'],['showPointLabel','运动物体标签'],['showFormula','公式说明']].forEach(function(def){var label=document.createElement('label'),input=document.createElement('input');label.className='toggle';label.append(document.createTextNode(def[1]));input.type='checkbox';input.checked=scene.appearance[def[0]];input.addEventListener('change',function(){scene.appearance[def[0]]=input.checked;render()});label.append(input);document.getElementById('toggles').append(label)});function color(id,key){document.getElementById(id).addEventListener('input',function(event){scene.appearance[key]=event.target.value;render()})}color('curve-color','curveColor');color('point-color','pointColor');color('helper-color','helperColor');document.getElementById('speed').addEventListener('input',function(event){scene.appearance.animationSpeed=Number(event.target.value);render()});document.getElementById('zoom-out').addEventListener('click',function(){zoom=Math.max(.5,Number((zoom-.1).toFixed(1)));render()});document.getElementById('zoom-in').addEventListener('click',function(){zoom=Math.min(1.6,Number((zoom+.1).toFixed(1)));render()});document.getElementById('zoom-fit').addEventListener('click',function(){zoom=1;render()});document.getElementById('play').addEventListener('click',function(){if(time>=duration())time=0;playing=!playing;document.getElementById('play').textContent=playing?'暂停':'播放';lastFrame=performance.now();if(playing)requestAnimationFrame(frame)});document.getElementById('reset').addEventListener('click',function(){scene=JSON.parse(JSON.stringify(initial));bodySpec=scene.objects.find(function(item){return item.kind==='time-point'});time=0;zoom=1;playing=false;document.getElementById('play').textContent='播放';setup();render()});function frame(now){if(!playing)return;var delta=Math.min(.05,(now-lastFrame)/1000);lastFrame=now;time+=delta*scene.appearance.animationSpeed*2;if(time>=duration()){time=duration();playing=false;document.getElementById('play').textContent='播放'}render();if(playing)requestAnimationFrame(frame)}setup();render();
    }());
  </script>
</body>
</html>`
}

export function exportSceneAsStandaloneHtml(scene: LessonScene): string {
  if (scene.templateRef.id === 'math.conic.ellipse-focus-sum') {
    return exportEllipseSceneAsStandaloneHtml(scene)
  }
  if (scene.templateRef.id === 'math.function.quadratic-vertex') {
    return exportQuadraticSceneAsStandaloneHtml(scene)
  }
  if (scene.templateRef.id === 'math.function.generic-2d') {
    return exportGenericFunctionSceneAsStandaloneHtml(scene)
  }
  if (scene.templateRef.id === 'experiment.motion.point-2d') {
    return exportTimeExperimentSceneAsStandaloneHtml(scene)
  }
  throw new Error(`当前无法导出模板：${scene.templateRef.id}`)
}
