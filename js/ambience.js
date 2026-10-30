import { moodOf, elshOf } from './moods.js';

const BEAD_PITCH_PX = 40; // matches .bead width + gap in style.css

// Drifts the ambient background toward the latest mood and draws the mood ribbon.
export class Ambience {
  constructor({ root, ribbon }) { this.root = root; this.ribbon = ribbon; }

  update(states) {
    const classified = states.filter((s) => s.label !== 'pending');
    const latest = classified.at(-1);
    this.root.style.setProperty('--ambient', latest ? moodOf(latest.label).hue : '#efe8d8');
    this.renderRibbon(classified);
  }

  // Shows only as many beads as fit; the oldest fall off the left.
  renderRibbon(allClassified) {
    const capacity = Math.max(1, Math.floor(this.ribbon.clientWidth / BEAD_PITCH_PX));
    const classified = allClassified.slice(-capacity);
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
