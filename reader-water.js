(function () {
  'use strict';
  function WaterOrb(svg, button) {
    this.svg = svg;
    this.button = button;
    this.front = svg.querySelector('.water-front');
    this.back = svg.querySelector('.water-back');
    this.pour = svg.querySelector('.water-pour');
    this.drops = svg.querySelectorAll('.water-drop');
    this.phase = Math.random() * Math.PI * 2;
    this.rate = .85 + Math.random() * .3;
    this.level = this.target = this.energy = this.tilt = this.velocity = 0;
    this.speaker = null;
    this.particles = [];
    this.reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.draw(0, 0);
  }
  WaterOrb.prototype.activity = function (level, speaker) {
    if (this.filling) return;
    var next = Math.max(0, Math.min(1, level || 0));
    var impulse = Math.abs(next - this.target);
    this.target = next;
    this.speaker = speaker;
    if (speaker) this.direction = speaker === 'user' ? -1 : 1;
    if (this.reduced) return;
    this.energy = Math.min(7, this.energy + impulse * 9);
    this.velocity += (Math.random() - .5) * impulse * 26;
    if (impulse > .09 && this.particles.length < this.drops.length) {
      this.particles.push({ x: 30 + Math.random() * 40, y: 48,
        vx: (Math.random() - .5) * 35, vy: -25 - impulse * 45,
        radius: 1 + Math.random() * 1.3, age: 0 });
    }
  };
  WaterOrb.prototype.start = function () {
    if (this.frame || this.reduced) return;
    var self = this;
    this.last = null;
    function tick(now) {
      var dt = self.last === null ? 0 : Math.min(.05, (now - self.last) / 1000);
      self.last = now;
      if (self.filling && self.loadingStarted === null) self.loadingStarted = now;
      self.level += (self.target - self.level) * (1 - Math.exp(-dt * 12));
      self.phase += dt * self.rate * (.8 + self.level + (self.speaker === 'assistant' ? 2 : 0));
      self.energy *= Math.exp(-dt * 3);
      self.velocity += (-self.tilt * 16 - self.velocity * 5) * dt;
      self.tilt = Math.max(-6, Math.min(6, self.tilt + self.velocity * dt));
      self.particles = self.particles.filter(function (drop) {
        drop.age += dt; drop.vy += 110 * dt;
        drop.x += drop.vx * dt; drop.y += drop.vy * dt;
        return drop.age < .8 && drop.y < 57;
      });
      var progress = self.filling ? Math.min(1, (now - self.loadingStarted) / 2800) : 1;
      self.draw(self.phase, self.filling ? 1.2 : 2 + self.level * 4 + self.energy, 100 - 50 * (1 - Math.pow(1 - progress, 2)));
      var scale = 1 + self.level * (self.direction || 1) * .18;
      self.button.style.setProperty('--voice-scale', scale.toFixed(3));
      self.frame = window.requestAnimationFrame(tick);
    }
    this.frame = window.requestAnimationFrame(tick);
  };
  WaterOrb.prototype.load = function () {
    if (this.filling) return;
    this.stop(); this.filling = true; this.loadingStarted = null;
    if (this.pour) this.pour.setAttribute('opacity', '1');
    this.draw(0, this.reduced ? 0 : 1.2, this.reduced ? 75 : 100);
    this.start();
  };
  WaterOrb.prototype.ready = function () {
    this.filling = false;
    if (this.pour) this.pour.setAttribute('opacity', '0');
    this.draw(this.phase, this.reduced ? 0 : 2, 50);
    this.start();
  };
  WaterOrb.prototype.draw = function (phase, amplitude, height) {
    var self = this;
    var surfaceY = height === undefined ? 50 : height;
    function surface(offset) {
      var path = '';
      for (var x = -8; x <= 108; x += 4) {
        var y = surfaceY + Math.sin(x * .075 + phase + offset) * amplitude
          + Math.sin(x * .12 - phase * 1.3 + offset) * amplitude * .3 + self.tilt * (x - 50) * .045;
        path += (x === -8 ? 'M' : ' L') + x + ' ' + y.toFixed(2);
      }
      return path + ' L108 108 L-8 108 Z';
    }
    this.back.setAttribute('d', surface(2.2));
    this.front.setAttribute('d', surface(0));
    if (this.pour && this.filling) this.pour.setAttribute('d', 'M50 0 Q' + (50 + Math.sin(phase * 2) * 1.3).toFixed(2) + ' ' + (surfaceY * .5).toFixed(2) + ' 50 ' + surfaceY.toFixed(2));
    Array.prototype.forEach.call(this.drops, function (node, index) {
      var drop = self.particles[index];
      node.setAttribute('opacity', drop ? Math.min(1, (1 - drop.age / .8) * 1.4).toFixed(2) : '0');
      if (drop) {
        node.setAttribute('cx', drop.x.toFixed(2)); node.setAttribute('cy', drop.y.toFixed(2));
        node.setAttribute('r', drop.radius.toFixed(2));
      }
    });
  };
  WaterOrb.prototype.stop = function () {
    if (this.frame) window.cancelAnimationFrame(this.frame);
    this.frame = null;
    this.filling = false; this.loadingStarted = null;
    if (this.pour) this.pour.setAttribute('opacity', '0');
    this.level = this.target = this.energy = this.tilt = this.velocity = 0;
    this.particles = [];
    this.button.style.setProperty('--voice-scale', '1');
    this.draw(0, 0);
  };
  window.ReaderWaterOrb = WaterOrb;
})();
