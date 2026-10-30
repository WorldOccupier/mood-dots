import { moodOf, elshOf } from './moods.js';

// Drifts the ambient background toward the latest mood and draws the mood ribbon.
export class Ambience {
  constructor({ root, ribbon }) { this.root = root; this.ribbon = ribbon; }

  update(states) {
    const classified = states.filter((s) => s.label !== 'pending');
    const latest = classified.at(-1);
    this.root.style.setProperty('--ambient', latest ? moodOf(latest.label).hue : '#efe8d8');
    this.renderRibbon(classified);
  }

  renderRibbon(classified) {
    const existing = this.ribbon.children;
    classified.forEach((state, i) => {
      const mood = moodOf(state.label);
      let node = existing[i];
      if (!node) { node = document.createElement('span'); node.className = 'bead'; node.textContent = '.'; this.ribbon.append(node); }
      node.style.setProperty('--mood', mood.hue);
      node.style.fontVariationSettings = `"ELSH" ${elshOf(state.label)}`;
      node.title = state.label;
    });
    while (existing.length > classified.length) existing[existing.length - 1].remove();
  }
}
