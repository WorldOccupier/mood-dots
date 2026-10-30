// Lightweight canvas particle bursts emitted from dot positions when a shape changes.
export class ParticleField {
  constructor(canvas) {
    this.canvas = canvas; this.ctx = canvas.getContext('2d'); this.particles = [];
    this.resize(); addEventListener('resize', () => this.resize());
  }
  resize() {
    const ratio = devicePixelRatio || 1;
    this.canvas.width = innerWidth * ratio; this.canvas.height = innerHeight * ratio;
    this.ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  }
  burst(x, y, color, count = 9) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2, speed = 20 + Math.random() * 70;
      this.particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 20,
        life: 0, ttl: 0.7 + Math.random() * 0.6, size: 0.6 + Math.random() * 1.6, color });
    }
  }
  step(dt) {
    const { ctx } = this;
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    ctx.globalCompositeOperation = 'lighter';
    this.particles = this.particles.filter((p) => (p.life += dt) < p.ttl);
    for (const p of this.particles) {
      p.vx *= 0.96; p.vy = p.vy * 0.96 + 8 * dt; p.x += p.vx * dt; p.y += p.vy * dt;
      const fade = 1 - p.life / p.ttl;
      ctx.globalAlpha = fade * fade; ctx.fillStyle = p.color; ctx.shadowColor = p.color; ctx.shadowBlur = 8;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (0.5 + fade), 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}
